# GlitchTip GitHub Bridge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone TypeScript service that receives GlitchTip alert webhooks and creates enriched, deduplicated GitHub Issues.

**Architecture:** Modular Node.js HTTP server with Zod validation at boundaries. Backends for GitHub and GlitchTip APIs. Markdown formatter for issue bodies. No frameworks — just `node:http` and `fetch`.

**Tech Stack:** TypeScript, Node.js 22, Zod, Vitest, Docker

**Spec:** `docs/superpowers/specs/2026-03-14-glitchtip-github-bridge-design.md`

---

## Chunk 1: Project Scaffolding & Data Models

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "glitchtip-github-bridge",
  "version": "0.1.0",
  "description": "GlitchTip to GitHub Issues webhook bridge",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "MIT",
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
*.tgz
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Required
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPO=owner/repo
GLITCHTIP_API_URL=http://web:8000
GLITCHTIP_API_TOKEN=your_glitchtip_api_token

# Optional
GLITCHTIP_WEBHOOK_SECRET=
WEBHOOK_PORT=3001
```

- [ ] **Step 5: Install dependencies**

```bash
npm install zod
npm install -D typescript @types/node vitest
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
mkdir -p src && echo 'console.log("ok")' > src/index.ts && npx tsc
```

Expected: `dist/index.js` created with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example src/index.ts
git commit -m "chore: initialize project with TypeScript, Zod, Vitest"
```

---

### Task 2: Zod Schemas & Types (`src/models.ts`)

**Files:**
- Create: `src/models.ts`
- Create: `tests/models.test.ts`
- Create: `tests/fixtures/webhook-payload.json`
- Create: `tests/fixtures/glitchtip-issue.json`
- Create: `tests/fixtures/glitchtip-event.json`

- [ ] **Step 1: Create test fixtures**

Create `tests/fixtures/webhook-payload.json`:

```json
{
  "alias": "GlitchTip",
  "text": "",
  "attachments": [
    {
      "title": "TypeError: Cannot read properties of undefined (reading 'map')",
      "title_link": "https://log.example.com/my-org/issues/42",
      "text": "Error in data processing pipeline",
      "color": "#e52b50",
      "image_url": "https://log.example.com/chart.png",
      "fields": [
        { "title": "Project", "value": "my-app", "short": true },
        { "title": "Environment", "value": "production", "short": true },
        { "title": "Release", "value": "1.2.3", "short": true },
        { "title": "Server Name", "value": "web-01", "short": true }
      ]
    }
  ]
}
```

Create `tests/fixtures/glitchtip-issue.json`:

```json
{
  "count": 15,
  "firstSeen": "2026-03-10T08:30:00.000Z",
  "lastSeen": "2026-03-14T14:22:00.000Z",
  "title": "TypeError: Cannot read properties of undefined",
  "metadata": { "type": "TypeError" }
}
```

Create `tests/fixtures/glitchtip-event.json`:

```json
{
  "culprit": "app/utils/data.ts in processItems",
  "tags": [
    { "key": "browser", "value": "Chrome 120" },
    { "key": "os", "value": "Linux" },
    { "key": "release", "value": "1.2.3" },
    { "key": "environment", "value": "production" },
    { "key": "url", "value": "https://example.com/dashboard" }
  ],
  "entries": [
    {
      "type": "exception",
      "data": {
        "values": [
          {
            "type": "TypeError",
            "value": "Cannot read properties of undefined (reading 'map')",
            "stacktrace": {
              "frames": [
                {
                  "function": "processItems",
                  "filename": "app/utils/data.ts",
                  "lineNo": 42,
                  "colNo": 15
                },
                {
                  "function": "handleRequest",
                  "filename": "app/handlers/api.ts",
                  "lineNo": 87,
                  "colNo": 5
                }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Write tests for webhook payload schema**

Create `tests/models.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  WebhookPayloadSchema,
  GlitchtipIssueSchema,
  RawGlitchtipEventSchema,
  parseAttachments,
  normalizeEvent,
} from '../src/models.js'
import webhookPayload from './fixtures/webhook-payload.json'
import glitchtipIssue from './fixtures/glitchtip-issue.json'
import glitchtipEvent from './fixtures/glitchtip-event.json'

