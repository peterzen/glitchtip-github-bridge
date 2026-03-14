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
