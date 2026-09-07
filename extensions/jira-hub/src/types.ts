export interface JiraAuthor {
  accountId: string
  displayName: string
  emailAddress?: string
}

export interface JiraStatus {
  name: string
  statusCategory?: { key: 'new' | 'indeterminate' | 'done'; name: string }
}

export interface JiraPriority {
  name: string
  id: string
}

export interface JiraSprint {
  id: number
  name: string
  state: 'active' | 'closed' | 'future'
  startDate: string
  endDate: string
  boardId?: number
  goal?: string
}

export interface JiraCommentBody {
  type: 'doc'
  version: number
  content: AdfNode[]
}

export interface AdfNode {
  type: string
  text?: string
  content?: AdfNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
}

export interface JiraComment {
  id: string
  author: JiraAuthor
  created: string
  body: JiraCommentBody | string
  updateAuthor?: JiraAuthor
  updated?: string
}

export interface JiraIssueFields {
  summary: string
  status: JiraStatus
  priority?: JiraPriority | null
  assignee?: JiraAuthor | null
  reporter?: JiraAuthor | null
  created: string
  updated: string
  timeoriginalestimate?: number | null
  timespent?: number | null
  timeestimate?: number | null
  project: { key: string; name: string }
  comment?: { comments: JiraComment[]; total: number; maxResults?: number }
  // Sprint custom field — Jira Cloud puts active sprint here as array
  customfield_10010?: JiraSprint[] | null
  [key: string]: unknown
}

export interface JiraIssue {
  id: string
  key: string
  self: string
  fields: JiraIssueFields
}

export interface JiraMyself {
  accountId: string
  displayName: string
  emailAddress: string
}

export interface OverbookFlag {
  severity: 'warn' | 'violation'
  pctSpent: number
  spentSeconds: number
  estimateSeconds: number
}

export interface ReplyFlag {
  waitingWorkdays: number
  lastAuthor: string
  lastCommentDate: string
}

export interface StaleFlag {
  staleWorkdays: number
  lastUpdated: string
}

export interface IssueFlags {
  overbook: OverbookFlag | null
  reply: ReplyFlag | null
  stale: StaleFlag | null
}

export interface FlaggedIssue {
  issue: JiraIssue
  flags: IssueFlags
}

export type ViewMode = 'action' | 'bucket' | 'flat'

export type SectionId = 'needs-action' | 'sprint' | 'kunden' | 'intern' | 'liadev'

export interface Section {
  id: SectionId
  title: string
  subtitle?: string
  items: FlaggedIssue[]
}

export interface DashboardData {
  issues: JiraIssue[]
  myself: JiraMyself
  activeSprint: JiraSprint | null
  fetchedAt: string
}