describe('WebhookPayloadSchema', () => {
  it('parses a valid webhook payload', () => {
    const result = WebhookPayloadSchema.safeParse(webhookPayload)
    expect(result.success).toBe(true)
  })

  it('parses payload with missing optional fields', () => {
    const minimal = {
      attachments: [{ title: 'Error', title_link: 'https://log.example.com/org/issues/1' }],
    }
    const result = WebhookPayloadSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('rejects payload with missing required attachment fields', () => {
    const invalid = { attachments: [{ title: 'Error' }] }
    const result = WebhookPayloadSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })
})

describe('GlitchtipIssueSchema', () => {
  it('parses a valid issue response', () => {
    const result = GlitchtipIssueSchema.safeParse(glitchtipIssue)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.count).toBe(15)
      expect(result.data.firstSeen).toBe('2026-03-10T08:30:00.000Z')
    }
  })
})

describe('RawGlitchtipEventSchema', () => {
  it('parses a valid event response', () => {
    const result = RawGlitchtipEventSchema.safeParse(glitchtipEvent)
    expect(result.success).toBe(true)
  })

  it('parses event with unknown entry types', () => {
    const withUnknown = {
      ...glitchtipEvent,
      entries: [...glitchtipEvent.entries, { type: 'breadcrumbs', data: { values: [] } }],
    }
    const result = RawGlitchtipEventSchema.safeParse(withUnknown)
    expect(result.success).toBe(true)
  })
})

describe('parseAttachments', () => {
  it('extracts parsed attachments from webhook payload', () => {
    const parsed = WebhookPayloadSchema.parse(webhookPayload)
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].errorTitle).toBe(
      "TypeError: Cannot read properties of undefined (reading 'map')",
    )
    expect(attachments[0].glitchtipIssueId).toBe('42')
    expect(attachments[0].project).toBe('my-app')
    expect(attachments[0].environment).toBe('production')
    expect(attachments[0].release).toBe('1.2.3')
    expect(attachments[0].serverName).toBe('web-01')
  })

  it('skips attachments without valid issue ID in title_link', () => {
    const parsed = WebhookPayloadSchema.parse({
      attachments: [{ title: 'Error', title_link: 'https://example.com/no-id' }],
    })
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(0)
  })

  it('defaults missing fields to empty strings', () => {
    const parsed = WebhookPayloadSchema.parse({
      attachments: [{ title: 'Error', title_link: 'https://log.example.com/org/issues/99' }],
    })
    const attachments = parseAttachments(parsed)
    expect(attachments).toHaveLength(1)
    expect(attachments[0].project).toBe('')
    expect(attachments[0].environment).toBe('')
    expect(attachments[0].serverName).toBe('')
    expect(attachments[0].release).toBe('')
    expect(attachments[0].context).toBe('')
  })
})

