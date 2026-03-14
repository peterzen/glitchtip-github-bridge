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
