# GlitchTip GitHub Bridge — MVP Design Spec

**Date:** 2026-03-14
**Issue:** [opencupid/opencupid#800](https://github.com/opencupid/opencupid/issues/800)
**Source:** Extracted from [peterzen/gaians-infra/glitchtip-webhook.mjs](https://github.com/peterzen/gaians-infra)
**Reference:** Structural patterns from [app-sre/glitchtip-jira-bridge](https://github.com/app-sre/glitchtip-jira-bridge)

## Overview

A standalone TypeScript service that receives GlitchTip alert webhooks (Slack-compatible format) and creates GitHub Issues in a target repository. Enriches issues with full event data (stacktrace, tags, CSP details) from the GlitchTip API. Prevents duplicates by searching for existing GitHub Issues with a marker comment.

This is an MVP extraction of the existing working code from `gaians-infra`, ported to TypeScript with modular structure inspired by `glitchtip-jira-bridge`.

## Scope

**In scope:**
- TypeScript port of all existing functionality from `glitchtip-webhook.mjs`
- Modular project structure (config, models, backends, formatters, API handlers)
- Zod schemas as single source of truth for data validation
- Environment variable configuration (generalized, no hardcoded values)
- Dockerfile and docker-compose.yml for local/self-hosted use
- Unit tests with Vitest

**Out of scope (future work):**
- CI/CD pipelines, GitHub Actions workflows
- Automated releases / GHCR publishing
- Rate limiting, caching layers
- Prometheus metrics
- Multi-repo routing

## Project Structure

```
glitchtip-github-bridge/
├── src/
│   ├── index.ts              # Entry point — loads config, starts server
│   ├── server.ts             # HTTP server, routing, request parsing
│   ├── config.ts             # Env var loading + validation
│   ├── models.ts             # Zod schemas + inferred TypeScript types
│   ├── formatters.ts         # Markdown body builder for GitHub Issues
│   ├── api/
│   │   └── webhook.ts        # POST /webhook handler logic
│   └── backends/
│       ├── github.ts         # GitHub API client (create issue, search duplicates)
│       └── glitchtip.ts      # GlitchTip API client (fetch issue, fetch event)
├── tests/
│   ├── formatters.test.ts    # Body builder unit tests
│   ├── webhook.test.ts       # Webhook handler tests (mocked backends)
│   └── fixtures/             # Sample webhook payloads, API responses
│       ├── webhook-payload.json
│       ├── glitchtip-issue.json
│       └── glitchtip-event.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## Configuration

Environment variables loaded and validated at startup via `loadConfig()`. The function exits with a clear error if any required variable is missing.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | — | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | Yes | — | Target repo, e.g. `owner/repo` |
| `GLITCHTIP_API_URL` | Yes | — | GlitchTip base URL, e.g. `http://web:8000` |
| `GLITCHTIP_API_TOKEN` | Yes | — | GlitchTip API bearer token |
| `GLITCHTIP_WEBHOOK_SECRET` | No | `""` | Query param secret for webhook auth |
| `WEBHOOK_PORT` | No | `3001` | Server listen port |

Config is loaded once at startup and passed to modules via function arguments (no global state).

## Data Models (Zod Schemas)

All schemas defined in `src/models.ts`. TypeScript types inferred via `z.infer<>`.

### Inbound: Webhook Payload

GlitchTip sends Slack-compatible webhook payloads. Most fields are optional — only `title` and `title_link` on attachments are required for processing. Unknown fields are stripped by Zod's default behavior (intentional — we only parse what we use).

```typescript
const WebhookFieldSchema = z.object({
  title: z.string(),
  value: z.string(),
  short: z.boolean().optional(),
})

const WebhookAttachmentSchema = z.object({
  title: z.string(),
  title_link: z.string(),
  text: z.string().optional(),
  color: z.string().optional(),
  image_url: z.string().optional(),
  fields: z.array(WebhookFieldSchema).optional(),
})

const WebhookPayloadSchema = z.object({
  alias: z.string().optional(),
  text: z.string().optional(),
  attachments: z.array(WebhookAttachmentSchema).optional(),
})
```

### Internal: Parsed Attachment

```typescript
const ParsedAttachmentSchema = z.object({
  errorTitle: z.string(),
  glitchtipUrl: z.string(),
  glitchtipIssueId: z.string(),
  context: z.string(),
  project: z.string(),
  environment: z.string(),
  serverName: z.string(),
  release: z.string(),
})
```

### GlitchTip API Responses

The GlitchTip API returns Sentry-compatible formats. We define schemas for both the raw API response and the normalized internal representation.

**Issue metadata** — only the fields we use; validated with `.passthrough()` so extra fields don't cause failures:

```typescript
const GlitchtipIssueSchema = z.object({
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
}).passthrough()
```

**Event — raw API response format (Sentry-compatible):**

The event API returns an `entries` array where each entry has a `type` discriminator and a `data` payload. The two entry types we care about are `exception` and `csp`:

```typescript
const RawStackFrameSchema = z.object({
  function: z.string().optional(),
  filename: z.string().optional(),
  lineNo: z.number().optional(),
  colNo: z.number().optional(),
})

const RawExceptionValueSchema = z.object({
  type: z.string(),
  value: z.string(),
  stacktrace: z.object({
    frames: z.array(RawStackFrameSchema),
  }).optional(),
})

const RawExceptionEntrySchema = z.object({
  type: z.literal('exception'),
  data: z.object({
    values: z.array(RawExceptionValueSchema),
  }),
})

const RawCspEntrySchema = z.object({
  type: z.literal('csp'),
  data: z.object({
    effective_directive: z.string().optional(),
    blocked_uri: z.string().optional(),
    document_uri: z.string().optional(),
    disposition: z.string().optional(),
  }),
})

const RawEventEntrySchema = z.discriminatedUnion('type', [
  RawExceptionEntrySchema,
  RawCspEntrySchema,
]).or(z.object({ type: z.string() }).passthrough())  // ignore unknown entry types

const RawGlitchtipEventSchema = z.object({
  culprit: z.string().optional(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  entries: z.array(RawEventEntrySchema).optional(),
})
```

**Event — normalized internal representation:**

The `glitchtip.ts` backend normalizes the raw event into this shape before returning:

```typescript
interface GlitchtipEvent {
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
```

**Normalization logic** (in `backends/glitchtip.ts`):
1. Parse raw JSON with `RawGlitchtipEventSchema.safeParse()`. Return `null` on failure.
2. Find the entry with `type === 'exception'` → extract `data.values` as `exceptions`.
3. Find the entry with `type === 'csp'` → extract `data` as `csp`, or `null` if absent.
4. Lift `culprit` and `tags` from the top level (defaulting to `undefined` / `[]`).
5. Return the normalized `GlitchtipEvent` object.

### Validation Strategy

- **Webhook input:** Validated with `WebhookPayloadSchema.safeParse()` at the API boundary. Invalid payloads return 400.
- **GlitchTip API responses:** Validated with `RawGlitchtipEventSchema.safeParse()` / `GlitchtipIssueSchema.safeParse()` after fetch. On failure, the client returns `null` and logs the error. The raw event is then normalized into the internal `GlitchtipEvent` shape (see normalization logic above).
- **Parsed attachments:** Constructed programmatically from validated webhook data. Attachments missing `title`, `title_link`, or a valid issue ID regex match (`/\/issues\/(\d+)/`) are skipped entirely during parsing. For attachments that pass these checks, missing `fields` entries default to empty strings (e.g., if no `serverName` field is present, `serverName` becomes `""`). An empty `attachments` array (or omitted `attachments`) results in a 200 response with an empty `results` array.

## Module Responsibilities

### `src/api/webhook.ts` — POST /webhook handler

1. Validates webhook secret query param (if configured)
2. Parses JSON body, validates against `WebhookPayloadSchema`
3. Extracts attachments via `parseAttachments()` — regex for issue ID, field extraction into `ParsedAttachment`
4. For each valid attachment:
   - Checks for duplicate via `isDuplicate()`, which returns `false` on API error (fail-open — better to risk a duplicate than silently drop an alert). Error handling is internal to `isDuplicate()`; the webhook handler does not need to catch exceptions from it.
   - If not duplicate, enriches via GlitchTip API then creates the GitHub Issue
5. Returns JSON response with per-attachment results and summary

**Response format:**
```json
{
  "results": [
    { "glitchtipIssueId": "123", "status": "created", "issue": "https://github.com/owner/repo/issues/42" },
    { "glitchtipIssueId": "456", "status": "duplicate" },
    { "glitchtipIssueId": "789", "status": "error" }
  ],
  "summary": { "created": 1, "duplicates": 1, "errors": 1 }
}
```

**HTTP status:** 201 if any created, 200 if all duplicates, 502 if all errors and none created.

**GitHub Issue title format:** `[GlitchTip] <attachment.errorTitle>`

**Default labels:** `['bug', 'glitchtip']` — the `glitchtip` label is required for deduplication search to work.

### `src/backends/github.ts` — GitHub API client

- `isDuplicate(issueId: string): Promise<boolean>` — searches GitHub Issues with query `repo:{GITHUB_REPO} "glitchtip-id:{issueId}" label:glitchtip`. Returns `false` on API error (fail-open).
- `createIssue(title: string, body: string, labels: string[]): Promise<GitHubCreateResult>` — creates a GitHub Issue via REST API
- Uses `fetch` with `Authorization: Bearer` header, `X-GitHub-Api-Version: 2022-11-28`

### `src/backends/glitchtip.ts` — GlitchTip API client

- `fetchIssue(issueId: string): Promise<GlitchtipIssue | null>` — fetches `/api/0/issues/{id}/`, validates with `GlitchtipIssueSchema.safeParse()`. Returns `null` on HTTP error or validation failure.
- `fetchLatestEvent(issueId: string): Promise<GlitchtipEvent | null>` — fetches `/api/0/issues/{id}/events/latest/`, validates raw response with `RawGlitchtipEventSchema.safeParse()`, then normalizes into `GlitchtipEvent`. Returns `null` on failure.
- Both called concurrently via `Promise.all`. **Enrichment failure does not prevent issue creation** — the formatter handles null issue/event by omitting the corresponding sections.

### `src/formatters.ts` — Markdown body builder

- `buildErrorBody(attachment: ParsedAttachment, issue: GlitchtipIssue | null, event: GlitchtipEvent | null): string`
- Produces the GitHub Issue markdown body with:
  - Header table (project, environment, release, component, occurrences, first/last seen, server)
  - Tags table (filtered to exclude `release` and `environment` tags)
  - Stacktrace (frames reversed from Sentry's bottom-up order to natural top-down reading; missing frame fields default to `<anonymous>` / `<unknown>`)
  - CSP violation details (if `csp` is non-null)
  - Context quote from webhook
  - GlitchTip link
  - HTML comment marker for deduplication: `<!-- glitchtip-id:XXXX -->`
- `issue` and `event` params are nullable — sections sourced from enrichment data are omitted when data is unavailable
- Dates formatted as `YYYY-MM-DD HH:MM:SS UTC` via a `formatDate()` helper

### `src/server.ts` — HTTP server

- Creates `node:http` server
- Routes: `POST /webhook` → webhook handler, `GET /health` → `{ status: "ok" }`, else 404
- Delegates body parsing and response writing

### `src/config.ts` — Configuration

- `loadConfig(): Config` — reads env vars, validates required ones, returns frozen config object
- Exits process with descriptive error on missing required vars

### `src/index.ts` — Entry point

- Calls `loadConfig()`
- Passes config to `createServer()`
- Starts listening, logs port

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/webhook` | `?secret=` (optional) | Receive GlitchTip alert, create GitHub Issue(s) |
| `GET` | `/health` | None | Health check, returns `{ status: "ok" }` |

## Docker

### Dockerfile (multi-stage)

- **Stage 1 (builder):** `node:22-slim`, installs all deps, compiles TypeScript via `npm run build`
- **Stage 2 (runtime):** `node:22-slim`, installs production deps only, copies compiled `dist/`, runs `node dist/index.js`
- Built-in healthcheck: `node -e "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1))"`

### docker-compose.yml

Single service `glitchtip-github-bridge`:
- Builds from local Dockerfile
- Reads env from `.env` file
- Exposes port 3001
- Healthcheck with 30s interval

### .env.example

Documented template with all variables and descriptions.

## Testing

**Runner:** Vitest

### `tests/formatters.test.ts`
- Header table rendering with all fields present
- Stacktrace formatting (frame reversal, function/file/line output)
- CSP violation section rendering
- Tags table with release/environment filtered out
- GlitchTip link and dedup marker
- Sections omitted when issue/event data is null

### `tests/webhook.test.ts`
- Valid payload → calls GitHub API, returns 201
- Duplicate issue → skips creation, returns 200
- Missing/invalid attachments → returns 400
- Webhook secret validation (correct, wrong, missing when required)
- GitHub API failure → returns 502

### `tests/fixtures/`
- `webhook-payload.json` — realistic GlitchTip webhook payload
- `glitchtip-issue.json` — API response for issue metadata
- `glitchtip-event.json` — API response with stacktrace, tags, CSP entries

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Type safety, user preference |
| Runtime | Node.js 22 | Built-in fetch, native test runner fallback |
| HTTP | `node:http` | Zero deps, matches original code |
| Validation | Zod | Runtime validation, single schema source of truth |
| Testing | Vitest | Fast, TypeScript-native |
| Container | Docker multi-stage | Clean separation of build and runtime |

**Runtime dependencies:** `zod`
**Dev dependencies:** `typescript`, `@types/node`, `vitest`
