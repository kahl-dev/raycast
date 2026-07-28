import { isWithinAnthropicCooldown, loadAnthropicBuckets } from "./anthropic";
import { CodexAuthTokens, isWithinCodexCooldown, loadCodexBuckets } from "./codex";
import { appendHistory, HistoryPoint } from "./projection";
import {
  determineAlertsToFire,
  determineResetEvents,
  formatAlertMessage,
  formatResetMessage,
  markAlertsFired,
  pruneFiredKeys,
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
  getLastAnthropicSkipped: () => string[];
  setLastAnthropicSkipped: (reasons: string[]) => void;
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
  // Limits the Anthropic API returned that could not be parsed. Rendered in the dropdown so a
  // partially degraded response is visible rather than looking like a missing/unused limit.
  anthropicSkipped: string[];
  codexHint: string | null;
  codexResetCreditsAvailable: number | null;
  lastUpdatedAt: Date;
  anthropicStale: boolean;
  codexStale: boolean;
}

export interface LoadOptions {
  // Set by the manual "Aktualisieren" action: bypasses both cooldown gates. Without it a refresh
  // is a guaranteed no-op, because merely opening the menu already runs a load and burns the gate.
  force?: boolean;
}

// Appends one history point per bucket for the burn-rate projection (projection.ts) — called only
// for a genuinely fresh, successful fetch (same guard as the setLastGoodBuckets writes above/below),
// so a cooldown-skip or failed fetch never records a duplicate or stale point.
// A limit that failed to parse produces no fresh value for its id. Carrying the last-good entry
// keeps three things from breaking at once: the cache is not destroyed by a fully unreadable
// response, the slot keeps showing its last known value instead of blanking, and the id stays
// visible to pruneFiredKeys — without which a single bad tick drops the fired-alert keys and the
// 80/95 alerts fire again the moment the API recovers.
function mergeOverLastGood(fresh: Bucket[], lastGood: Bucket[] | null): Bucket[] {
  if (lastGood === null) {
    return fresh;
  }
  const freshIds = new Set(fresh.map((bucket) => bucket.id));
  return [...fresh, ...lastGood.filter((bucket) => !freshIds.has(bucket.id))];
}

function recordHistory(cache: LoadCacheDependencies, buckets: Bucket[], now: Date): void {
  for (const bucket of buckets) {
    const history = cache.getBucketHistory(bucket.id);
    cache.setBucketHistory(bucket.id, appendHistory(history, { at: now, percent: bucket.percent }, now));
  }
}

