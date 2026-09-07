import { describe, it, expect } from 'vitest'
import { organize, type OrganizeContext } from './sections'
import type { JiraIssue, JiraSprint } from '../types'

const HOUR = 3600

function issue(opts: {
  key: string
  status?: string
  spent?: number
  estimate?: number
  sprintActive?: boolean
  lastCommentAuthor?: string
  lastCommentDate?: string
  updated?: string
}): JiraIssue {
  const sprint: JiraSprint | undefined = opts.sprintActive
    ? {
        id: 1,
        name: 'Sprint 47',
        state: 'active',
        startDate: '2026-05-12T08:00:00.000Z',
        endDate: '2026-05-25T17:00:00.000Z',
      }
    : undefined

  return {
    id: opts.key,
    key: opts.key,
    self: '',
    fields: {
      summary: 'X',
      status: { name: opts.status ?? 'In Progress' },
      project: { key: opts.key.split('-')[0] ?? '', name: '' },
      created: '2026-01-01T00:00:00.000Z',
      updated: opts.updated ?? new Date().toISOString(),
      timeoriginalestimate: opts.estimate,
      timespent: opts.spent,
      customfield_10010: sprint ? [sprint] : null,
      comment: opts.lastCommentDate
        ? {
            total: 1,
            comments: [
              {
                id: 'c1',
                author: {
                  accountId: opts.lastCommentAuthor ?? 'other',
                  displayName: 'Other',
                },
                created: opts.lastCommentDate,
                body: '?',
              },
            ],
          }
        : undefined,
    },
  }
}

const ctx: OrganizeContext = {
  myAccountId: 'me',
  thresholds: { overbookPct: 80, replyWorkdays: 1, staleWorkdays: 5 },
  internalCoreProjectKeys: ['LIA', 'LIAKI', 'LIAC'],
  devProjectKeys: ['LIADEV'],
}

describe('organize action view', () => {
  it('shows flagged sprint ticket in BOTH Needs-Action and Sprint', () => {
    const issues = [
      issue({ key: 'BITO-1', sprintActive: true, spent: 9 * HOUR, estimate: 10 * HOUR }), // overbook 90% in sprint
      issue({ key: 'BITO-2', sprintActive: true }), // clean sprint
    ]
    const sections = organize(issues, 'action', ctx)
    const byId = Object.fromEntries(sections.map((s) => [s.id, s.items.map((i) => i.issue.key)]))
    expect(byId['needs-action']).toEqual(['BITO-1'])
    expect(byId['sprint']).toEqual(['BITO-1', 'BITO-2'])
  })

  it('places clean tickets in their natural bucket only', () => {
    const issues = [
      issue({ key: 'BITO-2', sprintActive: true }),
      issue({ key: 'DENSO-1' }),
      issue({ key: 'LIA-1' }),
      issue({ key: 'LIADEV-1' }),
    ]
    const sections = organize(issues, 'action', ctx)
    const byId = Object.fromEntries(sections.map((s) => [s.id, s.items.map((i) => i.issue.key)]))
    expect(byId['needs-action']).toBeUndefined()
    expect(byId['sprint']).toEqual(['BITO-2'])
    expect(byId['kunden']).toEqual(['DENSO-1'])
    expect(byId['intern']).toEqual(['LIA-1'])
    expect(byId['liadev']).toEqual(['LIADEV-1'])
  })

  it('skips empty sections', () => {
    const issues = [issue({ key: 'BITO-1' })]
    const sections = organize(issues, 'action', ctx)
    expect(sections.map((s) => s.id)).toEqual(['kunden'])
  })

  it('puts internal-core projects in intern even if in sprint', () => {
    const issues = [issue({ key: 'LIAKI-1', sprintActive: true })]
    const sections = organize(issues, 'action', ctx)
    expect(sections[0]?.id).toBe('intern')
  })
})

describe('dev projects (LIADEV) never bubble to Needs-Action', () => {
  it('keeps overbooked LIADEV ticket in liadev section', () => {
    const issues = [
      issue({ key: 'LIADEV-99', spent: 12 * HOUR, estimate: 10 * HOUR }), // overbook violation
    ]
    const sections = organize(issues, 'action', ctx)
    expect(sections[0]?.id).toBe('liadev')
    expect(sections[0]?.items[0]?.flags.overbook?.severity).toBe('violation')
  })

  it('keeps stale LIADEV ticket in liadev section', () => {
    const issues = [issue({ key: 'LIADEV-99', updated: '2024-01-01T00:00:00.000Z' })]
    const sections = organize(issues, 'action', ctx)
    expect(sections[0]?.id).toBe('liadev')
  })

  it('non-dev overbooked still bubbles to Needs-Action AND stays in its bucket', () => {
    const issues = [issue({ key: 'BITO-1', spent: 12 * HOUR, estimate: 10 * HOUR })]
    const sections = organize(issues, 'action', ctx)
    expect(sections.map((s) => s.id).sort()).toEqual(['kunden', 'needs-action'])
  })
})

describe('organize bucket view', () => {
  it('does not extract Needs-Action — keeps in bucket', () => {
    const issues = [
      issue({ key: 'BITO-1', sprintActive: true, spent: 9 * HOUR, estimate: 10 * HOUR }),
    ]
    const sections = organize(issues, 'bucket', ctx)
    expect(sections[0]?.id).toBe('sprint')
    expect(sections[0]?.items[0]?.flags.overbook).not.toBeNull()
  })
})

describe('organize flat view', () => {
  it('returns single section, sorted by action priority', () => {
    const issues = [
      issue({ key: 'BITO-clean' }),
      issue({ key: 'BITO-stale', updated: '2026-04-01T00:00:00.000Z' }), // stale
      issue({ key: 'BITO-violation', spent: 12 * HOUR, estimate: 10 * HOUR }), // overbook violation
      issue({ key: 'BITO-warn', spent: 8.5 * HOUR, estimate: 10 * HOUR }), // overbook warn
    ]
    const sections = organize(issues, 'flat', ctx)
    expect(sections.length).toBe(1)
    expect(sections[0]?.items.map((i) => i.issue.key)).toEqual([
      'BITO-violation',
      'BITO-warn',
      'BITO-stale',
      'BITO-clean',
    ])
  })
})

describe('sprint subtitle', () => {
  it('decorates sprint section with name + day label', () => {
    const issues = [issue({ key: 'BITO-1', sprintActive: true })]
    const sections = organize(issues, 'action', ctx)
    expect(sections[0]?.subtitle).toMatch(/^Sprint 47 · Tag \d+\/\d+ · \d+ Werktage Rest$/)
  })
})
