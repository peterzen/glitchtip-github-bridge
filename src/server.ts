import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Config } from './config.js'
import type { GithubClient } from './backends/github.js'
import type { GlitchtipClient } from './backends/glitchtip.js'
import { createWebhookHandler } from './api/webhook.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function createServer(config: Config, github: GithubClient, glitchtip: GlitchtipClient) {
  const handleWebhook = createWebhookHandler(config, github, glitchtip)

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${config.port}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { status: 'ok' })
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const rawBody = await readBody(req)
      const secret = url.searchParams.get('secret') ?? ''
      const result = await handleWebhook(rawBody, secret)
      return json(res, result.status, result.body)
    }

    json(res, 404, { error: 'not found' })
  })

  return server
}