export async function loadUsageData(deps: LoadDependencies, options: LoadOptions = {}): Promise<UsageSnapshot> {
  const now = deps.now();
  const force = options.force === true;

  // Captured before the fetch so reset-window detection below can diff "what we had before this
  // call" against "what we have now" for the same bucket id, independent of whether this call's
  // fetch actually succeeded (a cooldown-skip or failure falls back to this same snapshot, so the
  // diff naturally comes out empty in that case).
  const previousAnthropicBuckets = deps.cache.getLastGoodBuckets("anthropic");
  const previousCodexBuckets = deps.cache.getLastGoodBuckets("openai");

  // Both gates are evaluated and their attempt timestamps written BEFORE any await. Two renders of
  // the same menu-bar command start loadUsageData milliseconds apart; when the timestamp was only
  // written after the fetch resolved, both calls read the stale timestamp, both passed the gate and
  // both hit the network — visible as duplicate history points ~5ms apart, at double the request
  // rate against an endpoint that allows ~1 req/min.
  const anthropicAllowed = force || !isWithinAnthropicCooldown(deps.cache.getLastAnthropicAttemptAt(), now);
  const codexAllowed = force || !isWithinCodexCooldown(deps.cache.getLastCodexAttemptAt(), now);
  if (anthropicAllowed) {
    deps.cache.setLastAnthropicAttemptAt(now);
  }
  if (codexAllowed) {
    deps.cache.setLastCodexAttemptAt(now);
  }

  // Anthropic and Codex are independent APIs — running them concurrently halves wall-clock latency.
  const [anthropicResult, codexResult] = await Promise.all([
    loadAnthropicBuckets({
      skipFetch: !anthropicAllowed,
      lastGoodBuckets: previousAnthropicBuckets,
      readToken: () => deps.readToken(),
      fetchImplementation: deps.fetchImplementation,
    }),
    loadCodexBuckets({
      now: () => now,
      skipFetch: !codexAllowed,
      lastLoginAttemptAt: deps.cache.getLastCodexLoginAttemptAt(),
      lastGoodBuckets: previousCodexBuckets,
      readAuth: () => deps.readAuth(),
      fetchImplementation: deps.fetchImplementation,
      runLoginStatus: () => deps.runLoginStatus(),
    }),
  ]);

  // Re-read the baseline AFTER the awaits and BEFORE the last-good writes below. A forced refresh
  // can run concurrently with the interval or mount load (force deliberately bypasses the gate that
  // otherwise collapses them), and a baseline captured before the fetch would be the same pre-reset
  // snapshot for both — so both would announce the same reset. Reading here means whichever load
  // settles first advances the baseline and the other sees no drop.
  const baselineAnthropicBuckets = deps.cache.getLastGoodBuckets("anthropic");
  const baselineCodexBuckets = deps.cache.getLastGoodBuckets("openai");

  if (anthropicResult.error) {
    console.error("AI Limits: Anthropic-Fetch fehlgeschlagen", anthropicResult.error);
  }
  // Guarded on `attempted` (mirrored by the Codex block below): a cooldown-skipped call also
  // reports error:null while merely forwarding the possibly-null cached value — writing that back
  // would overwrite a genuine "never fetched yet" (null) cache entry with an empty array.
  const isFreshAnthropicSuccess = anthropicResult.attempted && anthropicResult.error === null;
  const freshAnthropicBuckets = anthropicResult.buckets ?? [];
  const anthropicBuckets = isFreshAnthropicSuccess
    ? mergeOverLastGood(freshAnthropicBuckets, baselineAnthropicBuckets)
    : freshAnthropicBuckets;
  if (isFreshAnthropicSuccess) {
    deps.cache.setLastGoodBuckets("anthropic", anthropicBuckets);
    // Only the freshly parsed buckets get a history point — a carried-over value is a repeat of an
    // old measurement, and feeding it in would flatten the burn-rate slope with invented data.
    recordHistory(deps.cache, freshAnthropicBuckets, now);
    deps.cache.setLastAnthropicSkipped(anthropicResult.skipped);
  }
  // Mirrors the codexResetCreditsAvailable fallback below: a cooldown-skip or failure produces no
  // fresh parse, so the reasons come from the cache and the dropdown's warning row stays put for as
  // long as the degradation does.
  const anthropicSkipped = isFreshAnthropicSuccess
    ? anthropicResult.skipped
    : deps.cache.getLastAnthropicSkipped();

  if (codexResult.loginAttempted) {
    deps.cache.setLastCodexLoginAttemptAt(now);
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
  const previousAllBuckets = [...(baselineAnthropicBuckets ?? []), ...(baselineCodexBuckets ?? [])];

  const firedBefore = deps.cache.getFiredAlertKeys();
  const prunedFired = pruneFiredKeys(firedBefore, allBuckets);
  const alertsToFire = determineAlertsToFire(allBuckets, prunedFired);

  // Reset events carry no dedup state: they are a one-shot percent drop, and firing makes the
  // post-reset value the baseline for the next comparison (see thresholds.ts).
  const resetEventsToFire = determineResetEvents(previousAllBuckets, allBuckets);

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
  if (alertsToFire.length > 0 || prunedFired.size !== firedBefore.size) {
    deps.cache.setFiredAlertKeys(markAlertsFired(prunedFired, alertsToFire));
  }

  // A skipped limit means part of the answer is a carried-over value, so the snapshot is not fully
  // fresh — without this the veraltet marker disappears while stale numbers are on screen.
  const anthropicStale = anthropicResult.error !== null || anthropicSkipped.length > 0;
  const codexStale = codexResult.error !== null;
  const isStale = anthropicStale || codexStale;
  const lastUpdatedAt = isStale ? (deps.cache.getLastUpdatedAt() ?? now) : now;
  if (!isStale) {
    deps.cache.setLastUpdatedAt(now);
  }

  if (anthropicSkipped.length > 0) {
    console.error("AI Limits: Anthropic-Limits übersprungen", anthropicSkipped);
  }

  return {
    anthropicBuckets,
    codexBuckets,
    anthropicSkipped,
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
