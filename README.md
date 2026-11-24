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
| `GITHUB_TOKEN` | One of¹ | — | GitHub PAT with `repo` scope |
| `GITHUB_APP_ID` | One of¹ | — | GitHub App ID |
| `GITHUB_APP_INSTALLATION_ID` | With app | — | Installation ID of the app on the repo's owner |
| `GITHUB_APP_PRIVATE_KEY` | With app | — | App private key (PEM; newlines may be written as `\n`) |
| `GITHUB_REPO` | Yes | — | Target repo (e.g. `owner/repo`) |
| `GLITCHTIP_API_URL` | Yes | — | GlitchTip base URL |
| `GLITCHTIP_API_TOKEN` | Yes | — | GlitchTip API bearer token |
| `GLITCHTIP_WEBHOOK_SECRET` | No | — | Webhook authentication secret |
| `WEBHOOK_PORT` | No | `3001` | Server listen port |

¹ Set either `GITHUB_TOKEN` or the three `GITHUB_APP_*` variables, not both.

### Authenticating as a GitHub App

With a personal access token, issues are authored by the token's owner, and
GitHub never notifies people about their own activity, so the owner gets no
email for new issues. A GitHub App files issues as `<app-name>[bot]` instead,
so every watcher is notified.

1. Create a GitHub App on the account that owns the target repo, with
   **Issues: Read and write** and no webhook, and install it on the repo.
2. Generate a private key and note the App ID and the installation ID (the
   number at the end of the installation's settings URL).
3. Put the key on one line for the env file:
   `awk 'NF {printf "%s\\n", $0}' app.pem`

The bridge mints a one-hour installation token on first use and renews it
shortly before it expires.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
