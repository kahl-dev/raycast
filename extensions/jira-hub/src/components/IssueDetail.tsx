import { List } from '@raycast/api'
import type { FlaggedIssue, JiraComment } from '../types'
import { formatSeconds, priorityShort, timeAgo } from '../logic/format'
import { adfToMarkdown } from '../api/adf'

export interface IssueDetailProps {
  item: FlaggedIssue
}

export function IssueDetail({ item }: IssueDetailProps) {
  const { issue } = item
  const comments = issue.fields.comment?.comments ?? []
  const lastThree = comments.slice(-3).reverse()

  return (
    <List.Item.Detail
      markdown={renderMarkdown(issue.fields.summary, lastThree)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Status" text={issue.fields.status.name} />
          <List.Item.Detail.Metadata.Label
            title="Priority"
            text={priorityShort(issue.fields.priority)}
          />
          <List.Item.Detail.Metadata.Label
            title="Estimate / Logged"
            text={`${formatSeconds(issue.fields.timeoriginalestimate)} / ${formatSeconds(issue.fields.timespent)}`}
          />
          <List.Item.Detail.Metadata.Label
            title="Assignee"
            text={issue.fields.assignee?.displayName ?? '—'}
          />
          <List.Item.Detail.Metadata.Label
            title="Reporter"
            text={issue.fields.reporter?.displayName ?? '—'}
          />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Updated"
            text={`${timeAgo(issue.fields.updated)} ago`}
          />
          <List.Item.Detail.Metadata.Label
            title="Project"
            text={issue.fields.project?.name ?? '—'}
          />
        </List.Item.Detail.Metadata>
      }
    />
  )
}

function renderMarkdown(summary: string, comments: JiraComment[]): string {
  const lines: string[] = []
  lines.push(`# ${summary}`, '')

  if (comments.length === 0) {
    lines.push('_Keine Comments._')
    return lines.join('\n')
  }

  lines.push('## Letzte Comments', '')
  for (const c of comments) {
    const author = c.author?.displayName ?? 'Unknown'
    const when = timeAgo(c.created)
    const body = adfToMarkdown(c.body)
    lines.push(`### ${author} · ${when}`, '', body || '_(empty)_', '')
  }

  return lines.join('\n')
}
