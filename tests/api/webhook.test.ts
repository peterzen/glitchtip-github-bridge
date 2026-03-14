import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebhookHandler } from '../../src/api/webhook.js'
import type { Config } from '../../src/config.js'
import type { GithubClient, GitHubCreateResult } from '../../src/backends/github.js'
import type { GlitchtipClient } from '../../src/backends/glitchtip.js'
import webhookPayload from '../fixtures/webhook-payload.json'

function mockConfig(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: 'ghp_test',
    githubRepo: 'owner/repo',
    glitchtipApiUrl: 'http://web:8000',
    glitchtipApiToken: 'gt_token',
    webhookSecret: '',
    port: 3001,
    ...overrides,
  }
}

function mockGithubClient(overrides: Partial<GithubClient> = {}): GithubClient {
  return {
    isDuplicate: vi.fn().mockResolvedValue(false),
    createIssue: vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      data: { number: 1, html_url: 'https://github.com/owner/repo/issues/1' },
    } satisfies GitHubCreateResult),
    ...overrides,
  }
}

function mockGlitchtipClient(overrides: Partial<GlitchtipClient> = {}): GlitchtipClient {
  return {
    fetchIssue: vi.fn().mockResolvedValue(null),
    fetchLatestEvent: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('webhook handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates GitHub issue for valid payload and returns 201', async () => {
    const github = mockGithubClient()
    const glitchtip = mockGlitchtipClient()
    const handler = createWebhookHandler(mockConfig(), github, glitchtip)

    const result = await handler(JSON.stringify(webhookPayload), '')

    expect(result.status).toBe(201)
    expect(result.body.summary.created).toBe(1)
    expect(github.createIssue).toHaveBeenCalledWith(
      expect.stringContaining('[GlitchTip]'),
      expect.any(String),
      ['bug', 'glitchtip'],
    )
  })

  it('skips duplicate issues and returns 200', async () => {
    const github = mockGithubClient({ isDuplicate: vi.fn().mockResolvedValue(true) })
    const handler = createWebhookHandler(mockConfig(), github, mockGlitchtipClient())

    const result = await handler(JSON.stringify(webhookPayload), '')

    expect(result.status).toBe(200)
    expect(result.body.summary.duplicates).toBe(1)
    expect(result.body.summary.created).toBe(0)
    expect(github.createIssue).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON', async () => {
    const handler = createWebhookHandler(mockConfig(), mockGithubClient(), mockGlitchtipClient())

    const result = await handler('not json', '')

    expect(result.status).toBe(400)
  })

  it('returns 200 with empty results for no valid attachments', async () => {
    const handler = createWebhookHandler(mockConfig(), mockGithubClient(), mockGlitchtipClient())
    const payload = { attachments: [{ title: 'Error', title_link: 'https://no-id.com' }] }

    const result = await handler(JSON.stringify(payload), '')

    expect(result.status).toBe(200)
    expect(result.body.results).toHaveLength(0)
  })

  it('validates webhook secret when configured', async () => {
    const config = mockConfig({ webhookSecret: 'my-secret' })
    const handler = createWebhookHandler(config, mockGithubClient(), mockGlitchtipClient())

    const badSecret = await handler(JSON.stringify(webhookPayload), 'wrong-secret')
    expect(badSecret.status).toBe(401)

    const goodSecret = await handler(JSON.stringify(webhookPayload), 'my-secret')
    expect(goodSecret.status).toBe(201)
  })

  it('returns 502 when all GitHub API calls fail', async () => {
    const github = mockGithubClient({
      createIssue: vi.fn().mockResolvedValue({ ok: false, status: 500, data: null }),
    })
    const handler = createWebhookHandler(mockConfig(), github, mockGlitchtipClient())

    const result = await handler(JSON.stringify(webhookPayload), '')

    expect(result.status).toBe(502)
    expect(result.body.summary.errors).toBe(1)
  })

  it('enriches issues via GlitchTip API', async () => {
    const glitchtip = mockGlitchtipClient({
      fetchIssue: vi.fn().mockResolvedValue({ count: 5, firstSeen: '', lastSeen: '' }),
      fetchLatestEvent: vi.fn().mockResolvedValue({
        culprit: 'test',
        tags: [],
        exceptions: [],
        csp: null,
      }),
    })
    const handler = createWebhookHandler(mockConfig(), mockGithubClient(), glitchtip)

    await handler(JSON.stringify(webhookPayload), '')

    expect(glitchtip.fetchIssue).toHaveBeenCalledWith('42')
    expect(glitchtip.fetchLatestEvent).toHaveBeenCalledWith('42')
  })
})
