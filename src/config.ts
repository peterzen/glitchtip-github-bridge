/** A personal access token, or a GitHub App installation (issues are then authored by the app's bot). */
export type GithubAuth =
  | { kind: 'token'; token: string }
  | { kind: 'app'; appId: string; installationId: string; privateKey: string }

export interface Config {
  githubAuth: GithubAuth
  githubRepo: string
  glitchtipApiUrl: string
  glitchtipApiToken: string
  webhookSecret: string
  port: number
}

function required(name: string): string {
  const val = process.env[name]
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return val
}

function loadGithubAuth(): GithubAuth {
  const appId = process.env.GITHUB_APP_ID
  const token = process.env.GITHUB_TOKEN
  if (appId && token) {
    throw new Error('Set either GITHUB_TOKEN or GITHUB_APP_ID, not both')
  }
  if (!appId) {
    return { kind: 'token', token: required('GITHUB_TOKEN') }
  }
  return {
    kind: 'app',
    appId,
    installationId: required('GITHUB_APP_INSTALLATION_ID'),
    // Env files hold the PEM on one line with escaped newlines.
    privateKey: required('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }
}

export function loadConfig(): Readonly<Config> {
  return Object.freeze({
    githubAuth: loadGithubAuth(),
    githubRepo: required('GITHUB_REPO'),
    glitchtipApiUrl: required('GLITCHTIP_API_URL'),
    glitchtipApiToken: required('GLITCHTIP_API_TOKEN'),
    webhookSecret: process.env.GLITCHTIP_WEBHOOK_SECRET ?? '',
    port: parseInt(process.env.WEBHOOK_PORT ?? '3001', 10),
  })
}
