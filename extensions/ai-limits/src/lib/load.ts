import { loadAnthropicBuckets } from "./anthropic";
import { CodexAuthTokens, loadCodexBuckets } from "./codex";
import { appendHistory, HistoryPoint } from "./projection";
import {
  determineAlertsToFire,
  determineResetEvents,
  formatAlertMessage,
  formatResetMessage,
  markAlertsFired,
  markResetEventsFired,
  pruneFiredKeys,
  resetEventKey,
} from "./thresholds";
import { Bucket, FetchFunction, Provider } from "./types";

// Mirrors the subset of cache.ts (Raycast's `Cache`-backed storage) that loadUsageData reads
// and writes — kept as its own interface so tests can supply a plain in-memory fake instead of
// touching the real Raycast Cache.
export interface LoadCacheDependencies {
  getLastAnthropicAttemptAt: () => Date | null;
  setLastAnthropicAttemptAt: (date: Date) => void;
  getLastCodexAttemptAt: () => Date | null;
  setLastCodexAttemptAt: (date: Date) => void;
  getLastCodexLoginAttemptAt: () => Date | null;
  setLastCodexLoginAttemptAt: (date: Date) => void;
  getLastGoodBuckets: (provider: Provider) => Bucket[] | null;
  setLastGoodBuckets: (provider: Provider, buckets: Bucket[]) => void;
  getLastCodexResetCreditsAvailable: () => number | null;
  setLastCodexResetCreditsAvailable: (value: number | null) => void;
  getFiredAlertKeys: () => Set<string>;
  setFiredAlertKeys: (keys: Set<string>) => void;
  getLastUpdatedAt: () => Date | null;
  setLastUpdatedAt: (date: Date) => void;
  getBucketHistory: (bucketId: string) => HistoryPoint[];
  setBucketHistory: (bucketId: string, history: HistoryPoint[]) => void;
}

export interface LoadDependencies {
  now: () => Date;
  cache: LoadCacheDependencies;
  readToken: () => Promise<string>;
  readAuth: () => Promise<CodexAuthTokens>;
  runLoginStatus: () => Promise<void>;
  fetchImplementation: FetchFunction;
  notify: (title: string, message: string) => Promise<void>;
}

export interface UsageSnapshot {
  anthropicBuckets: Bucket[];
  codexBuckets: Bucket[];
  codexHint: string | null;
  codexResetCreditsAvailable: number | null;
  lastUpdatedAt: Date;
  anthropicStale: boolean;
  codexStale: boolean;
}

// Appends one history point per bucket for the burn-rate projection (projection.ts) — called only
// for a genuinely fresh, successful fetch (same guard as the setLastGoodBuckets writes above/below),
// so a cooldown-skip or failed fetch never records a duplicate or stale point.
function recordHistory(cache: LoadCacheDependencies, buckets: Bucket[], now: Date): void {
  for (const bucket of buckets) {
    const history = cache.getBucketHistory(bucket.id);
    cache.setBucketHistory(bucket.id, appendHistory(history, { at: now, percent: bucket.percent }, now));
  }
}

