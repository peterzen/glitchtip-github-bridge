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

    expect(config.githubAuth).toEqual({ kind: 'token', token: 'ghp_test123' })
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

  describe('GitHub App auth', () => {
    function setBase() {
      process.env.GITHUB_REPO = 'owner/repo'
      process.env.GLITCHTIP_API_URL = 'http://web:8000'
      process.env.GLITCHTIP_API_TOKEN = 'gt_token'
      delete process.env.GITHUB_TOKEN
    }

    it('loads app credentials, unescaping newlines in the private key', () => {
      setBase()
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_INSTALLATION_ID = '456'
      process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN KEY-----\\nabc\\n-----END KEY-----'

      expect(loadConfig().githubAuth).toEqual({
        kind: 'app',
        appId: '123',
        installationId: '456',
        privateKey: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
      })
    })

    it('requires the installation id and private key with an app id', () => {
      setBase()
      process.env.GITHUB_APP_ID = '123'
      expect(() => loadConfig()).toThrow('GITHUB_APP_INSTALLATION_ID')
    })

    it('rejects a token and an app id together rather than picking one', () => {
      setBase()
      process.env.GITHUB_TOKEN = 'ghp_test123'
      process.env.GITHUB_APP_ID = '123'
      expect(() => loadConfig()).toThrow('not both')
    })

    it('requires GITHUB_TOKEN without an app id', () => {
      setBase()
      delete process.env.GITHUB_APP_ID
      expect(() => loadConfig()).toThrow('GITHUB_TOKEN')
    })
  })
})
