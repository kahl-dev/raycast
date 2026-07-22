import { Cache } from "@raycast/api";
import { HistoryPoint, parseHistoryJson, serializeHistoryJson } from "./projection";
import { Bucket, Provider } from "./types";

// Einziges lib-File mit @raycast/api-Import — Glue zwischen den reinen lib/*.ts-Funktionen
// und Raycasts Cache-Speicher. resetsAt wird als ISO-String serialisiert (Cache speichert nur Strings).
const cache = new Cache();

const CACHE_KEYS = {
  lastAnthropicAttemptAt: "lastAnthropicAttemptAt",
  lastCodexAttemptAt: "lastCodexAttemptAt",
  lastCodexLoginAttemptAt: "lastCodexLoginAttemptAt",
  lastGoodAnthropicBuckets: "lastGoodAnthropicBuckets",
  lastGoodCodexBuckets: "lastGoodCodexBuckets",
  firedAlertKeys: "firedAlertKeys",
  lastUpdatedAt: "lastUpdatedAt",
  lastCodexResetCreditsAvailable: "lastCodexResetCreditsAvailable",
} as const;

function getDate(key: string): Date | null {
  const stored = cache.get(key);
  if (stored === undefined) {
    return null;
  }
  const date = new Date(stored);
  return Number.isNaN(date.getTime()) ? null : date;
}

function setDate(key: string, date: Date): void {
  cache.set(key, date.toISOString());
}

export function getLastAnthropicAttemptAt(): Date | null {
  return getDate(CACHE_KEYS.lastAnthropicAttemptAt);
}

export function setLastAnthropicAttemptAt(date: Date): void {
  setDate(CACHE_KEYS.lastAnthropicAttemptAt, date);
}

export function getLastCodexAttemptAt(): Date | null {
  return getDate(CACHE_KEYS.lastCodexAttemptAt);
}

export function setLastCodexAttemptAt(date: Date): void {
  setDate(CACHE_KEYS.lastCodexAttemptAt, date);
}

export function getLastCodexLoginAttemptAt(): Date | null {
  return getDate(CACHE_KEYS.lastCodexLoginAttemptAt);
}

export function setLastCodexLoginAttemptAt(date: Date): void {
  setDate(CACHE_KEYS.lastCodexLoginAttemptAt, date);
}

export function getLastUpdatedAt(): Date | null {
  return getDate(CACHE_KEYS.lastUpdatedAt);
}

export function setLastUpdatedAt(date: Date): void {
  setDate(CACHE_KEYS.lastUpdatedAt, date);
}

// A stale reset-credits count is still more useful than the row vanishing outright: loadUsageData
// (load.ts) falls back to this last genuinely observed value whenever a load skips the Codex fetch
// (60s cooldown gate) or the fetch fails, so the dropdown's "Reset-Credits" row does not flicker
// away on every cooldown-skipped tick. JSON.stringify/parse (not a raw String(value)) so a genuine
// `null` (fetched successfully, zero/no reset credits reported) round-trips distinctly from the
// cache-miss `undefined` that getDate-style helpers treat as "never written".
export function getLastCodexResetCreditsAvailable(): number | null {
  const stored = cache.get(CACHE_KEYS.lastCodexResetCreditsAvailable);
  return stored === undefined ? null : (JSON.parse(stored) as number | null);
}

export function setLastCodexResetCreditsAvailable(value: number | null): void {
  cache.set(CACHE_KEYS.lastCodexResetCreditsAvailable, JSON.stringify(value));
}

function serializeBuckets(buckets: Bucket[]): string {
  return JSON.stringify(buckets.map((bucket) => ({ ...bucket, resetsAt: bucket.resetsAt.toISOString() })));
}

function deserializeBuckets(raw: string | undefined): Bucket[] | null {
  if (raw === undefined) {
    return null;
  }
  const parsed = JSON.parse(raw) as Array<Omit<Bucket, "resetsAt"> & { resetsAt: string }>;
  return parsed.map((item) => ({ ...item, resetsAt: new Date(item.resetsAt) }));
}

const LAST_GOOD_BUCKETS_KEYS: Record<Provider, string> = {
  anthropic: CACHE_KEYS.lastGoodAnthropicBuckets,
  openai: CACHE_KEYS.lastGoodCodexBuckets,
};

export function getLastGoodBuckets(provider: Provider): Bucket[] | null {
  return deserializeBuckets(cache.get(LAST_GOOD_BUCKETS_KEYS[provider]));
}

export function setLastGoodBuckets(provider: Provider, buckets: Bucket[]): void {
  cache.set(LAST_GOOD_BUCKETS_KEYS[provider], serializeBuckets(buckets));
}

const HISTORY_KEY_PREFIX = "bucketHistory:";

function historyKey(bucketId: string): string {
  return `${HISTORY_KEY_PREFIX}${bucketId}`;
}

// parseHistoryJson (projection.ts) carries the "malformed cache state degrades to empty, never
// throws" logic — kept there rather than here because @raycast/api cannot be resolved at all in
// this project's vitest environment, so any validation logic that needs to be unit tested has to
// live in a pure lib file instead of in this Cache-backed glue file.
export function getBucketHistory(bucketId: string): HistoryPoint[] {
  const stored = cache.get(historyKey(bucketId));
  return stored === undefined ? [] : parseHistoryJson(stored);
}

export function setBucketHistory(bucketId: string, history: HistoryPoint[]): void {
  cache.set(historyKey(bucketId), serializeHistoryJson(history));
}

export function getFiredAlertKeys(): Set<string> {
  const stored = cache.get(CACHE_KEYS.firedAlertKeys);
  if (stored === undefined) {
    return new Set();
  }
  return new Set(JSON.parse(stored) as string[]);
}

export function setFiredAlertKeys(keys: Set<string>): void {
  cache.set(CACHE_KEYS.firedAlertKeys, JSON.stringify([...keys]));
}
