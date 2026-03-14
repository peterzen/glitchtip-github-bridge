import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGithubClient } from '../../src/backends/github.js'

describe('GitHub client', () => {
  const config = {
    githubToken: 'ghp_test123',
    githubRepo: 'owner/repo',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('isDuplicate', () => {
    it('returns true when issue with marker exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 1 }), { status: 200 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/issues?q='),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test123',
          }),
        }),
      )
    })

    it('returns false when no matching issue exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 0 }), { status: 200 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })

    it('returns false on API error (fail-open)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })

    it('returns false on non-200 response (fail-open)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })
  })

  describe('createIssue', () => {
    it('creates an issue and returns result', async () => {
      const ghResponse = { number: 42, html_url: 'https://github.com/owner/repo/issues/42' }
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(ghResponse), { status: 201 }),
      )

      const client = createGithubClient(config)
      const result = await client.createIssue('[GlitchTip] Error', 'body', ['bug', 'glitchtip'])

      expect(result.ok).toBe(true)
      expect(result.data?.html_url).toBe('https://github.com/owner/repo/issues/42')
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: '[GlitchTip] Error',
            body: 'body',
            labels: ['bug', 'glitchtip'],
          }),
        }),
      )
    })

    it('returns error result on API failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
      )

      const client = createGithubClient(config)
      const result = await client.createIssue('Title', 'body', ['bug'])

      expect(result.ok).toBe(false)
      expect(result.status).toBe(404)
    })
  })
})
