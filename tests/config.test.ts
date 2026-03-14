import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('loads all required and optional config from env vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'
    process.env.GLITCHTIP_WEBHOOK_SECRET = 'my-secret'
    process.env.WEBHOOK_PORT = '4000'

    const config = loadConfig()

    expect(config.githubToken).toBe('ghp_test123')
    expect(config.githubRepo).toBe('owner/repo')
    expect(config.glitchtipApiUrl).toBe('http://web:8000')
    expect(config.glitchtipApiToken).toBe('gt_token')
    expect(config.webhookSecret).toBe('my-secret')
    expect(config.port).toBe(4000)
  })

  it('uses defaults for optional vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'

    const config = loadConfig()

    expect(config.webhookSecret).toBe('')
    expect(config.port).toBe(3001)
  })

  it('throws when required env var is missing', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    expect(() => loadConfig()).toThrow('GITHUB_REPO')
  })

  it('returns a frozen object', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'

    const config = loadConfig()

    expect(() => {
      ;(config as any).port = 9999
    }).toThrow()
  })
})
