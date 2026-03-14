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
