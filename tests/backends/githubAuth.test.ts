import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { appJwt, createTokenProvider } from '../../src/backends/githubAuth.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const app = { kind: 'app' as const, appId: '123', installationId: '456', privateKey }
const HOUR = 60 * 60 * 1000

function tokenResponse(token: string, expiresAt: Date) {
  return new Response(JSON.stringify({ token, expires_at: expiresAt.toISOString() }), {
    status: 201,
  })
}

describe('appJwt', () => {
  it('is an RS256 JWT for the app, signed with its private key', () => {
    const now = Date.parse('2026-11-24T12:00:00Z')
    const [header, payload, signature] = appJwt('123', privateKey, now).split('.')

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(claims).toEqual({ iss: '123', iat: now / 1000 - 60, exp: now / 1000 + 540 })
    const valid = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'))
    expect(valid).toBe(true)
  })
})

describe('createTokenProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a personal access token as is, without calling GitHub', async () => {
    vi.spyOn(globalThis, 'fetch')
    const getToken = createTokenProvider({ kind: 'token', token: 'ghp_x' })

    expect(await getToken()).toBe('ghp_x')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exchanges an app JWT for an installation token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      tokenResponse('ghs_1', new Date(Date.now() + HOUR)),
    )

    expect(await createTokenProvider(app)()).toBe('ghs_1')
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/456/access_tokens',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer ey/) }),
      }),
    )
  })

  it('reuses the token until five minutes before it expires', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse('ghs_1', new Date(Date.now() + HOUR)))
      .mockResolvedValueOnce(tokenResponse('ghs_2', new Date(Date.now() + 2 * HOUR)))
    const getToken = createTokenProvider(app)

    expect(await getToken()).toBe('ghs_1')
    vi.advanceTimersByTime(54 * 60 * 1000)
    expect(await getToken()).toBe('ghs_1')
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(await getToken()).toBe('ghs_2')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws when GitHub refuses the app, so the caller reports the failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 401 }))

    await expect(createTokenProvider(app)()).rejects.toThrow('401')
  })
})
