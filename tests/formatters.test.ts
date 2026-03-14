import { describe, it, expect } from 'vitest'
import { buildErrorBody, formatDate } from '../src/formatters.js'
import type { ParsedAttachment, GlitchtipIssue, GlitchtipEvent } from '../src/models.js'

const attachment: ParsedAttachment = {
  errorTitle: 'TypeError: Cannot read properties of undefined',
  glitchtipUrl: 'https://log.example.com/org/issues/42',
  glitchtipIssueId: '42',
  context: 'Error in data processing pipeline',
  project: 'my-app',
  environment: 'production',
  release: '1.2.3',
  serverName: 'web-01',
}

const issue: GlitchtipIssue = {
  count: 15,
  firstSeen: '2026-03-10T08:30:00.000Z',
  lastSeen: '2026-03-14T14:22:00.000Z',
}

const event: GlitchtipEvent = {
  culprit: 'app/utils/data.ts in processItems',
  tags: [
    { key: 'browser', value: 'Chrome 120' },
    { key: 'release', value: '1.2.3' },
    { key: 'environment', value: 'production' },
  ],
  exceptions: [
    {
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'map')",
      stacktrace: {
        frames: [
          { function: 'processItems', filename: 'app/utils/data.ts', lineNo: 42, colNo: 15 },
          { function: 'handleRequest', filename: 'app/handlers/api.ts', lineNo: 87, colNo: 5 },
        ],
      },
    },
  ],
  csp: null,
}

describe('formatDate', () => {
  it('formats ISO date to UTC string', () => {
    expect(formatDate('2026-03-10T08:30:00.000Z')).toBe('2026-03-10 08:30:00 UTC')
  })

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('buildErrorBody', () => {
  it('renders header table with all fields', () => {
    const body = buildErrorBody(attachment, issue, event)
    expect(body).toContain('| **Project** | my-app |')
    expect(body).toContain('| **Environment** | production |')
    expect(body).toContain('| **Release** | 1.2.3 |')
    expect(body).toContain('| **Component** | `app/utils/data.ts in processItems` |')
    expect(body).toContain('| **Occurrences** | 15 |')
    expect(body).toContain('| **First seen** | 2026-03-10 08:30:00 UTC |')
    expect(body).toContain('| **Server** | `web-01` |')
  })

  it('renders tags table excluding release and environment', () => {
    const body = buildErrorBody(attachment, issue, event)
    expect(body).toContain('### Tags')
    expect(body).toContain('| browser | Chrome 120 |')
    expect(body).not.toMatch(/\| release \| 1\.2\.3 \|/)
    expect(body).not.toMatch(/\| environment \| production \|/)
  })

  it('renders stacktrace with reversed frames', () => {
    const body = buildErrorBody(attachment, issue, event)
    expect(body).toContain('### Stacktrace')
    expect(body).toContain("TypeError: Cannot read properties of undefined (reading 'map')")
    expect(body).toContain('at handleRequest (app/handlers/api.ts:87:5)')
    expect(body).toContain('at processItems (app/utils/data.ts:42:15)')
    const handleIdx = body.indexOf('at handleRequest')
    const processIdx = body.indexOf('at processItems')
    expect(handleIdx).toBeLessThan(processIdx)
  })

  it('renders CSP violation section', () => {
    const cspEvent: GlitchtipEvent = {
      ...event,
      exceptions: [],
      csp: {
        effective_directive: 'script-src',
        blocked_uri: 'https://evil.com/script.js',
        document_uri: 'https://example.com/',
        disposition: 'enforce',
      },
    }
    const body = buildErrorBody(attachment, issue, cspEvent)
    expect(body).toContain('### CSP Violation')
    expect(body).toContain('| **Directive** | `script-src` |')
    expect(body).toContain('| **Blocked URI** | https://evil.com/script.js |')
  })

  it('renders context quote', () => {
    const body = buildErrorBody(attachment, issue, event)
    expect(body).toContain('> Error in data processing pipeline')
  })

  it('renders GlitchTip link and dedup marker', () => {
    const body = buildErrorBody(attachment, issue, event)
    expect(body).toContain('[View in GlitchTip](https://log.example.com/org/issues/42)')
    expect(body).toContain('<!-- glitchtip-id:42 -->')
  })

  it('omits enrichment sections when issue is null', () => {
    const body = buildErrorBody(attachment, null, event)
    expect(body).not.toContain('**Occurrences**')
    expect(body).not.toContain('**First seen**')
    expect(body).not.toContain('**Last seen**')
  })

  it('omits enrichment sections when event is null', () => {
    const body = buildErrorBody(attachment, issue, null)
    expect(body).not.toContain('### Tags')
    expect(body).not.toContain('### Stacktrace')
    expect(body).not.toContain('**Component**')
  })

  it('handles missing frame fields with defaults', () => {
    const sparseEvent: GlitchtipEvent = {
      culprit: undefined,
      tags: [],
      exceptions: [
        {
          type: 'Error',
          value: 'something broke',
          stacktrace: { frames: [{ lineNo: 10 }] },
        },
      ],
      csp: null,
    }
    const body = buildErrorBody(attachment, null, sparseEvent)
    expect(body).toContain('at <anonymous> (<unknown>:10:0)')
  })
})
