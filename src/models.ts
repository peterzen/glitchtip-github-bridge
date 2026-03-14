import { z } from 'zod'

// --- Webhook payload schemas ---

export const WebhookFieldSchema = z.object({
  title: z.string(),
  value: z.string(),
  short: z.boolean().optional(),
})

export const WebhookAttachmentSchema = z.object({
  title: z.string(),
  title_link: z.string(),
  text: z.string().optional(),
  color: z.string().optional(),
  image_url: z.string().optional(),
  fields: z.array(WebhookFieldSchema).optional(),
})

export const WebhookPayloadSchema = z.object({
  alias: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(WebhookAttachmentSchema).optional(),
})

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookAttachment = z.infer<typeof WebhookAttachmentSchema>

// --- Parsed attachment ---

export interface ParsedAttachment {
  errorTitle: string
  glitchtipUrl: string
  glitchtipIssueId: string
  context: string
  project: string
  environment: string
  serverName: string
  release: string
}

const ISSUE_ID_REGEX = /\/issues\/(\d+)/

export function parseAttachments(payload: WebhookPayload): ParsedAttachment[] {
  const attachments = payload.attachments ?? []
  const results: ParsedAttachment[] = []

  for (const attachment of attachments) {
    const idMatch = attachment.title_link.match(ISSUE_ID_REGEX)
    if (!idMatch) continue

    const fields: Record<string, string> = {}
    for (const f of attachment.fields ?? []) {
      fields[f.title.toLowerCase()] = f.value
    }

    results.push({
      errorTitle: attachment.title,
      glitchtipUrl: attachment.title_link,
      glitchtipIssueId: idMatch[1],
      context: attachment.text ?? '',
      project: fields['project'] ?? '',
      environment: fields['environment'] ?? '',
      serverName: fields['server name'] ?? '',
      release: fields['release'] ?? '',
    })
  }

  return results
}

// --- GlitchTip issue schema ---

export const GlitchtipIssueSchema = z
  .object({
    count: z.number(),
    firstSeen: z.string(),
    lastSeen: z.string(),
  })
  .passthrough()

export type GlitchtipIssue = z.infer<typeof GlitchtipIssueSchema>

// --- GlitchTip event schemas (raw API format) ---

export const RawStackFrameSchema = z.object({
  function: z.string().optional(),
  filename: z.string().optional(),
  lineNo: z.number().optional(),
  colNo: z.number().optional(),
})

export const RawExceptionValueSchema = z.object({
  type: z.string(),
  value: z.string(),
  stacktrace: z
    .object({
      frames: z.array(RawStackFrameSchema),
    })
    .optional(),
})

export const RawExceptionEntrySchema = z.object({
  type: z.literal('exception'),
  data: z.object({
    values: z.array(RawExceptionValueSchema),
  }),
})

export const RawCspEntrySchema = z.object({
  type: z.literal('csp'),
  data: z.object({
    effective_directive: z.string().optional(),
    blocked_uri: z.string().optional(),
    document_uri: z.string().optional(),
    disposition: z.string().optional(),
  }),
})

const RawEventEntrySchema = z
  .discriminatedUnion('type', [RawExceptionEntrySchema, RawCspEntrySchema])
  .or(z.object({ type: z.string() }).passthrough())

export const RawGlitchtipEventSchema = z.object({
  culprit: z.string().optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  entries: z.array(RawEventEntrySchema).optional(),
})

export type RawGlitchtipEvent = z.infer<typeof RawGlitchtipEventSchema>

// --- Normalized event (internal representation) ---

export interface GlitchtipEvent {
  culprit: string | undefined
  tags: Array<{ key: string; value: string }>
  exceptions: Array<{
    type: string
    value: string
    stacktrace?: {
      frames: Array<{
        function?: string
        filename?: string
        lineNo?: number
        colNo?: number
      }>
    }
  }>
  csp: {
    effective_directive?: string
    blocked_uri?: string
    document_uri?: string
    disposition?: string
  } | null
}

export function normalizeEvent(raw: RawGlitchtipEvent): GlitchtipEvent {
  const entries = raw.entries ?? []

  const exceptionEntry = entries.find(
    (e): e is z.infer<typeof RawExceptionEntrySchema> => e.type === 'exception',
  )
  const exceptions = exceptionEntry ? exceptionEntry.data.values : []

  const cspEntry = entries.find(
    (e): e is z.infer<typeof RawCspEntrySchema> => e.type === 'csp',
  )
  const csp = cspEntry ? cspEntry.data : null

  return {
    culprit: raw.culprit,
    tags: raw.tags ?? [],
    exceptions,
    csp,
  }
}
