import type {
  JiraIssue,
  JiraComment,
  JiraCommentBody,
  IssueFlags,
  OverbookFlag,
  ReplyFlag,
  StaleFlag,
} from '../types'

// Status names treated as "open" — match Patrick's daily-standup.py
const CLOSED_STATUSES = new Set(['Done', 'Abgelehnt'])
const IN_PROGRESS_STATUSES = new Set(['In Progress', 'In Bearbeitung'])

/**
 * Count workdays (Mon-Fri) strictly between `from` and `to`, exclusive of `from`, inclusive of `to`.
 * Phase 1: no holidays/absences (Time-Butler integration deferred).
 */
export function workdaysSince(from: Date, to: Date = new Date()): number {
  const start = startOfDay(from)
  const end = startOfDay(to)
  if (end <= start) return 0

  let count = 0
  const cursor = new Date(start)
  cursor.setDate(cursor.getDate() + 1)

  while (cursor <= end) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * Pflicht-B Overbook detection (daily-standup.py:661-729).
 * Flags tickets where time spent crosses the configured percentage of the original estimate.
 */
export function detectOverbook(issue: JiraIssue, thresholdPct: number): OverbookFlag | null {
  const est = issue.fields.timeoriginalestimate ?? 0
  const spent = issue.fields.timespent ?? 0
  if (est <= 0 || spent <= 0) return null

  const ratio = spent / est
  if (ratio * 100 < thresholdPct) return null

  return {
    severity: ratio >= 1.0 ? 'violation' : 'warn',
    pctSpent: Math.round(ratio * 100),
    spentSeconds: spent,
    estimateSeconds: est,
  }
}

/**
 * Reply-needed detection (daily-standup.py:536-570).
 * Flags tickets where the last comment is from someone other than the user
 * and the comment is older than `thresholdWorkdays` workdays.
 */
export function detectReplyNeeded(
  issue: JiraIssue,
  myAccountId: string,
  thresholdWorkdays: number
): ReplyFlag | null {
  const comments = issue.fields.comment?.comments ?? []
  if (comments.length === 0) return null

  const last = comments[comments.length - 1]
  if (!last) return null
  if (last.author.accountId === myAccountId) return null

  const waiting = workdaysSince(new Date(last.created))
  if (waiting < thresholdWorkdays) return null

  return {
    waitingWorkdays: waiting,
    lastAuthor: last.author.displayName,
    lastCommentDate: last.created,
  }
}

/**
 * Stale detection (daily-standup.py:377-404).
 * Flags In-Progress tickets that have not been updated for `thresholdWorkdays` workdays.
 * Backlog/Selected tickets do not qualify — they may legitimately wait.
 */
export function detectStale(issue: JiraIssue, thresholdWorkdays: number): StaleFlag | null {
  const status = issue.fields.status.name
  if (CLOSED_STATUSES.has(status)) return null
  if (!IN_PROGRESS_STATUSES.has(status)) return null

  const stale = workdaysSince(new Date(issue.fields.updated))
  if (stale < thresholdWorkdays) return null

  return {
    staleWorkdays: stale,
    lastUpdated: issue.fields.updated,
  }
}

export interface BucketThresholds {
  overbookPct: number
  replyWorkdays: number
  staleWorkdays: number
}

export function computeFlags(
  issue: JiraIssue,
  myAccountId: string,
  thresholds: BucketThresholds
): IssueFlags {
  return {
    overbook: detectOverbook(issue, thresholds.overbookPct),
    reply: detectReplyNeeded(issue, myAccountId, thresholds.replyWorkdays),
    stale: detectStale(issue, thresholds.staleWorkdays),
  }
}

export function needsAction(flags: IssueFlags): boolean {
  return flags.overbook !== null || flags.reply !== null || flags.stale !== null
}

/**
 * Plain-text extraction for ADF body (compact, used when matching mentions or counting chars).
 * Full ADF→Markdown lives in src/api/adf.ts — this is the minimal variant for bucket-logic checks.
 */
export function adfPlainText(body: JiraCommentBody | string | undefined): string {
  if (!body) return ''
  if (typeof body === 'string') return body

  const parts: string[] = []
  const visit = (node: { type: string; text?: string; content?: unknown }) => {
    if (typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child as { type: string; text?: string; content?: unknown })
      }
    }
  }
  visit(body)
  return parts.join('').trim()
}

export function lastComment(issue: JiraIssue): JiraComment | null {
  const comments = issue.fields.comment?.comments ?? []
  return comments[comments.length - 1] ?? null
}
