import { describe, it, expect } from 'vitest'
import { activeSprint, isInActiveSprint, sprintProgress, sprintHeaderSubtitle } from './sprint'
import type { JiraIssue, JiraSprint } from '../types'

function makeIssueWithSprints(sprints: JiraSprint[] | null): JiraIssue {
  return {
    id: '1',
    key: 'TEST-1',
    self: '',
    fields: {
      summary: '',
      status: { name: 'In Progress' },
      project: { key: 'TEST', name: 'Example' },
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      customfield_10010: sprints,
    },
  }
}

const activeSprint1: JiraSprint = {
  id: 1,
  name: 'Sprint 47',
  state: 'active',
  startDate: '2026-05-12T08:00:00.000Z',
  endDate: '2026-05-25T17:00:00.000Z',
}

const closedSprint: JiraSprint = {
  id: 2,
  name: 'Sprint 46',
  state: 'closed',
  startDate: '2026-04-28T08:00:00.000Z',
  endDate: '2026-05-11T17:00:00.000Z',
}

describe('activeSprint', () => {
  it('returns null when no sprint field', () => {
    expect(activeSprint(makeIssueWithSprints(null))).toBeNull()
  })

  it('returns null when only closed sprints', () => {
    expect(activeSprint(makeIssueWithSprints([closedSprint]))).toBeNull()
  })

  it('returns active sprint when present', () => {
    const r = activeSprint(makeIssueWithSprints([closedSprint, activeSprint1]))
    expect(r?.name).toBe('Sprint 47')
  })
})

describe('isInActiveSprint', () => {
  it('true when ticket has active sprint', () => {
    expect(isInActiveSprint(makeIssueWithSprints([activeSprint1]))).toBe(true)
  })

  it('false otherwise', () => {
    expect(isInActiveSprint(makeIssueWithSprints([closedSprint]))).toBe(false)
  })
})

describe('sprintProgress', () => {
  it('computes day 7/14 on midpoint', () => {
    const now = new Date('2026-05-18T12:00:00.000Z')
    const p = sprintProgress(activeSprint1, now)
    expect(p.totalDays).toBe(14)
    expect(p.elapsedDays).toBe(7)
    expect(p.remainingDays).toBe(7)
    expect(p.pctThrough).toBe(50)
  })

  it('counts workdays remaining excluding weekends', () => {
    const now = new Date('2026-05-18T12:00:00.000Z') // Monday
    const p = sprintProgress(activeSprint1, now)
    // From Mon 2026-05-18 to Mon 2026-05-25: workdays = Tue/Wed/Thu/Fri/Mon = 5
    expect(p.workdaysRemaining).toBe(5)
  })

  it('clamps elapsedDays after sprint end', () => {
    const past = new Date('2026-06-30T00:00:00.000Z')
    const p = sprintProgress(activeSprint1, past)
    expect(p.elapsedDays).toBe(p.totalDays)
    expect(p.remainingDays).toBe(0)
    expect(p.workdaysRemaining).toBe(0)
  })
})

describe('sprintHeaderSubtitle', () => {
  it('returns undefined when no progress', () => {
    expect(sprintHeaderSubtitle(null)).toBeUndefined()
  })

  it('formats human-readable label', () => {
    const now = new Date('2026-05-18T12:00:00.000Z')
    const p = sprintProgress(activeSprint1, now)
    expect(sprintHeaderSubtitle(p)).toBe('Tag 7/14 · 5 Werktage Rest')
  })
})
