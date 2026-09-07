import { Action, ActionPanel, Icon, Color } from '@raycast/api'
import type { FlaggedIssue } from '../types'
import { branchName, ticketUrl } from '../logic/format'

export interface DashboardActionsProps {
  item: FlaggedIssue
  instanceUrl: string
  isShowingDetail: boolean
  onToggleDetail: () => void
  onRefresh: () => void
}

export function DashboardActions(props: DashboardActionsProps) {
  const { item, instanceUrl, isShowingDetail, onToggleDetail, onRefresh } = props
  const url = ticketUrl(instanceUrl, item.issue.key)
  const branch = branchName(item.issue)

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.OpenInBrowser url={url} title="Open in Jira" />
        <Action.CopyToClipboard
          title="Copy Key"
          content={item.issue.key}
          shortcut={{ modifiers: ['cmd'], key: 'c' }}
        />
        <Action.CopyToClipboard
          title="Copy URL"
          content={url}
          shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
        />
        <Action.CopyToClipboard
          title="Copy Branch Name"
          content={branch}
          icon={Icon.Code}
          shortcut={{ modifiers: ['cmd'], key: 'b' }}
        />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title={isShowingDetail ? 'Hide Detail Panel' : 'Show Detail Panel'}
          icon={isShowingDetail ? Icon.EyeDisabled : Icon.Eye}
          shortcut={{ modifiers: ['cmd'], key: 'd' }}
          onAction={onToggleDetail}
        />
        <Action
          title="Refresh"
          icon={{ source: Icon.RotateClockwise, tintColor: Color.Blue }}
          shortcut={{ modifiers: ['cmd', 'ctrl'], key: 'r' }}
          onAction={onRefresh}
        />
      </ActionPanel.Section>
    </ActionPanel>
  )
}
