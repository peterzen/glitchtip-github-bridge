import { createSign } from 'node:crypto'
import type { GithubAuth } from '../config.js'

const GITHUB_API = 'https://api.github.com'
/** Mint a new installation token this long before the current one expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export type TokenProvider = () => Promise<string>

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

/** A JWT that authenticates as the app itself, valid for 9 minutes (GitHub allows 10). */
export function appJwt(appId: string, privateKey: string, nowMs = Date.now()): string {
  const now = Math.floor(nowMs / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  // iat is backdated to tolerate clock drift between us and GitHub.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey)
  return `${header}.${payload}.${base64url(signature)}`
}

/**
 * Returns the bearer token for GitHub API calls. A personal access token is
 * used as is; a GitHub App installation token is minted on first use and
 * reused until shortly before it expires (GitHub issues them for one hour).
 */
export function createTokenProvider(auth: GithubAuth): TokenProvider {
  if (auth.kind === 'token') {
    const { token } = auth
    return async () => token
  }

  let cached: { token: string; expiresAt: number } | null = null

  return async () => {
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.token

    const res = await fetch(
      `${GITHUB_API}/app/installations/${auth.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appJwt(auth.appId, auth.privateKey)}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
    if (!res.ok) {
      throw new Error(`GitHub App token request failed: ${res.status}`)
    }
    const data = (await res.json()) as { token: string; expires_at: string }
    cached = { token: data.token, expiresAt: Date.parse(data.expires_at) }
    return cached.token
  }
}
