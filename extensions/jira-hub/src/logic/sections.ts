import type { FlaggedIssue, JiraIssue, Section, SectionId, ViewMode } from '../types'
import { computeFlags, needsAction, type BucketThresholds } from './buckets'
import { activeSprint, isInActiveSprint, sprintHeaderSubtitle, sprintProgress } from './sprint'

export interface OrganizeContext {
  myAccountId: string
  thresholds: BucketThresholds
  /** Projects belonging to internal-core section (e.g. LIA, LIAKI, LIAC). */
  internalCoreProjectKeys: string[]
  /** Projects shown dimmed at the bottom (e.g. LIADEV). */
  devProjectKeys: string[]
}

export function organize(issues: JiraIssue[], view: ViewMode, ctx: OrganizeContext): Section[] {
  const flagged: FlaggedIssue[] = issues.map((issue) => ({
    issue,
    flags: computeFlags(issue, ctx.myAccountId, ctx.thresholds),
  }))

  if (view === 'action') return organizeByAction(flagged, ctx)
  if (view === 'bucket') return organizeByBucket(flagged, ctx)
  return organizeFlat(flagged)
}

function organizeByAction(items: FlaggedIssue[], ctx: OrganizeContext): Section[] {
  const sections: Section[] = [
    { id: 'needs-action', title: '🔴 Needs Action', items: [] },
    { id: 'sprint', title: '🟡 Sprint', items: [] },
    { id: 'kunden', title: '🟠 Kunden', items: [] },
    { id: 'intern', title: '⚫ Intern', items: [] },
    { id: 'liadev', title: '⬜ Backlog', items: [] },
  ]

  for (const item of items) {
    const naturalBucket = classify(item, ctx, /* extractFromBucketsIfFlagged */ false)
    sectionById(sections, naturalBucket).items.push(item)

    // Backlog (LIADEV/LIAW) tickets never bubble — even when flagged. They sit
    // legitimately stale for years. Other flagged tickets also surface in
    // Needs-Action so they're visible regardless of which bucket the user scrolls to.
    if (naturalBucket !== 'liadev' && needsAction(item.flags)) {
      sectionById(sections, 'needs-action').items.push(item)
    }
  }

  decorateSprint(sections, items)
  decorateCounts(sections)
  return sections.filter((s) => s.items.length > 0)
}

function organizeByBucket(items: FlaggedIssue[], ctx: OrganizeContext): Section[] {
  const sections: Section[] = [
    { id: 'sprint', title: '🟡 Sprint', items: [] },
    { id: 'kunden', title: '🟠 Kunden', items: [] },
    { id: 'intern', title: '⚫ Intern', items: [] },
    { id: 'liadev', title: '⬜ Backlog', items: [] },
  ]

  for (const item of items) {
    const target = classify(item, ctx, /* extractFromBucketsIfFlagged */ false)
    sectionById(sections, target).items.push(item)
  }

  decorateSprint(sections, items)
  decorateCounts(sections)
  return sections.filter((s) => s.items.length > 0)
}

function organizeFlat(items: FlaggedIssue[]): Section[] {
  const sorted = [...items].sort(byActionPriority)
  return [
    {
      id: 'needs-action',
      title: 'All Issues',
      subtitle: `${items.length}`,
      items: sorted,
    },
  ]
}

function classify(
  item: FlaggedIssue,
  ctx: OrganizeContext,
  extractFromBucketsIfFlagged: boolean
): SectionId {
  const projectKey = projectKeyOf(item.issue)
  const isDev = ctx.devProjectKeys.includes(projectKey)

  // Dev/backlog projects (e.g. LIADEV) never bubble into Needs-Action — they may legitimately
  // sit stale for years. Flags still render as accessories in their dimmed bucket.
  if (extractFromBucketsIfFlagged && needsAction(item.flags) && !isDev) return 'needs-action'

  if (isDev) return 'liadev'
  if (ctx.internalCoreProjectKeys.includes(projectKey)) return 'intern'
  if (isInActiveSprint(item.issue)) return 'sprint'
  return 'kunden'
}

function decorateSprint(sections: Section[], items: FlaggedIssue[]): void {
  const sprintSection = sections.find((s) => s.id === 'sprint')
  if (!sprintSection) return

  const firstSprintItem = items.find((i) => isInActiveSprint(i.issue))
  if (!firstSprintItem) return

  const sprint = activeSprint(firstSprintItem.issue)
  if (!sprint) return

  const progress = sprintProgress(sprint)
  const sub = sprintHeaderSubtitle(progress)
  if (sub) sprintSection.subtitle = `${sprint.name} · ${sub}`
}

function decorateCounts(sections: Section[]): void {
  for (const section of sections) {
    if (section.subtitle) continue
    section.subtitle = `${section.items.length}`
  }
}

function sectionById(sections: Section[], id: SectionId): Section {
  const section = sections.find((s) => s.id === id)
  if (!section) {
    throw new Error(`Unknown section id: ${id}`)
  }
  return section
}

function projectKeyOf(issue: JiraIssue): string {
  if (issue.fields.project?.key) return issue.fields.project.key
  const prefix = issue.key.split('-')[0]
  return prefix ?? ''
}

const ACTION_RANK: Record<string, number> = {
  overbookViolation: 0,
  overbookWarn: 1,
  reply: 2,
  stale: 3,
  plain: 4,
}

function rankOf(item: FlaggedIssue): number {
  if (item.flags.overbook?.severity === 'violation') return ACTION_RANK.overbookViolation
  if (item.flags.overbook?.severity === 'warn') return ACTION_RANK.overbookWarn
  if (item.flags.reply) return ACTION_RANK.reply
  if (item.flags.stale) return ACTION_RANK.stale
  return ACTION_RANK.plain
}

function byActionPriority(a: FlaggedIssue, b: FlaggedIssue): number {
  return rankOf(a) - rankOf(b)
}
