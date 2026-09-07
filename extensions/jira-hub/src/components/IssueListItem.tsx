import { List, Icon, Color, type Image } from '@raycast/api'
import type { FlaggedIssue } from '../types'
import { overbookColor, priorityColor, priorityShort, timeAgo } from '../logic/format'
import { DashboardActions } from './DashboardActions'
import { IssueDetail } from './IssueDetail'

export interface IssueListItemProps {
  item: FlaggedIssue
  instanceUrl: string
  isShowingDetail: boolean
  onToggleDetail: () => void
  onRefresh: () => void
}

export function IssueListItem(props: IssueListItemProps) {
  const { item, instanceUrl, isShowingDetail, onToggleDetail, onRefresh } = props
  const { issue } = item

  return (
    <List.Item
      key={issue.key}
      title={issue.key}
      subtitle={isShowingDetail ? undefined : issue.fields.summary}
      icon={issueIcon(item)}
      accessories={isShowingDetail ? undefined : buildAccessories(item)}
      detail={isShowingDetail ? <IssueDetail item={item} /> : undefined}
      actions={
        <DashboardActions
          item={item}
          instanceUrl={instanceUrl}
          isShowingDetail={isShowingDetail}
          onToggleDetail={onToggleDetail}
          onRefresh={onRefresh}
        />
      }
    />
  )
}

function issueIcon(item: FlaggedIssue): Image.ImageLike {
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

function buildAccessories(item: FlaggedIssue): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = []
  const { issue, flags } = item

  if (flags.overbook) {
    accessories.push({
      tag: { value: `${flags.overbook.pctSpent}%`, color: overbookColor(flags.overbook) },
      tooltip: `Spent ${flags.overbook.pctSpent}% of estimate`,
    })
  }
  if (flags.reply) {
    accessories.push({
      tag: { value: `💬 ${flags.reply.waitingWorkdays}d`, color: Color.Blue },
      tooltip: `${flags.reply.lastAuthor} replied ${flags.reply.waitingWorkdays} workdays ago`,
    })
  }
  if (flags.stale) {
    accessories.push({
      tag: { value: `💤 ${flags.stale.staleWorkdays}d`, color: Color.SecondaryText },
      tooltip: `No update for ${flags.stale.staleWorkdays} workdays`,
    })
  }

  accessories.push({
    tag: {
      value: priorityShort(issue.fields.priority),
      color: priorityColor(issue.fields.priority),
    },
  })
  accessories.push({ tag: { value: issue.fields.status.name } })
  accessories.push({ text: timeAgo(issue.fields.updated) })
  return accessories
}
