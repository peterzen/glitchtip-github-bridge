import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGlitchtipClient } from '../../src/backends/glitchtip.js'
import glitchtipIssue from '../fixtures/glitchtip-issue.json'
import glitchtipEvent from '../fixtures/glitchtip-event.json'

describe('GlitchTip client', () => {
  const config = {
    glitchtipApiUrl: 'http://web:8000',
    glitchtipApiToken: 'test-token',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchIssue', () => {
    it('returns parsed issue on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(glitchtipIssue), { status: 200 }),
      )

      const client = createGlitchtipClient(config)
      const result = await client.fetchIssue('42')

      expect(result).not.toBeNull()
      expect(result!.count).toBe(15)
      expect(fetch).toHaveBeenCalledWith('http://web:8000/api/0/issues/42/', {
        headers: { Authorization: 'Bearer test-token' },
      })
    })

    it('returns null on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 }),
      )

      const client = createGlitchtipClient(config)
      const result = await client.fetchIssue('999')

      expect(result).toBeNull()
    })

    it('returns null on invalid response body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('not json', { status: 200 }),
      )

      const client = createGlitchtipClient(config)
      const result = await client.fetchIssue('42')

      expect(result).toBeNull()
    })
  })

  describe('fetchLatestEvent', () => {
    it('returns normalized event on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(glitchtipEvent), { status: 200 }),
      )

      const client = createGlitchtipClient(config)
      const result = await client.fetchLatestEvent('42')

      expect(result).not.toBeNull()
      expect(result!.culprit).toBe('app/utils/data.ts in processItems')
      expect(result!.exceptions).toHaveLength(1)
      expect(result!.csp).toBeNull()
      expect(fetch).toHaveBeenCalledWith('http://web:8000/api/0/issues/42/events/latest/', {
        headers: { Authorization: 'Bearer test-token' },
      })
    })

    it('returns null on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Error', { status: 500 }),
      )

      const client = createGlitchtipClient(config)
      const result = await client.fetchLatestEvent('42')

      expect(result).toBeNull()
    })
  })
})
