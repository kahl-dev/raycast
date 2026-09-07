import { Color } from '@raycast/api'
import type { FlaggedIssue, OverbookFlag, JiraIssue, JiraPriority } from '../types'

export function branchName(issue: JiraIssue, prefix = 'feat'): string {
  const slug = issue.fields.summary
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `${prefix}/${issue.key}${slug ? `-${slug}` : ''}`
}

export function ticketUrl(instanceUrl: string, key: string): string {
  return `${instanceUrl.replace(/\/$/, '')}/browse/${key}`
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—'
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)}m`
  if (hours < 10) return `${hours.toFixed(1)}h`
  return `${Math.round(hours)}h`
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'gerade eben'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(days / 365)}y`
}

export function overbookColor(flag: OverbookFlag): Color {
  return flag.severity === 'violation' ? Color.Red : Color.Yellow
}

export function priorityColor(priority: JiraPriority | null | undefined): Color {
  if (!priority) return Color.SecondaryText
  switch (priority.name) {
    case 'Highest':
      return Color.Red
    case 'High':
      return Color.Orange
    case 'Medium':
      return Color.Yellow
    case 'Low':
      return Color.Blue
    case 'Lowest':
      return Color.SecondaryText
    default:
      return Color.PrimaryText
  }
}

export function priorityShort(priority: JiraPriority | null | undefined): string {
  if (!priority) return '—'
  switch (priority.name) {
    case 'Highest':
      return 'P0'
    case 'High':
      return 'P1'
    case 'Medium':
      return 'P2'
    case 'Low':
      return 'P3'
    case 'Lowest':
      return 'P4'
    default:
      return priority.name
  }
}

export function projectKey(issue: JiraIssue): string {
  if (issue.fields.project?.key) return issue.fields.project.key
  return issue.key.split('-')[0] ?? ''
}

export function actionRankLabel(item: FlaggedIssue): string {
  if (item.flags.overbook?.severity === 'violation') return 'Overbook'
  if (item.flags.overbook?.severity === 'warn') return 'At risk'
  if (item.flags.reply) return 'Reply needed'
  if (item.flags.stale) return 'Stale'
  return ''
}
