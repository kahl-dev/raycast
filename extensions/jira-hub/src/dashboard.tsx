import { List, Action, ActionPanel, Icon, openExtensionPreferences } from '@raycast/api'
import { useCachedPromise } from '@raycast/utils'
import { useState } from 'react'
import { fetchMyself, searchJql, JiraApiError } from './api/jira'
import { getPreferences } from './preferences'
import { organize, type OrganizeContext } from './logic/sections'
import { IssueListItem } from './components/IssueListItem'
import type { ViewMode } from './types'

const DASHBOARD_JQL = 'assignee = currentUser() AND status NOT IN (Done, "Abgelehnt") ORDER BY rank'

async function loadDashboard() {
  const [myself, issues] = await Promise.all([fetchMyself(), searchJql(DASHBOARD_JQL)])
  return { myself, issues, fetchedAt: new Date().toISOString() }
}

export default function Dashboard() {
  const prefs = getPreferences()
  const [view, setView] = useState<ViewMode>('action')
  const [isShowingDetail, setIsShowingDetail] = useState(false)

  const { data, isLoading, error, revalidate } = useCachedPromise(loadDashboard, [], {
    keepPreviousData: true,
  })

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title={error instanceof JiraApiError ? `Jira API ${error.status}` : 'Failed to load'}
          description={error.message}
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
              <Action title="Retry" icon={Icon.RotateClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      </List>
    )
  }

  const ctx: OrganizeContext = {
    myAccountId: data?.myself?.accountId ?? '',
    thresholds: {
      overbookPct: prefs.overbookThresholdPct,
      replyWorkdays: prefs.replyThresholdWorkdays,
      staleWorkdays: prefs.staleThresholdWorkdays,
    },
    internalCoreProjectKeys: prefs.internalCoreProjectKeys,
    devProjectKeys: prefs.devProjectKeys,
  }

  const sections = data ? organize(data.issues, view, ctx) : []

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search tickets, projects, summaries..."
      searchBarAccessory={
        <List.Dropdown tooltip="View" value={view} onChange={(v) => setView(v as ViewMode)}>
          <List.Dropdown.Item title="Action Priority" value="action" />
          <List.Dropdown.Item title="By Bucket" value="bucket" />
          <List.Dropdown.Item title="Flat" value="flat" />
        </List.Dropdown>
      }>
      {sections.map((section) => (
        <List.Section key={section.id} title={section.title} subtitle={section.subtitle}>
          {section.items.map((item) => (
            <IssueListItem
              key={`${section.id}-${item.issue.key}`}
              item={item}
              instanceUrl={prefs.instanceUrl}
              isShowingDetail={isShowingDetail}
              onToggleDetail={() => setIsShowingDetail((x) => !x)}
              onRefresh={revalidate}
            />
          ))}
        </List.Section>
      ))}
      {!isLoading && data && sections.length === 0 && (
        <List.EmptyView title="Keine offenen Tickets" description="JQL returned 0 issues" />
      )}
    </List>
  )
}
