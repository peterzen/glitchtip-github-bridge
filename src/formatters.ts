import type { ParsedAttachment, GlitchtipIssue, GlitchtipEvent } from './models.js'

export function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function buildErrorBody(
  attachment: ParsedAttachment,
  issue: GlitchtipIssue | null,
  event: GlitchtipEvent | null,
): string {
  const lines: string[] = []

  // Header table
  const rows: string[] = []
  if (attachment.project) rows.push(`| **Project** | ${attachment.project} |`)
  if (attachment.environment) rows.push(`| **Environment** | ${attachment.environment} |`)
  if (attachment.release) rows.push(`| **Release** | ${attachment.release} |`)
  if (event?.culprit) rows.push(`| **Component** | \`${event.culprit}\` |`)
  if (issue?.count) rows.push(`| **Occurrences** | ${issue.count} |`)
  if (issue?.firstSeen) rows.push(`| **First seen** | ${formatDate(issue.firstSeen)} |`)
  if (issue?.lastSeen) rows.push(`| **Last seen** | ${formatDate(issue.lastSeen)} |`)
  if (attachment.serverName) rows.push(`| **Server** | \`${attachment.serverName}\` |`)

  if (rows.length > 0) {
    lines.push('| | |', '|---|---|', ...rows, '')
  }

  // Tags
  if (event) {
    const skipTags = new Set(['release', 'environment'])
    const filteredTags = event.tags.filter((t) => !skipTags.has(t.key))
    if (filteredTags.length > 0) {
      lines.push('### Tags', '', '| Tag | Value |', '|---|---|')
      for (const t of filteredTags) {
        lines.push(`| ${t.key} | ${t.value} |`)
      }
      lines.push('')
    }
  }

  // Stacktrace
  if (event) {
    for (const exc of event.exceptions) {
      const frames = exc.stacktrace?.frames ?? []
      if (frames.length === 0 && !exc.value) continue

      lines.push('### Stacktrace', '', '```')
      lines.push(`${exc.type}: ${exc.value}`)

      const displayFrames = [...frames].reverse()
      for (const frame of displayFrames) {
        const fn = frame.function ?? '<anonymous>'
        const file = frame.filename ?? '<unknown>'
        const loc = frame.lineNo != null ? `${file}:${frame.lineNo}:${frame.colNo ?? 0}` : file
        lines.push(`    at ${fn} (${loc})`)
      }
      lines.push('```', '')
    }
  }

  // CSP details
  if (event?.csp) {
    const d = event.csp
    lines.push('### CSP Violation', '')
    const cspRows: string[] = []
    if (d.effective_directive) cspRows.push(`| **Directive** | \`${d.effective_directive}\` |`)
    if (d.blocked_uri) cspRows.push(`| **Blocked URI** | ${d.blocked_uri} |`)
    if (d.document_uri) cspRows.push(`| **Document** | ${d.document_uri} |`)
    if (d.disposition) cspRows.push(`| **Disposition** | ${d.disposition} |`)
    if (cspRows.length > 0) {
      lines.push('| | |', '|---|---|', ...cspRows, '')
    }
  }

  // Context
  if (attachment.context) {
    lines.push(`> ${attachment.context}`, '')
  }

  // GlitchTip link and dedup marker
  lines.push('---', `[View in GlitchTip](${attachment.glitchtipUrl})`, '')
  lines.push(`<!-- glitchtip-id:${attachment.glitchtipIssueId} -->`)

  return lines.join('\n')
}