describe('normalizeEvent', () => {
  it('extracts exceptions from entries', () => {
    const raw = RawGlitchtipEventSchema.parse(glitchtipEvent)
    const event = normalizeEvent(raw)
    expect(event.exceptions).toHaveLength(1)
    expect(event.exceptions[0].type).toBe('TypeError')
    expect(event.exceptions[0].stacktrace?.frames).toHaveLength(2)
  })

  it('extracts CSP data when present', () => {
    const cspEvent = {
      entries: [
        {
          type: 'csp',
          data: {
            effective_directive: 'script-src',
            blocked_uri: 'https://evil.com/script.js',
            document_uri: 'https://example.com/',
            disposition: 'enforce',
          },
        },
      ],
    }
    const raw = RawGlitchtipEventSchema.parse(cspEvent)
    const event = normalizeEvent(raw)
    expect(event.csp).not.toBeNull()
    expect(event.csp!.effective_directive).toBe('script-src')
    expect(event.exceptions).toHaveLength(0)
  })

  it('extracts CSP data even when only some fields are present', () => {
    const partialCsp = {
      entries: [
        {
          type: 'csp',
          data: {
            blocked_uri: 'https://evil.com/script.js',
          },
        },
      ],
    }
    const raw = RawGlitchtipEventSchema.parse(partialCsp)
    const event = normalizeEvent(raw)
    expect(event.csp).not.toBeNull()
    expect(event.csp!.blocked_uri).toBe('https://evil.com/script.js')
    expect(event.csp!.effective_directive).toBeUndefined()
  })

  it('sets csp to null when no csp entry exists', () => {
    const raw = RawGlitchtipEventSchema.parse(glitchtipEvent)
    const event = normalizeEvent(raw)
    expect(event.csp).toBeNull()
  })

  it('defaults tags to empty array', () => {
    const raw = RawGlitchtipEventSchema.parse({ entries: [] })
    const event = normalizeEvent(raw)
    expect(event.tags).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/models.test.ts
```

Expected: FAIL — `../src/models.js` does not exist.

- [ ] **Step 4: Implement `src/models.ts`**

```typescript
import { z } from 'zod'

// --- Webhook payload schemas ---

export const WebhookFieldSchema = z.object({
  title: z.string(),
  value: z.string(),
  short: z.boolean().optional(),
})

export const WebhookAttachmentSchema = z.object({
  title: z.string(),
  title_link: z.string(),
  text: z.string().optional(),
  color: z.string().optional(),
  image_url: z.string().optional(),
  fields: z.array(WebhookFieldSchema).optional(),
})

export const WebhookPayloadSchema = z.object({
  alias: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(WebhookAttachmentSchema).optional(),
})

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>
export type WebhookAttachment = z.infer<typeof WebhookAttachmentSchema>

// --- Parsed attachment ---

export interface ParsedAttachment {
  errorTitle: string
  glitchtipUrl: string
  glitchtipIssueId: string
  context: string
  project: string
  environment: string
  serverName: string
  release: string
}

const ISSUE_ID_REGEX = /\/issues\/(\d+)/

export function parseAttachments(payload: WebhookPayload): ParsedAttachment[] {
  const attachments = payload.attachments ?? []
  const results: ParsedAttachment[] = []

  for (const attachment of attachments) {
    const idMatch = attachment.title_link.match(ISSUE_ID_REGEX)
    if (!idMatch) continue

    const fields: Record<string, string> = {}
    for (const f of attachment.fields ?? []) {
      fields[f.title.toLowerCase()] = f.value
    }

    results.push({
      errorTitle: attachment.title,
      glitchtipUrl: attachment.title_link,
      glitchtipIssueId: idMatch[1],
      context: attachment.text ?? '',
      project: fields['project'] ?? '',
      environment: fields['environment'] ?? '',
      serverName: fields['server name'] ?? '',
      release: fields['release'] ?? '',
    })
  }

  return results
}

// --- GlitchTip issue schema ---

export const GlitchtipIssueSchema = z
  .object({
    count: z.number(),
    firstSeen: z.string(),
    lastSeen: z.string(),
  })
  .passthrough()

export type GlitchtipIssue = z.infer<typeof GlitchtipIssueSchema>

// --- GlitchTip event schemas (raw API format) ---

export const RawStackFrameSchema = z.object({
  function: z.string().optional(),
  filename: z.string().optional(),
  lineNo: z.number().optional(),
  colNo: z.number().optional(),
})

export const RawExceptionValueSchema = z.object({
  type: z.string(),
  value: z.string(),
  stacktrace: z
    .object({
      frames: z.array(RawStackFrameSchema),
    })
    .optional(),
})

export const RawExceptionEntrySchema = z.object({
  type: z.literal('exception'),
  data: z.object({
    values: z.array(RawExceptionValueSchema),
  }),
})

export const RawCspEntrySchema = z.object({
  type: z.literal('csp'),
  data: z.object({
    effective_directive: z.string().optional(),
    blocked_uri: z.string().optional(),
    document_uri: z.string().optional(),
    disposition: z.string().optional(),
  }),
})

const RawEventEntrySchema = z
  .discriminatedUnion('type', [RawExceptionEntrySchema, RawCspEntrySchema])
  .or(z.object({ type: z.string() }).passthrough())

export const RawGlitchtipEventSchema = z.object({
  culprit: z.string().optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  entries: z.array(RawEventEntrySchema).optional(),
})

export type RawGlitchtipEvent = z.infer<typeof RawGlitchtipEventSchema>

// --- Normalized event (internal representation) ---

export interface GlitchtipEvent {
  culprit: string | undefined
  tags: Array<{ key: string; value: string }>
  exceptions: Array<{
    type: string
    value: string
    stacktrace?: {
      frames: Array<{
        function?: string
        filename?: string
        lineNo?: number
        colNo?: number
      }>
    }
  }>
  csp: {
    effective_directive?: string
    blocked_uri?: string
    document_uri?: string
    disposition?: string
  } | null
}

export function normalizeEvent(raw: RawGlitchtipEvent): GlitchtipEvent {
  const entries = raw.entries ?? []

  const exceptionEntry = entries.find(
    (e): e is z.infer<typeof RawExceptionEntrySchema> => e.type === 'exception',
  )
  const exceptions = exceptionEntry ? exceptionEntry.data.values : []

  const cspEntry = entries.find(
    (e): e is z.infer<typeof RawCspEntrySchema> => e.type === 'csp',
  )
  const csp = cspEntry ? cspEntry.data : null

  return {
    culprit: raw.culprit,
    tags: raw.tags ?? [],
    exceptions,
    csp,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/models.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/models.ts tests/models.test.ts tests/fixtures/
git commit -m "feat: add Zod schemas, parseAttachments, normalizeEvent"
```

---

### Task 3: Configuration (`src/config.ts`)

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write tests for config loading**

Create `tests/config.test.ts`:

```typescript
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
    // GITHUB_REPO intentionally missing

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL — `../src/config.js` does not exist.

- [ ] **Step 3: Implement `src/config.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/config.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loading with env var validation"
```

---

## Chunk 2: Backends

### Task 4: GlitchTip Backend (`src/backends/glitchtip.ts`)

**Files:**
- Create: `src/backends/glitchtip.ts`
- Create: `tests/backends/glitchtip.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/backends/glitchtip.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/backends/glitchtip.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/backends/glitchtip.ts`**

```typescript
import {
  GlitchtipIssueSchema,
  RawGlitchtipEventSchema,
  normalizeEvent,
  type GlitchtipIssue,
  type GlitchtipEvent,
} from '../models.js'

interface GlitchtipClientConfig {
  glitchtipApiUrl: string
  glitchtipApiToken: string
}

export interface GlitchtipClient {
  fetchIssue(issueId: string): Promise<GlitchtipIssue | null>
  fetchLatestEvent(issueId: string): Promise<GlitchtipEvent | null>
}

export function createGlitchtipClient(config: GlitchtipClientConfig): GlitchtipClient {
  const headers = { Authorization: `Bearer ${config.glitchtipApiToken}` }

  async function fetchIssue(issueId: string): Promise<GlitchtipIssue | null> {
    try {
      const res = await fetch(`${config.glitchtipApiUrl}/api/0/issues/${issueId}/`, { headers })
      if (!res.ok) return null
      const json = await res.json()
      const result = GlitchtipIssueSchema.safeParse(json)
      if (!result.success) {
        console.error(`GlitchTip issue validation failed for ${issueId}:`, result.error.message)
        return null
      }
      return result.data
    } catch (err) {
      console.error(`GlitchTip API error fetching issue ${issueId}:`, (err as Error).message)
      return null
    }
  }

  async function fetchLatestEvent(issueId: string): Promise<GlitchtipEvent | null> {
    try {
      const res = await fetch(`${config.glitchtipApiUrl}/api/0/issues/${issueId}/events/latest/`, {
        headers,
      })
      if (!res.ok) return null
      const json = await res.json()
      const result = RawGlitchtipEventSchema.safeParse(json)
      if (!result.success) {
        console.error(`GlitchTip event validation failed for ${issueId}:`, result.error.message)
        return null
      }
      return normalizeEvent(result.data)
    } catch (err) {
      console.error(`GlitchTip API error fetching event ${issueId}:`, (err as Error).message)
      return null
    }
  }

  return { fetchIssue, fetchLatestEvent }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/backends/glitchtip.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/glitchtip.ts tests/backends/glitchtip.test.ts
git commit -m "feat: add GlitchTip API client with validation and normalization"
```

---

### Task 5: GitHub Backend (`src/backends/github.ts`)

**Files:**
- Create: `src/backends/github.ts`
- Create: `tests/backends/github.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/backends/github.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/backends/github.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/backends/github.ts`**

```typescript
interface GithubClientConfig {
  githubToken: string
  githubRepo: string
}

export interface GitHubCreateResult {
  ok: boolean
  status: number
  data: { number: number; html_url: string } | null
}

export interface GithubClient {
  isDuplicate(issueId: string): Promise<boolean>
  createIssue(title: string, body: string, labels: string[]): Promise<GitHubCreateResult>
}

const GITHUB_API = 'https://api.github.com'

export function createGithubClient(config: GithubClientConfig): GithubClient {
  const headers = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  async function isDuplicate(issueId: string): Promise<boolean> {
    try {
      const q = encodeURIComponent(
        `repo:${config.githubRepo} "glitchtip-id:${issueId}" label:glitchtip`,
      )
      const res = await fetch(`${GITHUB_API}/search/issues?q=${q}`, {
        method: 'GET',
        headers,
      })
      if (!res.ok) return false
      const data = await res.json()
      return (data?.total_count ?? 0) > 0
    } catch (err) {
      console.error('GitHub duplicate search failed:', (err as Error).message)
      return false
    }
  }

  async function createIssue(
    title: string,
    body: string,
    labels: string[],
  ): Promise<GitHubCreateResult> {
    const res = await fetch(`${GITHUB_API}/repos/${config.githubRepo}/issues`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels }),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  }

  return { isDuplicate, createIssue }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/backends/github.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backends/github.ts tests/backends/github.test.ts
git commit -m "feat: add GitHub API client with deduplication and issue creation"
```

---

## Chunk 3: Formatter & Webhook Handler

### Task 6: Markdown Formatter (`src/formatters.ts`)

**Files:**
- Create: `src/formatters.ts`
- Create: `tests/formatters.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/formatters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildErrorBody, formatDate } from '../src/formatters.js'
import type { ParsedAttachment, GlitchtipIssue, GlitchtipEvent } from '../src/models.js'

const attachment: ParsedAttachment = {
  errorTitle: 'TypeError: Cannot read properties of undefined',
  glitchtipUrl: 'https://log.example.com/org/issues/42',
  glitchtipIssueId: '42',
  context: 'Error in data processing pipeline',
  project: 'my-app',
  environment: 'production',
  release: '1.2.3',
  serverName: 'web-01',
}

const issue: GlitchtipIssue = {
  count: 15,
  firstSeen: '2026-03-10T08:30:00.000Z',
  lastSeen: '2026-03-14T14:22:00.000Z',
}

const event: GlitchtipEvent = {
  culprit: 'app/utils/data.ts in processItems',
  tags: [
    { key: 'browser', value: 'Chrome 120' },
    { key: 'release', value: '1.2.3' },
    { key: 'environment', value: 'production' },
  ],
  exceptions: [
    {
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'map')",
      stacktrace: {
        frames: [
          { function: 'processItems', filename: 'app/utils/data.ts', lineNo: 42, colNo: 15 },
          { function: 'handleRequest', filename: 'app/handlers/api.ts', lineNo: 87, colNo: 5 },
        ],
      },
    },
  ],
  csp: null,
}

describe('formatDate', () => {
  it('formats ISO date to UTC string', () => {
    expect(formatDate('2026-03-10T08:30:00.000Z')).toBe('2026-03-10 08:30:00 UTC')
  })

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('buildErrorBody', () => {
  it('renders header table with all fields', () => {
    const body = buildErrorBody(attachment, issue, event)

    expect(body).toContain('| **Project** | my-app |')
    expect(body).toContain('| **Environment** | production |')
    expect(body).toContain('| **Release** | 1.2.3 |')
    expect(body).toContain('| **Component** | `app/utils/data.ts in processItems` |')
    expect(body).toContain('| **Occurrences** | 15 |')
    expect(body).toContain('| **First seen** | 2026-03-10 08:30:00 UTC |')
    expect(body).toContain('| **Server** | `web-01` |')
  })

  it('renders tags table excluding release and environment', () => {
    const body = buildErrorBody(attachment, issue, event)

    expect(body).toContain('### Tags')
    expect(body).toContain('| browser | Chrome 120 |')
    expect(body).not.toMatch(/\| release \| 1\.2\.3 \|/)
    expect(body).not.toMatch(/\| environment \| production \|/)
  })

  it('renders stacktrace with reversed frames', () => {
    const body = buildErrorBody(attachment, issue, event)

    expect(body).toContain('### Stacktrace')
    expect(body).toContain("TypeError: Cannot read properties of undefined (reading 'map')")
    expect(body).toContain('at handleRequest (app/handlers/api.ts:87:5)')
    expect(body).toContain('at processItems (app/utils/data.ts:42:15)')

    // Verify reversed order: handleRequest should appear before processItems
    const handleIdx = body.indexOf('at handleRequest')
    const processIdx = body.indexOf('at processItems')
    expect(handleIdx).toBeLessThan(processIdx)
  })

  it('renders CSP violation section', () => {
    const cspEvent: GlitchtipEvent = {
      ...event,
      exceptions: [],
      csp: {
        effective_directive: 'script-src',
        blocked_uri: 'https://evil.com/script.js',
        document_uri: 'https://example.com/',
        disposition: 'enforce',
      },
    }

    const body = buildErrorBody(attachment, issue, cspEvent)

    expect(body).toContain('### CSP Violation')
    expect(body).toContain('| **Directive** | `script-src` |')
    expect(body).toContain('| **Blocked URI** | https://evil.com/script.js |')
  })

  it('renders context quote', () => {
    const body = buildErrorBody(attachment, issue, event)

    expect(body).toContain('> Error in data processing pipeline')
  })

  it('renders GlitchTip link and dedup marker', () => {
    const body = buildErrorBody(attachment, issue, event)

    expect(body).toContain('[View in GlitchTip](https://log.example.com/org/issues/42)')
    expect(body).toContain('<!-- glitchtip-id:42 -->')
  })

  it('omits enrichment sections when issue is null', () => {
    const body = buildErrorBody(attachment, null, event)

    expect(body).not.toContain('**Occurrences**')
    expect(body).not.toContain('**First seen**')
    expect(body).not.toContain('**Last seen**')
  })

  it('omits enrichment sections when event is null', () => {
    const body = buildErrorBody(attachment, issue, null)

    expect(body).not.toContain('### Tags')
    expect(body).not.toContain('### Stacktrace')
    expect(body).not.toContain('**Component**')
  })

  it('handles missing frame fields with defaults', () => {
    const sparseEvent: GlitchtipEvent = {
      culprit: undefined,
      tags: [],
      exceptions: [
        {
          type: 'Error',
          value: 'something broke',
          stacktrace: { frames: [{ lineNo: 10 }] },
        },
      ],
      csp: null,
    }

    const body = buildErrorBody(attachment, null, sparseEvent)

    expect(body).toContain('at <anonymous> (<unknown>:10:0)')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/formatters.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/formatters.ts`**

```typescript
import type { ParsedAttachment, GlitchtipIssue, GlitchtipEvent } from './models.js'

export function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function buildErrorBody(
  attachment: ParsedAttachment,
  issue: GlitchtipIssue | null,
  event: GlitchtipEvent | null,
): string {
  const lines: string[] = []

  // Header table
  const rows: string[] = []
  if (attachment.project) rows.push(`| **Project** | ${attachment.project} |`)
  if (attachment.environment) rows.push(`| **Environment** | ${attachment.environment} |`)
  if (attachment.release) rows.push(`| **Release** | ${attachment.release} |`)
  if (event?.culprit) rows.push(`| **Component** | \`${event.culprit}\` |`)
  if (issue?.count) rows.push(`| **Occurrences** | ${issue.count} |`)
  if (issue?.firstSeen) rows.push(`| **First seen** | ${formatDate(issue.firstSeen)} |`)
  if (issue?.lastSeen) rows.push(`| **Last seen** | ${formatDate(issue.lastSeen)} |`)
  if (attachment.serverName) rows.push(`| **Server** | \`${attachment.serverName}\` |`)

  if (rows.length > 0) {
    lines.push('| | |', '|---|---|', ...rows, '')
  }

  // Tags
  if (event) {
    const skipTags = new Set(['release', 'environment'])
    const filteredTags = event.tags.filter((t) => !skipTags.has(t.key))
    if (filteredTags.length > 0) {
      lines.push('### Tags', '', '| Tag | Value |', '|---|---|')
      for (const t of filteredTags) {
        lines.push(`| ${t.key} | ${t.value} |`)
      }
      lines.push('')
    }
  }

  // Stacktrace
  if (event) {
    for (const exc of event.exceptions) {
      const frames = exc.stacktrace?.frames ?? []
      if (frames.length === 0 && !exc.value) continue

      lines.push('### Stacktrace', '', '```')
      lines.push(`${exc.type}: ${exc.value}`)

      const displayFrames = [...frames].reverse()
      for (const frame of displayFrames) {
        const fn = frame.function ?? '<anonymous>'
        const file = frame.filename ?? '<unknown>'
        const loc = frame.lineNo != null ? `${file}:${frame.lineNo}:${frame.colNo ?? 0}` : file
        lines.push(`    at ${fn} (${loc})`)
      }
      lines.push('```', '')
    }
  }

  // CSP details
  if (event?.csp) {
    const d = event.csp
    lines.push('### CSP Violation', '')
    const cspRows: string[] = []
    if (d.effective_directive) cspRows.push(`| **Directive** | \`${d.effective_directive}\` |`)
    if (d.blocked_uri) cspRows.push(`| **Blocked URI** | ${d.blocked_uri} |`)
    if (d.document_uri) cspRows.push(`| **Document** | ${d.document_uri} |`)
    if (d.disposition) cspRows.push(`| **Disposition** | ${d.disposition} |`)
    if (cspRows.length > 0) {
      lines.push('| | |', '|---|---|', ...cspRows, '')
    }
  }

  // Context
  if (attachment.context) {
    lines.push(`> ${attachment.context}`, '')
  }

  // GlitchTip link and dedup marker
  lines.push('---', `[View in GlitchTip](${attachment.glitchtipUrl})`, '')
  lines.push(`<!-- glitchtip-id:${attachment.glitchtipIssueId} -->`)

  return lines.join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/formatters.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/formatters.ts tests/formatters.test.ts
git commit -m "feat: add markdown formatter for GitHub Issue bodies"
```

---

### Task 7: Webhook Handler (`src/api/webhook.ts`)

**Files:**
- Create: `src/api/webhook.ts`
- Create: `tests/api/webhook.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/api/webhook.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/webhook.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/api/webhook.ts`**

```typescript
import { WebhookPayloadSchema, parseAttachments } from '../models.js'
import { buildErrorBody } from '../formatters.js'
import type { Config } from '../config.js'
import type { GithubClient } from '../backends/github.js'
import type { GlitchtipClient } from '../backends/glitchtip.js'

interface AttachmentResult {
  glitchtipIssueId: string
  status: 'created' | 'duplicate' | 'error'
  issue?: string
}

interface WebhookResponse {
  status: number
  body: {
    results: AttachmentResult[]
    summary: { created: number; duplicates: number; errors: number }
  }
}

export function createWebhookHandler(
  config: Config,
  github: GithubClient,
  glitchtip: GlitchtipClient,
) {
  return async function handleWebhook(
    rawBody: string,
    secret: string,
  ): Promise<WebhookResponse> {
    // Secret validation
    if (config.webhookSecret && secret !== config.webhookSecret) {
      return {
        status: 401,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    // Parse and validate payload
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return {
        status: 400,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    const validation = WebhookPayloadSchema.safeParse(parsed)
    if (!validation.success) {
      return {
        status: 400,
        body: { results: [], summary: { created: 0, duplicates: 0, errors: 0 } },
      }
    }

    const attachments = parseAttachments(validation.data)
    const results: AttachmentResult[] = []

    for (const attachment of attachments) {
      // Deduplication check (fail-open)
      if (await github.isDuplicate(attachment.glitchtipIssueId)) {
        console.log(`Duplicate: GlitchTip issue ${attachment.glitchtipIssueId} already has a GitHub Issue`)
        results.push({ glitchtipIssueId: attachment.glitchtipIssueId, status: 'duplicate' })
        continue
      }

      // Enrich via GlitchTip API (failure does not block creation)
      let issue = null
      let event = null
      try {
        ;[issue, event] = await Promise.all([
          glitchtip.fetchIssue(attachment.glitchtipIssueId),
          glitchtip.fetchLatestEvent(attachment.glitchtipIssueId),
        ])
      } catch (err) {
        console.error(
          `GlitchTip enrichment failed for ${attachment.glitchtipIssueId}:`,
          (err as Error).message,
        )
      }

      const body = buildErrorBody(attachment, issue, event)
      const result = await github.createIssue(
        `[GlitchTip] ${attachment.errorTitle}`,
        body,
        ['bug', 'glitchtip'],
      )

      if (!result.ok) {
        console.error(`GitHub API error (${result.status}):`, result.data)
        results.push({ glitchtipIssueId: attachment.glitchtipIssueId, status: 'error' })
        continue
      }

      console.log(`Created GitHub Issue #${result.data?.number}: ${attachment.errorTitle}`)
      results.push({
        glitchtipIssueId: attachment.glitchtipIssueId,
        status: 'created',
        issue: result.data?.html_url,
      })
    }

    const created = results.filter((r) => r.status === 'created').length
    const duplicates = results.filter((r) => r.status === 'duplicate').length
    const errors = results.filter((r) => r.status === 'error').length
    const status = errors > 0 && created === 0 ? 502 : created > 0 ? 201 : 200

    return { status, body: { results, summary: { created, duplicates, errors } } }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/webhook.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/webhook.ts tests/api/webhook.test.ts
git commit -m "feat: add webhook handler with dedup, enrichment, and issue creation"
```

---

## Chunk 4: Server, Entry Point & Docker

### Task 8: HTTP Server (`src/server.ts`)

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Implement `src/server.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server.ts
git commit -m "feat: add HTTP server with routing"
```

---

### Task 9: Entry Point (`src/index.ts`)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

Replace the placeholder `console.log("ok")` with:

```typescript
import { loadConfig } from './config.js'
import { createServer } from './server.js'
import { createGithubClient } from './backends/github.js'
import { createGlitchtipClient } from './backends/glitchtip.js'

const config = loadConfig()
const github = createGithubClient(config)
const glitchtip = createGlitchtipClient(config)
const server = createServer(config, github, glitchtip)

server.listen(config.port, () => {
  console.log(`GlitchTip webhook bridge listening on port ${config.port}`)
})
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc
```

Expected: No errors. `dist/` contains all compiled JS files.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All tests PASS across all test files.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point wiring config, backends, and server"
```

---

### Task 10: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  glitchtip-github-bridge:
    build: .
    restart: always
    ports:
      - "3001:3001"
    env_file: .env
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1))",
        ]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 3: Verify Docker builds**

```bash
docker build -t glitchtip-github-bridge .
```

Expected: Build completes successfully.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add Dockerfile and docker-compose for deployment"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# GlitchTip GitHub Bridge

A webhook bridge that receives [GlitchTip](https://glitchtip.com/) alert notifications and creates GitHub Issues in your target repository.

## Features

- Receives GlitchTip Slack-compatible webhooks
- Creates GitHub Issues with formatted markdown bodies
- Enriches issues with stacktraces, tags, and CSP details via GlitchTip API
- Deduplicates issues to prevent spam
- Runs as a lightweight Docker container

## Quick Start

1. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

2. Run with Docker Compose:

   ```bash
   docker compose up -d
   ```

3. Configure GlitchTip to send webhooks to:

   ```
   http://<bridge-host>:3001/webhook?secret=<GLITCHTIP_WEBHOOK_SECRET>
   ```

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | Yes | — | Target repo (e.g. `owner/repo`) |
| `GLITCHTIP_API_URL` | Yes | — | GlitchTip base URL |
| `GLITCHTIP_API_TOKEN` | Yes | — | GlitchTip API bearer token |
| `GLITCHTIP_WEBHOOK_SECRET` | No | — | Webhook authentication secret |
| `WEBHOOK_PORT` | No | `3001` | Server listen port |

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and configuration instructions"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Clean build from scratch**

```bash
rm -rf dist node_modules
npm install
npm run build
```

Expected: No errors.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Verify Docker build**

```bash
docker build -t glitchtip-github-bridge .
```

Expected: Build completes successfully.

- [ ] **Step 4: Remove placeholder `src/index.ts` from `dist/` if stale, verify clean state**

```bash
git status
```

Expected: Clean working tree. All files committed.
