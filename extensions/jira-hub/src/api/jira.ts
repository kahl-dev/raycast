import type { JiraIssue, JiraMyself, JiraComment } from '../types'
import { getPreferences } from '../preferences'

const DEFAULT_FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'reporter',
  'created',
  'updated',
  'timeoriginalestimate',
  'timespent',
  'timeestimate',
  'project',
  'comment',
  'customfield_10010',
] as const

class JiraApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string, hint: string) {
    super(`Jira API ${status}: ${hint}${body ? ` — ${body}` : ''}`)
    this.name = 'JiraApiError'
    this.status = status
    this.body = body
  }
}

interface JiraClientConfig {
  baseUrl: string
  authHeader: string
}

function getClient(): JiraClientConfig {
  const prefs = getPreferences()
  const baseUrl = `${prefs.instanceUrl}/rest/api/3`
  const authHeader = `Basic ${Buffer.from(`${prefs.email}:${prefs.apiToken}`).toString('base64')}`
  return { baseUrl, authHeader }
}

async function request<T>(
  path: string,
  params?: Record<string, string | number>,
  signal?: AbortSignal
): Promise<T> {
  const { baseUrl, authHeader } = getClient()
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'User-Agent': 'raycast-jira-hub/0.1',
    },
    signal,
  })

  if (!response.ok) {
    const body = await response.text()
    const hint =
      response.status === 401
        ? 'auth failed (check email + API token in Preferences)'
        : response.status === 403
          ? 'forbidden (token lacks permission?)'
          : response.status === 404
            ? 'not found'
            : response.status === 400
              ? 'bad request (JQL invalid?)'
              : 'unexpected status'
    throw new JiraApiError(response.status, body, hint)
  }

  return (await response.json()) as T
}

export async function fetchMyself(signal?: AbortSignal): Promise<JiraMyself> {
  return request<JiraMyself>('/myself', undefined, signal)
}

interface JqlSearchResponse {
  issues: JiraIssue[]
  isLast?: boolean
  total?: number
  startAt?: number
}

export async function searchJql(
  jql: string,
  fields: readonly string[] = DEFAULT_FIELDS,
  maxResults = 100,
  signal?: AbortSignal
): Promise<JiraIssue[]> {
  const all: JiraIssue[] = []
  let startAt = 0
  let hasMore = true

  // Paginate offset-based — mirrors search-jql.py:170 fallback path.
  while (hasMore) {
    const page = await request<JqlSearchResponse>(
      '/search/jql',
      {
        jql,
        fields: fields.join(','),
        maxResults,
        startAt,
      },
      signal
    )

    all.push(...page.issues)

    const isLast =
      page.isLast === true ||
      page.issues.length < maxResults ||
      (typeof page.total === 'number' && startAt + page.issues.length >= page.total)

    if (isLast) {
      hasMore = false
    } else {
      startAt += page.issues.length
    }
  }

  return all
}

interface CommentsResponse {
  comments: JiraComment[]
  total: number
  startAt: number
  maxResults: number
}

export async function fetchComments(
  issueKey: string,
  signal?: AbortSignal
): Promise<JiraComment[]> {
  const all: JiraComment[] = []
  let startAt = 0
  let hasMore = true
  const pageSize = 100

  while (hasMore) {
    const page = await request<CommentsResponse>(
      `/issue/${encodeURIComponent(issueKey)}/comment`,
      { startAt, maxResults: pageSize },
      signal
    )
    all.push(...page.comments)
    if (startAt + page.comments.length >= page.total || page.comments.length === 0) {
      hasMore = false
    } else {
      startAt += page.comments.length
    }
  }

  return all
}

export { JiraApiError, DEFAULT_FIELDS }
