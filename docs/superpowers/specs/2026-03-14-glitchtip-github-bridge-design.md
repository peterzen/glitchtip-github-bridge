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

```typescript
const WebhookFieldSchema = z.object({
  title: z.string(),
  value: z.string(),
  short: z.boolean(),
})

const WebhookAttachmentSchema = z.object({
  title: z.string(),
  title_link: z.string(),
  text: z.string(),
  color: z.string(),
  image_url: z.string(),
  fields: z.array(WebhookFieldSchema),
})

const WebhookPayloadSchema = z.object({
  alias: z.string(),
  text: z.string(),
  attachments: z.array(WebhookAttachmentSchema),
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

```typescript
const GlitchtipIssueSchema = z.object({
  count: z.number(),
  firstSeen: z.string(),
  lastSeen: z.string(),
})

const StackFrameSchema = z.object({
  function: z.string(),
  filename: z.string(),
  lineNo: z.number(),
  colNo: z.number(),
})

const ExceptionValueSchema = z.object({
  type: z.string(),
  value: z.string(),
  stacktrace: z.object({ frames: z.array(StackFrameSchema) }),
})

const CspDataSchema = z.object({
  effective_directive: z.string(),
  blocked_uri: z.string(),
  document_uri: z.string(),
  disposition: z.string(),
})

const GlitchtipEventSchema = z.object({
  culprit: z.string(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })),
  exceptions: z.array(ExceptionValueSchema),
  csp: CspDataSchema.nullable(),
})
```

### Validation Strategy

- **Webhook input:** Validated with `WebhookPayloadSchema.parse()` at the API boundary. Invalid payloads return 400.
- **GlitchTip API responses:** Validated with `.safeParse()` after fetch. The raw Sentry-format `entries` array is normalized into structured `exceptions` and `csp` fields before validation. If validation fails, the client returns `null`.
- **Parsed attachments:** Constructed programmatically from validated webhook data. Attachments missing `title`, `title_link`, or a valid issue ID regex match are skipped during parsing.

## Module Responsibilities

### `src/api/webhook.ts` — POST /webhook handler

1. Validates webhook secret query param (if configured)
2. Parses JSON body, validates against `WebhookPayloadSchema`
3. Extracts attachments via `parseAttachments()` — regex for issue ID, field extraction into `ParsedAttachment`
4. For each valid attachment:
   - Checks for duplicate via `isDuplicate()`
   - If not duplicate, calls `createGithubIssue()` which enriches via GlitchTip API then creates the issue
5. Returns JSON response with per-attachment results and summary
6. HTTP status: 201 if any created, 200 if all duplicates, 502 if all errors

### `src/backends/github.ts` — GitHub API client

- `isDuplicate(issueId: string): Promise<boolean>` — searches GitHub Issues for `<!-- glitchtip-id:XXXX -->` marker with `glitchtip` label
- `createIssue(title: string, body: string, labels: string[]): Promise<GitHubCreateResult>` — creates a GitHub Issue via REST API
- Uses `fetch` with `Authorization: Bearer` header, `X-GitHub-Api-Version: 2022-11-28`

### `src/backends/glitchtip.ts` — GlitchTip API client

- `fetchIssue(issueId: string): Promise<GlitchtipIssue | null>` — fetches `/api/0/issues/{id}/`, validates with `GlitchtipIssueSchema`
- `fetchLatestEvent(issueId: string): Promise<GlitchtipEvent | null>` — fetches `/api/0/issues/{id}/events/latest/`, normalizes `entries` array into `exceptions`/`csp`, validates with `GlitchtipEventSchema`
- Both called concurrently via `Promise.all`

### `src/formatters.ts` — Markdown body builder

- `buildErrorBody(attachment: ParsedAttachment, issue: GlitchtipIssue | null, event: GlitchtipEvent | null): string`
- Produces the GitHub Issue markdown body with:
  - Header table (project, environment, release, component, occurrences, first/last seen, server)
  - Tags table (filtered to exclude release/environment)
  - Stacktrace (formatted with reversed frames for natural reading)
  - CSP violation details (if present)
  - Context quote from webhook
  - GlitchTip link
  - HTML comment marker for deduplication: `<!-- glitchtip-id:XXXX -->`
- `issue` and `event` params are nullable to handle failed enrichment gracefully — sections are omitted when data is unavailable

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
- Built-in healthcheck via `fetch('http://localhost:3001/health')`

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
