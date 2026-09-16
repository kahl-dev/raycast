import { Cache } from "@raycast/api";
import { HistoryPoint, parseHistoryJson, serializeHistoryJson } from "./projection";
import { AiLimitsReport, parseAiLimitsReport } from "./report";

// Einziges lib-File mit @raycast/api-Import — Glue zwischen den reinen lib/*.ts-Funktionen und
// Raycasts Cache-Speicher.
const cache = new Cache();

const LAST_GOOD_REPORT_KEY = "lastGoodReport";
const FIRED_ALERT_KEYS_KEY = "firedAlertKeys";
const LAST_OBSERVED_AT_PREFIX = "lastObservedAt:";
const BUCKET_HISTORY_PREFIX = "bucketHistory:";

// Inverse of parseAiLimitsReport's snake_case/ISO shape — the cached report is stored as the raw
// ai-limits JSON text (not the camelCased AiLimitsReport), and read back through
// parseAiLimitsReport itself so a cached report is validated exactly like a fresh one, and a
// malformed or outdated cache entry fails the same way a malformed live response would.
function toRawJson(report: AiLimitsReport): unknown {
  return {
    fetched_at: report.fetchedAt.toISOString(),
    stale: report.stale,
    accounts: report.accounts,
    buckets: report.buckets.map((bucket) => ({
      id: bucket.id,
      provider: bucket.provider,
      account: bucket.account,
      label: bucket.label,
      percent: bucket.percent,
      resets_at: bucket.resetsAt.toISOString(),
      window_seconds: bucket.windowSeconds,
      observed_at: bucket.observedAt.toISOString(),
      elapsed_percent: bucket.elapsedPercent,
    })),
    errors: report.errors,
    skipped: report.skipped,
    reset_credits: report.resetCredits,
    plans: report.plans,
    sources: report.sources,
  };
}

export function getLastGoodReport(): AiLimitsReport | null {
  const stored = cache.get(LAST_GOOD_REPORT_KEY);
  if (stored === undefined) {
    return null;
  }
  try {
    return parseAiLimitsReport(JSON.parse(stored));
  } catch (error) {
    console.error("AI Limits: gecachter Report unlesbar, wird verworfen", error);
    return null;
  }
}

export function setLastGoodReport(report: AiLimitsReport): void {
  cache.set(LAST_GOOD_REPORT_KEY, JSON.stringify(toRawJson(report)));
}

function lastObservedAtKey(bucketKey: string): string {
  return `${LAST_OBSERVED_AT_PREFIX}${bucketKey}`;
}

export function getLastObservedAt(bucketKey: string): Date | null {
  const stored = cache.get(lastObservedAtKey(bucketKey));
  if (stored === undefined) {
    return null;
  }
  const date = new Date(stored);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function setLastObservedAt(bucketKey: string, date: Date): void {
  cache.set(lastObservedAtKey(bucketKey), date.toISOString());
}

function bucketHistoryKey(bucketKey: string): string {
  return `${BUCKET_HISTORY_PREFIX}${bucketKey}`;
}

// parseHistoryJson (projection.ts) carries the "malformed cache state degrades to empty, never
// throws" logic — kept there rather than here because @raycast/api cannot be resolved at all in
// this project's vitest environment, so any validation logic that needs to be unit tested has to
// live in a pure lib file instead of in this Cache-backed glue file.
export function getBucketHistory(bucketKey: string): HistoryPoint[] {
  const stored = cache.get(bucketHistoryKey(bucketKey));
  return stored === undefined ? [] : parseHistoryJson(stored);
}

export function setBucketHistory(bucketKey: string, history: HistoryPoint[]): void {
  cache.set(bucketHistoryKey(bucketKey), serializeHistoryJson(history));
}

export function getFiredAlertKeys(): Set<string> {
  const stored = cache.get(FIRED_ALERT_KEYS_KEY);
  if (stored === undefined) {
    return new Set();
  }
  return new Set(JSON.parse(stored) as string[]);
}

export function setFiredAlertKeys(keys: Set<string>): void {
  cache.set(FIRED_ALERT_KEYS_KEY, JSON.stringify([...keys]));
}
