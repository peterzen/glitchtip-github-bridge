import { describe, it, expect } from 'vitest'
import {
  WebhookPayloadSchema,
  GlitchtipIssueSchema,
  RawGlitchtipEventSchema,
  parseAttachments,
  normalizeEvent,
} from '../src/models.js'
import webhookPayload from './fixtures/webhook-payload.json'
import glitchtipIssue from './fixtures/glitchtip-issue.json'
import glitchtipEvent from './fixtures/glitchtip-event.json'

describe('WebhookPayloadSchema', () => {
  it('parses a valid webhook payload', () => {
    const result = WebhookPayloadSchema.safeParse(webhookPayload)
    expect(result.success).toBe(true)
  })

  it('parses payload with missing optional fields', () => {
    const minimal = {
      attachments: [{ title: 'Error', title_link: 'https://log.example.com/org/issues/1' }],
    }
    const result = WebhookPayloadSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects payload with missing required attachment fields', () => {
    const invalid = { attachments: [{ title: 'Error' }] }
    const result = WebhookPayloadSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('GlitchtipIssueSchema', () => {
  it('parses a valid issue response', () => {
    const result = GlitchtipIssueSchema.safeParse(glitchtipIssue)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.count).toBe(15)
      expect(result.data.firstSeen).toBe('2026-03-10T08:30:00.000Z')
    }
  })
})

describe('RawGlitchtipEventSchema', () => {
  it('parses a valid event response', () => {
    const result = RawGlitchtipEventSchema.safeParse(glitchtipEvent)
    expect(result.success).toBe(true)
  })

  it('parses event with unknown entry types', () => {
    const withUnknown = {
      ...glitchtipEvent,
      entries: [...glitchtipEvent.entries, { type: 'breadcrumbs', data: { values: [] } }],
    }
    const result = RawGlitchtipEventSchema.safeParse(withUnknown)
    expect(result.success).toBe(true)
  })
})

describe('parseAttachments', () => {
  it('extracts parsed attachments from webhook payload', () => {
    const parsed = WebhookPayloadSchema.parse(webhookPayload)
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].errorTitle).toBe(
      "TypeError: Cannot read properties of undefined (reading 'map')",
    )
    expect(attachments[0].glitchtipIssueId).toBe('42')
    expect(attachments[0].project).toBe('my-app')
    expect(attachments[0].environment).toBe('production')
    expect(attachments[0].release).toBe('1.2.3')
    expect(attachments[0].serverName).toBe('web-01')
  })

  it('skips attachments without valid issue ID in title_link', () => {
    const parsed = WebhookPayloadSchema.parse({
      attachments: [{ title: 'Error', title_link: 'https://example.com/no-id' }],
    })
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(0)
  })

  it('defaults missing fields to empty strings', () => {
    const parsed = WebhookPayloadSchema.parse({
      attachments: [{ title: 'Error', title_link: 'https://log.example.com/org/issues/99' }],
    })
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].project).toBe('')
    expect(attachments[0].environment).toBe('')
    expect(attachments[0].serverName).toBe('')
    expect(attachments[0].release).toBe('')
    expect(attachments[0].context).toBe('')
  })
})

describe('normalizeEvent', () => {
  it('extracts exceptions from entries', () => {
    const raw = RawGlitchtipEventSchema.parse(glitchtipEvent)
    const event = normalizeEvent(raw)
    expect(event.exceptions).toHaveLength(1)
    expect(event.exceptions[0].type).toBe('TypeError')
    expect(event.exceptions[0].stacktrace?.frames).toHaveLength(2)
  })

  it('extracts CSP data when present', () => {
    const cspEvent = {
      entries: [
        {
          type: 'csp',
          data: {
            effective_directive: 'script-src',
            blocked_uri: 'https://evil.com/script.js',
            document_uri: 'https://example.com/',
            disposition: 'enforce',
          },
        },
      ],
    }
    const raw = RawGlitchtipEventSchema.parse(cspEvent)
    const event = normalizeEvent(raw)
    expect(event.csp).not.toBeNull()
    expect(event.csp!.effective_directive).toBe('script-src')
    expect(event.exceptions).toHaveLength(0)
  })

  it('extracts CSP data even when only some fields are present', () => {
    const partialCsp = {
      entries: [
        {
          type: 'csp',
          data: {
            blocked_uri: 'https://evil.com/script.js',
          },
        },
      ],
    }
    const raw = RawGlitchtipEventSchema.parse(partialCsp)
    const event = normalizeEvent(raw)
    expect(event.csp).not.toBeNull()
    expect(event.csp!.blocked_uri).toBe('https://evil.com/script.js')
    expect(event.csp!.effective_directive).toBeUndefined()
  })

  it('sets csp to null when no csp entry exists', () => {
    const raw = RawGlitchtipEventSchema.parse(glitchtipEvent)
    const event = normalizeEvent(raw)
    expect(event.csp).toBeNull()
  })

  it('defaults tags to empty array', () => {
    const raw = RawGlitchtipEventSchema.parse({ entries: [] })
    const event = normalizeEvent(raw)
    expect(event.tags).toEqual([])
  })
})
