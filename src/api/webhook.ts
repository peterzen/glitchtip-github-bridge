import { WebhookPayloadSchema, parseAttachments } from '../models.js'
import { buildErrorBody } from '../formatters.js'
import type { Config } from '../config.js'
import type { GithubClient } from '../backends/github.js'
import type { GlitchtipClient } from '../backends/glitchtip.js'

interface AttachmentResult {
  glitchtipIssueId: string
  status: 'created' | 'duplicate' | 'error'
  issue?: string
}

interface WebhookResponse {
  status: number
  body: {
    results: AttachmentResult[]
    summary: { created: number; duplicates: number; errors: number }
  }
}

export function createWebhookHandler(
  config: Config,
  github: GithubClient,
  glitchtip: GlitchtipClient,
) {
  return async function handleWebhook(
    rawBody: string,
    secret: string,
  ): Promise<WebhookResponse> {
    // Secret validation
    if (config.webhookSecret && secret !== config.webhookSecret) {
      return {
        status: 401,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    // Parse and validate payload
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return {
        status: 400,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    const validation = WebhookPayloadSchema.safeParse(parsed)
    if (!validation.success) {
      return {
        status: 400,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    const attachments = parseAttachments(validation.data)
    const results: AttachmentResult[] = []

    for (const attachment of attachments) {
      // Deduplication check (fail-open)
      if (await github.isDuplicate(attachment.glitchtipIssueId)) {
        console.log(`Duplicate: GlitchTip issue ${attachment.glitchtipIssueId} already has a GitHub Issue`)
        results.push({ glitchtipIssueId: attachment.glitchtipIssueId, status: 'duplicate' })
        continue
      }

      // Enrich via GlitchTip API (failure does not block creation)
      let issue = null
      let event = null
      try {
        ;[issue, event] = await Promise.all([
          glitchtip.fetchIssue(attachment.glitchtipIssueId),
          glitchtip.fetchLatestEvent(attachment.glitchtipIssueId),
        ])
      } catch (err) {
        console.error(
          `GlitchTip enrichment failed for ${attachment.glitchtipIssueId}:`,
          (err as Error).message,
        )
      }

      const body = buildErrorBody(attachment, issue, event)
      const result = await github.createIssue(
        `[GlitchTip] ${attachment.errorTitle}`,
        body,
        ['bug', 'glitchtip'],
      )

      if (!result.ok) {
        console.error(`GitHub API error (${result.status}):`, result.data)
        results.push({ glitchtipIssueId: attachment.glitchtipIssueId, status: 'error' })
        continue
      }

      console.log(`Created GitHub Issue #${result.data?.number}: ${attachment.errorTitle}`)
      results.push({
        glitchtipIssueId: attachment.glitchtipIssueId,
        status: 'created',
        issue: result.data?.html_url,
      })
    }

    const created = results.filter((r) => r.status === 'created').length
    const duplicates = results.filter((r) => r.status === 'duplicate').length
    const errors = results.filter((r) => r.status === 'error').length
    const status = errors > 0 && created === 0 ? 502 : created > 0 ? 201 : 200

    return { status, body: { results, summary: { created, duplicates, errors } } }
  }
}
