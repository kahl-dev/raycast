import { Icon, MenuBarExtra, Color, open, launchCommand, LaunchType } from '@raycast/api'
import { useCachedPromise } from '@raycast/utils'
import { fetchMyself, searchJql } from './api/jira'
import { getPreferences } from './preferences'
import { organize } from './logic/sections'
import { actionRankLabel, ticketUrl } from './logic/format'
import type { FlaggedIssue } from './types'

const MENUBAR_JQL = 'assignee = currentUser() AND status NOT IN (Done, "Abgelehnt") ORDER BY rank'

async function loadCounts() {
  const [myself, issues] = await Promise.all([fetchMyself(), searchJql(MENUBAR_JQL)])
  return { myself, issues }
}

export default function MenuBar() {
  const prefs = getPreferences()
  const { data, isLoading, error, revalidate } = useCachedPromise(loadCounts, [], {
    keepPreviousData: true,
  })

  if (error) {
    return (
      <MenuBarExtra icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }} title="Jira ?">
        <MenuBarExtra.Item title={error.message} />
        <MenuBarExtra.Item
          title="Retry"
          icon={Icon.RotateClockwise}
          onAction={() => revalidate()}
        />
      </MenuBarExtra>
    )
  }

  const sections = data
    ? organize(data.issues, 'action', {
        myAccountId: data.myself.accountId,
        thresholds: {
          overbookPct: prefs.overbookThresholdPct,
          replyWorkdays: prefs.replyThresholdWorkdays,
          staleWorkdays: prefs.staleThresholdWorkdays,
        },
        internalCoreProjectKeys: prefs.internalCoreProjectKeys,
        devProjectKeys: prefs.devProjectKeys,
      })
    : []

  const needsActionSection = sections.find((s) => s.id === 'needs-action')
  const sprintSection = sections.find((s) => s.id === 'sprint')
  const needsActionItems = (needsActionSection?.items ?? []).slice(0, 5)
  const sprintCount = sprintSection?.items.length ?? 0
  const needsActionCount = needsActionSection?.items.length ?? 0

  const title = formatTitle(sprintCount, needsActionCount)

  return (
    <MenuBarExtra
      icon={titleIcon(needsActionCount)}
      title={title}
      isLoading={isLoading}
      tooltip={`${sprintCount} Sprint · ${needsActionCount} Needs Action`}>
      {needsActionItems.length > 0 && (
        <MenuBarExtra.Section title="Needs Action">
          {needsActionItems.map((item) => renderItem(item, prefs.instanceUrl))}
        </MenuBarExtra.Section>
      )}
      {needsActionItems.length === 0 && (
        <MenuBarExtra.Section>
          <MenuBarExtra.Item title="No action items — alles im grünen Bereich." />
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Open Full Dashboard"
          icon={Icon.AppWindow}
          onAction={() =>
            launchCommand({ name: 'dashboard', type: LaunchType.UserInitiated }).catch(() => null)
          }
        />
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.RotateClockwise}
          onAction={() => revalidate()}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  )
}

function renderItem(item: FlaggedIssue, instanceUrl: string) {
  const url = ticketUrl(instanceUrl, item.issue.key)
  const subtitle = [actionRankLabel(item), item.issue.fields.status.name]
    .filter(Boolean)
    .join(' · ')
  return (
    <MenuBarExtra.Item
      key={item.issue.key}
      title={`${item.issue.key} · ${item.issue.fields.summary}`}
      subtitle={subtitle}
      icon={itemIcon(item)}
      onAction={() => open(url)}
    />
  )
}

function formatTitle(sprint: number, needsAction: number): string {
  if (needsAction === 0) return `${sprint}`
  return `${sprint} · ⚠ ${needsAction}`
}

function titleIcon(needsAction: number) {
  if (needsAction === 0) return { source: Icon.Tag, tintColor: Color.PrimaryText }
  return { source: Icon.ExclamationMark, tintColor: Color.Red }
}

function itemIcon(item: FlaggedIssue) {
  if (item.flags.overbook?.severity === 'violation') {
    return { source: Icon.ExclamationMark, tintColor: Color.Red }
  }
  if (item.flags.overbook?.severity === 'warn') {
    return { source: Icon.Clock, tintColor: Color.Yellow }
  }
  if (item.flags.reply) return { source: Icon.SpeechBubble, tintColor: Color.Blue }
  if (item.flags.stale) return { source: Icon.Snowflake, tintColor: Color.SecondaryText }
  return { source: Icon.Circle, tintColor: Color.PrimaryText }
}
