import { Cache } from "@raycast/api";
import { HistoryPoint, parseHistoryJson, serializeHistoryJson } from "./projection";
import { AiLimitsReport, parseAiLimitsReport, serializeAiLimitsReport } from "./report";

// Einziges lib-File mit @raycast/api-Import — Glue zwischen den reinen lib/*.ts-Funktionen und
// Raycasts Cache-Speicher.
const cache = new Cache();

const LAST_GOOD_REPORT_KEY = "lastGoodReport";
const FIRED_ALERT_KEYS_KEY = "firedAlertKeys";
const FIRED_EXPIRY_WARNING_IDS_KEY = "firedExpiryWarningIds";
const LAST_OBSERVED_AT_PREFIX = "lastObservedAt:";
const BUCKET_HISTORY_PREFIX = "bucketHistory:";

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
  cache.set(LAST_GOOD_REPORT_KEY, JSON.stringify(serializeAiLimitsReport(report)));
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

function getStringSet(cacheKey: string): Set<string> {
  const stored = cache.get(cacheKey);
  if (stored === undefined) {
    return new Set();
  }
  return new Set(JSON.parse(stored) as string[]);
}

function setStringSet(cacheKey: string, values: Set<string>): void {
  cache.set(cacheKey, JSON.stringify([...values]));
}

export function getFiredAlertKeys(): Set<string> {
  return getStringSet(FIRED_ALERT_KEYS_KEY);
}

export function setFiredAlertKeys(keys: Set<string>): void {
  setStringSet(FIRED_ALERT_KEYS_KEY, keys);
}

export function getFiredExpiryWarningIds(): Set<string> {
  return getStringSet(FIRED_EXPIRY_WARNING_IDS_KEY);
}

export function setFiredExpiryWarningIds(ids: Set<string>): void {
  setStringSet(FIRED_EXPIRY_WARNING_IDS_KEY, ids);
}
