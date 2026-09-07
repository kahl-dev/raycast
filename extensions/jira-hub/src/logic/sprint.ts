import type { JiraIssue, JiraSprint } from '../types'
import { workdaysSince } from './buckets'

const SPRINT_CUSTOMFIELD = 'customfield_10010'

export function activeSprint(issue: JiraIssue): JiraSprint | null {
  const raw = issue.fields[SPRINT_CUSTOMFIELD]
  if (!Array.isArray(raw)) return null
  const sprints = raw as JiraSprint[]
  return sprints.find((s) => s.state === 'active') ?? null
}

export function isInActiveSprint(issue: JiraIssue): boolean {
  return activeSprint(issue) !== null
}

export interface SprintProgress {
  name: string
  startDate: Date
  endDate: Date
  totalDays: number
  elapsedDays: number
  remainingDays: number
  workdaysRemaining: number
  pctThrough: number
}

export function sprintProgress(sprint: JiraSprint, now: Date = new Date()): SprintProgress {
  const start = parseJiraDate(sprint.startDate)
  const end = parseJiraDate(sprint.endDate)
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
  const elapsedDays = Math.max(
    0,
    Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / 86_400_000))
  )
  const remainingDays = Math.max(0, totalDays - elapsedDays)
  const workdaysRemaining = workdaysSince(now, end)
  const pctThrough = Math.round((elapsedDays / totalDays) * 100)

  return {
    name: sprint.name,
    startDate: start,
    endDate: end,
    totalDays,
    elapsedDays,
    remainingDays,
    workdaysRemaining,
    pctThrough,
  }
}

/**
 * Jira ISO date strings use "Z" suffix — JS Date handles them natively
 * but we normalize for consistency with daily-standup.py:954.
 */
function parseJiraDate(iso: string): Date {
  return new Date(iso.replace('Z', '+00:00'))
}

export function sprintHeaderSubtitle(progress: SprintProgress | null): string | undefined {
  if (!progress) return undefined
  return `Tag ${progress.elapsedDays}/${progress.totalDays} · ${progress.workdaysRemaining} Werktage Rest`
}
