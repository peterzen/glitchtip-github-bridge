export interface Config {
  githubToken: string
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

export function loadConfig(): Readonly<Config> {
  return Object.freeze({
    githubToken: required('GITHUB_TOKEN'),
    githubRepo: required('GITHUB_REPO'),
    glitchtipApiUrl: required('GLITCHTIP_API_URL'),
    glitchtipApiToken: required('GLITCHTIP_API_TOKEN'),
    webhookSecret: process.env.GLITCHTIP_WEBHOOK_SECRET ?? '',
    port: parseInt(process.env.WEBHOOK_PORT ?? '3001', 10),
  })
}
