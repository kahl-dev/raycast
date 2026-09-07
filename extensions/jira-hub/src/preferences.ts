import { getPreferenceValues } from '@raycast/api'

interface RawPreferences {
  instanceUrl: string
  email: string
  apiToken: string
  internalProjectKeys?: string
  devProjectKeys?: string
  internalCoreProjectKeys?: string
  overbookThresholdPct?: string
  replyThresholdWorkdays?: string
  staleThresholdWorkdays?: string
}

export interface Preferences {
  instanceUrl: string
  email: string
  apiToken: string
  internalProjectKeys: string[]
  devProjectKeys: string[]
  internalCoreProjectKeys: string[]
  overbookThresholdPct: number
  replyThresholdWorkdays: number
  staleThresholdWorkdays: number
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback
  return value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

function parseInt10(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export function getPreferences(): Preferences {
  const raw = getPreferenceValues<RawPreferences>()
  return {
    instanceUrl: raw.instanceUrl.replace(/\/$/, ''),
    email: raw.email,
    apiToken: raw.apiToken,
    internalProjectKeys: parseList(raw.internalProjectKeys, [
      'LIADEV',
      'LIA',
      'LIAKI',
      'LIAC',
      'LIAW',
    ]),
    devProjectKeys: parseList(raw.devProjectKeys, ['LIADEV']),
    internalCoreProjectKeys: parseList(raw.internalCoreProjectKeys, ['LIA', 'LIAKI', 'LIAC']),
    overbookThresholdPct: parseInt10(raw.overbookThresholdPct, 80),
    replyThresholdWorkdays: parseInt10(raw.replyThresholdWorkdays, 1),
    staleThresholdWorkdays: parseInt10(raw.staleThresholdWorkdays, 5),
  }
}
