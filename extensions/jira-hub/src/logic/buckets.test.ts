import { describe, it, expect } from 'vitest'
import {
  workdaysSince,
  detectOverbook,
  detectReplyNeeded,
  detectStale,
  computeFlags,
  needsAction,
  adfPlainText,
} from './buckets'
import type { JiraIssue, JiraComment } from '../types'

const HOUR = 3600

function makeIssue(overrides: Partial<JiraIssue['fields']> = {}, key = 'TEST-1'): JiraIssue {
  return {
    id: '1',
    key,
    self: 'https://example.atlassian.net/rest/api/3/issue/1',
    fields: {
      summary: 'Example issue',
      status: { name: 'In Progress' },
      project: { key: key.split('-')[0] ?? 'TEST', name: 'Example' },
      created: '2026-01-01T08:00:00.000+0000',
      updated: '2026-05-15T08:00:00.000+0000',
      ...overrides,
    },
  }
}

function makeComment(
  body: string,
  authorAccountId: string,
  createdISO: string,
  displayName = 'Other Person'
): JiraComment {
  return {
    id: 'c1',
    author: { accountId: authorAccountId, displayName },
    created: createdISO,
    body,
  }
}

describe('workdaysSince', () => {
  it('returns 0 when from === to', () => {
    const d = new Date('2026-05-18T12:00:00Z')
    expect(workdaysSince(d, d)).toBe(0)
  })

  it('counts one workday Mon→Tue', () => {
    const mon = new Date('2026-05-18T09:00:00Z')
    const tue = new Date('2026-05-19T09:00:00Z')
    expect(workdaysSince(mon, tue)).toBe(1)
  })

  it('skips weekend Fri→Mon', () => {
    const fri = new Date('2026-05-15T09:00:00Z')
    const mon = new Date('2026-05-18T09:00:00Z')
    expect(workdaysSince(fri, mon)).toBe(1)
  })

  it('counts 5 workdays over a full week', () => {
    const lastMon = new Date('2026-05-11T09:00:00Z')
    const mon = new Date('2026-05-18T09:00:00Z')
    expect(workdaysSince(lastMon, mon)).toBe(5)
  })
})

describe('detectOverbook', () => {
  it('returns null when no estimate', () => {
    expect(detectOverbook(makeIssue({ timeoriginalestimate: null }), 80)).toBeNull()
  })

  it('returns null when no time spent', () => {
    expect(
      detectOverbook(makeIssue({ timeoriginalestimate: 8 * HOUR, timespent: 0 }), 80)
    ).toBeNull()
  })

  it('returns null under threshold', () => {
    expect(
      detectOverbook(makeIssue({ timeoriginalestimate: 8 * HOUR, timespent: 5 * HOUR }), 80)
    ).toBeNull()
  })

  it('returns warn at 80%', () => {
    const r = detectOverbook(
      makeIssue({ timeoriginalestimate: 10 * HOUR, timespent: 8 * HOUR }),
      80
    )
    expect(r).toEqual({
      severity: 'warn',
      pctSpent: 80,
      spentSeconds: 8 * HOUR,
      estimateSeconds: 10 * HOUR,
    })
  })

  it('returns violation at 100%+', () => {
    const r = detectOverbook(
      makeIssue({ timeoriginalestimate: 10 * HOUR, timespent: 12 * HOUR }),
      80
    )
    expect(r?.severity).toBe('violation')
    expect(r?.pctSpent).toBe(120)
  })
})

describe('detectReplyNeeded', () => {
  it('returns null when no comments', () => {
    expect(detectReplyNeeded(makeIssue(), 'me', 1)).toBeNull()
  })

  it('returns null when I was the last commenter', () => {
    const issue = makeIssue({
      comment: {
        total: 1,
        comments: [makeComment('hi', 'me', daysAgoIso(10))],
      },
    })
    expect(detectReplyNeeded(issue, 'me', 1)).toBeNull()
  })

  it('returns null when someone else replied today', () => {
    const issue = makeIssue({
      comment: {
        total: 1,
        comments: [makeComment('hi', 'other', daysAgoIso(0))],
      },
    })
    expect(detectReplyNeeded(issue, 'me', 1)).toBeNull()
  })

  it('returns flag when last comment is from someone else > threshold', () => {
    const issue = makeIssue({
      comment: {
        total: 1,
        comments: [makeComment('?', 'other', workdaysAgoIso(3), 'Ben')],
      },
    })
    const r = detectReplyNeeded(issue, 'me', 1)
    expect(r?.waitingWorkdays).toBeGreaterThanOrEqual(3)
    expect(r?.lastAuthor).toBe('Ben')
  })
})

describe('detectStale', () => {
  it('returns null for Done', () => {
    expect(detectStale(makeIssue({ status: { name: 'Done' } }), 5)).toBeNull()
  })

  it('returns null for Backlog (not In Progress)', () => {
    expect(
      detectStale(makeIssue({ status: { name: 'Backlog' }, updated: workdaysAgoIso(20) }), 5)
    ).toBeNull()
  })

  it('returns null for fresh In Progress', () => {
    expect(
      detectStale(makeIssue({ status: { name: 'In Progress' }, updated: daysAgoIso(0) }), 5)
    ).toBeNull()
  })

  it('returns flag for stale In Progress', () => {
    const r = detectStale(
      makeIssue({ status: { name: 'In Progress' }, updated: workdaysAgoIso(10) }),
      5
    )
    expect(r?.staleWorkdays).toBeGreaterThanOrEqual(5)
  })
})

describe('computeFlags + needsAction', () => {
  it('needsAction false for clean ticket', () => {
    const flags = computeFlags(makeIssue({ updated: daysAgoIso(0) }), 'me', {
      overbookPct: 80,
      replyWorkdays: 1,
      staleWorkdays: 5,
    })
    expect(needsAction(flags)).toBe(false)
  })

  it('needsAction true when overbooked', () => {
    const issue = makeIssue({
      timeoriginalestimate: 10 * HOUR,
      timespent: 9 * HOUR,
      updated: daysAgoIso(0),
    })
    const flags = computeFlags(issue, 'me', { overbookPct: 80, replyWorkdays: 1, staleWorkdays: 5 })
    expect(needsAction(flags)).toBe(true)
    expect(flags.overbook?.pctSpent).toBe(90)
  })
})

describe('adfPlainText', () => {
  it('returns empty string for undefined', () => {
    expect(adfPlainText(undefined)).toBe('')
  })

  it('passes through string', () => {
    expect(adfPlainText('hello world')).toBe('hello world')
  })

  it('flattens ADF doc with nested content', () => {
    const adf = {
      type: 'doc' as const,
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    }
    expect(adfPlainText(adf)).toBe('Hello world')
  })
})

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function workdaysAgoIso(workdays: number): string {
  // Approximate: just multiply by 1.4 to skip weekends. Tests use >= comparisons.
  const calendarDays = Math.ceil(workdays * 1.4) + 2
  return daysAgoIso(calendarDays)
}
