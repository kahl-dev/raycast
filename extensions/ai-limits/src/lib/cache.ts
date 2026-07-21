import { Cache } from "@raycast/api";
import { TitleLayout, TITLE_LAYOUTS } from "./format";
import { HistoryPoint, parseHistoryJson, serializeHistoryJson } from "./projection";
import { Bucket, Provider } from "./types";

// Einziges lib-File mit @raycast/api-Import — Glue zwischen den reinen lib/*.ts-Funktionen
// und Raycasts Cache-Speicher. resetsAt wird als ISO-String serialisiert (Cache speichert nur Strings).
const cache = new Cache();

const CACHE_KEYS = {
  layout: "layout",
  lastAnthropicAttemptAt: "lastAnthropicAttemptAt",
  lastCodexLoginAttemptAt: "lastCodexLoginAttemptAt",
  lastGoodAnthropicBuckets: "lastGoodAnthropicBuckets",
  lastGoodCodexBuckets: "lastGoodCodexBuckets",
  firedAlertKeys: "firedAlertKeys",
  lastUpdatedAt: "lastUpdatedAt",
} as const;

const DEFAULT_LAYOUT: TitleLayout = "weekly";

function isTitleLayout(value: string): value is TitleLayout {
  return (TITLE_LAYOUTS as string[]).includes(value);
}

export function getLayout(): TitleLayout {
  const stored = cache.get(CACHE_KEYS.layout);
  if (stored !== undefined && isTitleLayout(stored)) {
    return stored;
  }
  return DEFAULT_LAYOUT;
}

export function setLayout(layout: TitleLayout): void {
  cache.set(CACHE_KEYS.layout, layout);
}

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
