import { appendHistory, HistoryPoint } from "./projection";
import { AiLimitsReport, parseAiLimitsReport, ReportBucket } from "./report";
import {
  AlertBucket,
  determineAlertsToFire,
  determineResetEvents,
  formatAlertMessage,
  formatResetMessage,
  markAlertsFired,
  pruneFiredKeys,
  selectAlertsToNotify,
} from "./thresholds";
import { toError } from "./types";

// Mirrors the subset of cache.ts (Raycast's `Cache`-backed storage) that loadUsageData reads and
// writes — kept as its own interface so tests can supply a plain in-memory fake instead of
// touching the real Raycast Cache.
export interface LoadCacheDependencies {
  getLastGoodReport: () => AiLimitsReport | null;
  setLastGoodReport: (report: AiLimitsReport) => void;
  getLastObservedAt: (bucketKey: string) => Date | null;
  setLastObservedAt: (bucketKey: string, date: Date) => void;
  getFiredAlertKeys: () => Set<string>;
  setFiredAlertKeys: (keys: Set<string>) => void;
  getBucketHistory: (bucketKey: string) => HistoryPoint[];
  setBucketHistory: (bucketKey: string, history: HistoryPoint[]) => void;
}

export interface LoadDependencies {
  now: () => Date;
  cache: LoadCacheDependencies;
  runAiLimits: () => Promise<unknown>;
  notify: (title: string, message: string) => Promise<void>;
}

export interface UsageSnapshot {
  report: AiLimitsReport | null;
  runError: string | null;
}

// Adapts a report bucket down to the minimal AlertBucket shape thresholds.ts reads, fed an `id`
// that is the report's account-scoped `key` (so alerts/resets dedup per account, not just per
// bucket id) and a `label` that carries the account prefix the notification text needs.
function toNotificationBucket(bucket: ReportBucket): AlertBucket {
  const prefix = bucket.provider === "codex" ? "Codex" : bucket.account;
  return {
    id: bucket.key,
    label: `${prefix} · ${bucket.label}`,
    percent: bucket.percent,
    resetsAt: bucket.resetsAt,
  };
}

// After a 429 backoff, `bin/ai-limits` can fall back from a newer statusline snapshot to an older
// cache entry (a pre-reset bucket served again). Merging the incoming report against the baseline
// right after parsing — per bucket key, keep whichever of the two has the strictly newer
// observedAt — keeps that stale reading out of the displayed report, the persisted baseline, and
// every downstream alert/reset/history/pruning decision, all of which read the merged result. A
// bucket present only in the baseline (absent from this run) is not resurrected.
function mergeWithBaseline(report: AiLimitsReport, baselineReport: AiLimitsReport | null): AiLimitsReport {
  if (baselineReport === null) {
    return report;
  }
  const buckets = report.buckets.map((bucket) => {
    const baselineBucket = baselineReport.buckets.find((entry) => entry.key === bucket.key);
    if (baselineBucket !== undefined && baselineBucket.observedAt.getTime() > bucket.observedAt.getTime()) {
      return baselineBucket;
    }
    return bucket;
  });
  return { ...report, buckets };
}

// A history point is recorded only for a bucket whose observedAt genuinely advanced since the last
// recorded point for that key — replaces the old "only a fresh, successful fetch" guard with a
// per-bucket freshness check driven by the report's own observed_at, which makes a duplicate
// render (same report served twice) a harmless no-op instead of a second, identical point.
function recordHistoryIfAdvanced(cache: LoadCacheDependencies, buckets: ReportBucket[], now: Date): void {
  for (const bucket of buckets) {
    const lastObservedAt = cache.getLastObservedAt(bucket.key);
    if (lastObservedAt !== null && lastObservedAt.getTime() >= bucket.observedAt.getTime()) {
      continue;
    }
    cache.setLastObservedAt(bucket.key, bucket.observedAt);
    const history = cache.getBucketHistory(bucket.key);
    cache.setBucketHistory(bucket.key, appendHistory(history, { at: bucket.observedAt, percent: bucket.percent }, now));
  }
}

export async function loadUsageData(deps: LoadDependencies): Promise<UsageSnapshot> {
  const now = deps.now();

  let raw: unknown;
  try {
    raw = await deps.runAiLimits();
  } catch (error) {
    return { report: deps.cache.getLastGoodReport(), runError: toError(error).message };
  }

  let report: AiLimitsReport;
  try {
    report = parseAiLimitsReport(raw);
  } catch (error) {
    return { report: deps.cache.getLastGoodReport(), runError: toError(error).message };
  }

  // Read AFTER the runner await, BEFORE persisting this call's own report: a concurrent
  // loadUsageData call can finish first and write a fresher last-good report while this call's own
  // fetch is still in flight, and reading the baseline only now means the diff below sees that
  // write instead of a pre-fetch snapshot both concurrent calls would otherwise share.
  const baselineReport = deps.cache.getLastGoodReport();
  const effectiveReport = mergeWithBaseline(report, baselineReport);
  deps.cache.setLastGoodReport(effectiveReport);

  recordHistoryIfAdvanced(deps.cache, effectiveReport.buckets, now);

  const baselineReportBuckets = baselineReport === null ? [] : baselineReport.buckets;
  const notificationBuckets = effectiveReport.buckets.map(toNotificationBucket);
  const baselineBuckets = baselineReportBuckets.map(toNotificationBucket);

  const firedBefore = deps.cache.getFiredAlertKeys();
  const prunedFired = pruneFiredKeys(firedBefore, notificationBuckets);
  const alertsToFire = determineAlertsToFire(notificationBuckets, prunedFired);
  // Every crossed threshold is marked fired, but at most one (the highest) is notified per bucket.
  const alertsToNotify = selectAlertsToNotify(alertsToFire);

  // Reset events carry no dedup state (thresholds.ts): firing makes the post-reset value the next
  // baseline, so the same reset cannot fire twice.
  const resetEventsToFire = determineResetEvents(baselineBuckets, notificationBuckets);

  // Persisted BEFORE the notify await (not after): two overlapping loads (interval tick +
  // "Refresh") both run their synchronous part up to this point before either suspends on
  // notify, so a write here — not after the await — is what a second overlapping call resumes into
  // and reads as already-fired. Trade-off accepted: a failed osascript notification (logged below)
  // no longer re-fires on the next run, since the key is marked fired regardless of delivery.
  if (alertsToFire.length > 0 || prunedFired.size !== firedBefore.size) {
    deps.cache.setFiredAlertKeys(markAlertsFired(prunedFired, alertsToFire));
  }

  // allSettled (not all): a failed osascript call must not throw out of loadUsageData — that would
  // discard the already-fetched, already-cached report for a display failure unrelated to whether
  // the data itself is good.
  const notificationResults = await Promise.allSettled([
    ...alertsToNotify.map((alert) => deps.notify("AI Limits", formatAlertMessage(alert.bucket, alert.threshold, now))),
    ...resetEventsToFire.map((event) => deps.notify("AI Limits", formatResetMessage(event.bucket))),
  ]);
  for (const result of notificationResults) {
    if (result.status === "rejected") {
      console.error("AI Limits: notification failed", result.reason);
    }
  }

  return { report: effectiveReport, runError: null };
}