export async function loadUsageData(deps: LoadDependencies): Promise<UsageSnapshot> {
  const now = deps.now();

  // Captured before the fetch so reset-window detection below can diff "what we had before this
  // call" against "what we have now" for the same bucket id, independent of whether this call's
  // fetch actually succeeded (a cooldown-skip or failure falls back to this same snapshot, so the
  // diff naturally comes out empty in that case).
  const previousAnthropicBuckets = deps.cache.getLastGoodBuckets("anthropic");
  const previousCodexBuckets = deps.cache.getLastGoodBuckets("openai");

  // Anthropic and Codex are independent APIs with independent cooldown gates that both key off
  // this same `now` — Anthropic's 60s fetch cooldown, Codex's mirrored 60s fetch cooldown, plus
  // Codex's separate 1h login-retry debounce — running them concurrently halves wall-clock latency
  // without affecting any gate's timestamp math.
  const [anthropicResult, codexResult] = await Promise.all([
    loadAnthropicBuckets({
      now: () => now,
      lastAttemptAt: deps.cache.getLastAnthropicAttemptAt(),
      lastGoodBuckets: previousAnthropicBuckets,
      readToken: () => deps.readToken(),
      fetchImplementation: deps.fetchImplementation,
    }),
    loadCodexBuckets({
      now: () => now,
      lastAttemptAt: deps.cache.getLastCodexAttemptAt(),
      lastLoginAttemptAt: deps.cache.getLastCodexLoginAttemptAt(),
      lastGoodBuckets: previousCodexBuckets,
      readAuth: () => deps.readAuth(),
      fetchImplementation: deps.fetchImplementation,
      runLoginStatus: () => deps.runLoginStatus(),
    }),
  ]);

  if (anthropicResult.attempted) {
    deps.cache.setLastAnthropicAttemptAt(now);
  }
  if (anthropicResult.error) {
    console.error("AI Limits: Anthropic-Fetch fehlgeschlagen", anthropicResult.error);
  }
  const anthropicBuckets = anthropicResult.buckets ?? [];
  // Guarded on `attempted` (mirrored by the Codex block below): a cooldown-skipped call also
  // reports error:null while merely forwarding the possibly-null cached value — writing that back
  // would overwrite a genuine "never fetched yet" (null) cache entry with an empty array.
  if (anthropicResult.attempted && anthropicResult.error === null) {
    deps.cache.setLastGoodBuckets("anthropic", anthropicBuckets);
    recordHistory(deps.cache, anthropicBuckets, now);
  }

  if (codexResult.loginAttempted) {
    deps.cache.setLastCodexLoginAttemptAt(now);
  }
  if (codexResult.attempted) {
    deps.cache.setLastCodexAttemptAt(now);
  }
  if (codexResult.error) {
    console.error("AI Limits: Codex-Fetch fehlgeschlagen", codexResult.error);
  }
  const codexBuckets = codexResult.buckets ?? [];
  // Guarded on `attempted` (mirrors the Anthropic block above): now that Codex also has a 60s
  // cooldown gate (codex.ts), a cooldown-skipped call reports error:null while merely forwarding
  // the possibly-null cached value — writing that back would overwrite a genuine "never fetched
  // yet" (null) cache entry with an empty array. This write was previously unguarded because every
  // call attempted the network; the new skip path makes the guard necessary, same as Anthropic.
  const isFreshCodexSuccess = codexResult.attempted && codexResult.error === null;
  if (isFreshCodexSuccess) {
    deps.cache.setLastGoodBuckets("openai", codexBuckets);
    recordHistory(deps.cache, codexBuckets, now);
    deps.cache.setLastCodexResetCreditsAvailable(codexResult.resetCreditsAvailable);
  }
  // codex.ts reports resetCreditsAvailable:null for both the cooldown-skip and the failure-fallback
  // path (it never re-derives a stale count from an old response) — falling back to the cached
  // last-good value here means the dropdown's "Reset-Credits" row does not flicker away on every
  // cooldown-skipped tick or transient failure, mirroring how buckets already fall back above.
  const codexResetCreditsAvailable = isFreshCodexSuccess
    ? codexResult.resetCreditsAvailable
    : deps.cache.getLastCodexResetCreditsAvailable();

  const allBuckets = [...anthropicBuckets, ...codexBuckets];
  const previousAllBuckets = [...(previousAnthropicBuckets ?? []), ...(previousCodexBuckets ?? [])];

  const firedBefore = deps.cache.getFiredAlertKeys();
  const prunedFired = pruneFiredKeys(firedBefore, allBuckets);
  const alertsToFire = determineAlertsToFire(allBuckets, prunedFired);

  // Reset events reuse the same firedAlertKeys Cache field as alerts (distinct `reset:` key
  // prefix — see thresholds.ts) rather than a separate cache slot, so both dedup sets self-clean
  // together via pruneFiredKeys.
  const resetEvents = determineResetEvents(previousAllBuckets, allBuckets);
  const resetEventsToFire = resetEvents.filter((event) => !prunedFired.has(resetEventKey(event.bucket.id)));

  // allSettled (not all): a failed osascript call must not throw out of loadUsageData — that
  // would discard the already-fetched, already-cached buckets and skip persisting fired-keys,
  // for a display failure unrelated to whether the data itself is good.
  const notificationResults = await Promise.allSettled([
    ...alertsToFire.map((alert) => deps.notify("AI Limits", formatAlertMessage(alert.bucket, alert.threshold, now))),
    ...resetEventsToFire.map((event) => deps.notify("AI Limits", formatResetMessage(event.bucket))),
  ]);
  for (const result of notificationResults) {
    if (result.status === "rejected") {
      console.error("AI Limits: Notification fehlgeschlagen", result.reason);
    }
  }
  if (alertsToFire.length > 0 || resetEventsToFire.length > 0 || prunedFired.size !== firedBefore.size) {
    const firedWithAlerts = markAlertsFired(prunedFired, alertsToFire);
    deps.cache.setFiredAlertKeys(markResetEventsFired(firedWithAlerts, resetEventsToFire));
  }

  const anthropicStale = anthropicResult.error !== null;
  const codexStale = codexResult.error !== null;
  const isStale = anthropicStale || codexStale;
  const lastUpdatedAt = isStale ? (deps.cache.getLastUpdatedAt() ?? now) : now;
  if (!isStale) {
    deps.cache.setLastUpdatedAt(now);
  }

  return {
    anthropicBuckets,
    codexBuckets,
    codexHint: codexResult.hint,
    codexResetCreditsAvailable,
    lastUpdatedAt,
    anthropicStale,
    codexStale,
  };
}

export function staleSuffix(snapshot: UsageSnapshot): string {
  if (snapshot.anthropicStale && snapshot.codexStale) {
    return " (veraltet)";
  }
  if (snapshot.anthropicStale) {
    return " (Claude veraltet)";
  }
  if (snapshot.codexStale) {
    return " (OpenAI veraltet)";
  }
  return "";
}
