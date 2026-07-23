import { formatResetGerman } from "./format";
import { Bucket, WARNING_THRESHOLD, CRITICAL_THRESHOLD } from "./types";

export const ALERT_THRESHOLDS = [WARNING_THRESHOLD, CRITICAL_THRESHOLD] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

// How far percent must fall below a threshold before that alert re-arms. Anthropic usage limits are
// rolling windows: percent climbs with use and drifts down as old usage ages out, so a bare "below
// threshold" re-arm could flap at the boundary. A few points of hysteresis avoids that while still
// re-arming cleanly after a real reset (which drops percent to near zero). Tunable.
const REARM_HYSTERESIS = 5;

export interface FiredAlert {
  bucket: Bucket;
  threshold: AlertThreshold;
}

// The dedup key deliberately does NOT include resetsAt. Anthropic's usage endpoint is a rolling
// window that returns resets_at = request_time + window, so resets_at drifts on every fetch — keying
// on it made pruneFiredKeys drop the key each tick and the alert re-fired forever (the original bug).
// Re-arming is driven by percent instead (see pruneFiredKeys), which is the only stable signal.
export function alertKey(bucketId: string, threshold: AlertThreshold): string {
  return `${bucketId}:${threshold}`;
}

export function determineAlertsToFire(buckets: Bucket[], firedKeys: ReadonlySet<string>): FiredAlert[] {
  const alerts: FiredAlert[] = [];
  for (const bucket of buckets) {
    for (const threshold of ALERT_THRESHOLDS) {
      if (bucket.percent < threshold) {
        continue;
      }
      if (firedKeys.has(alertKey(bucket.id, threshold))) {
        continue;
      }
      alerts.push({ bucket, threshold });
    }
  }
  return alerts;
}

// Shared by markAlertsFired and markResetEventsFired below, which differ only in what key each
// item maps to.
function addKeys<T>(keys: ReadonlySet<string>, items: T[], keyFor: (item: T) => string): Set<string> {
  const next = new Set(keys);
  for (const item of items) {
    next.add(keyFor(item));
  }
  return next;
}

export function markAlertsFired(firedKeys: ReadonlySet<string>, fired: FiredAlert[]): Set<string> {
  return addKeys(firedKeys, fired, (alert) => alertKey(alert.bucket.id, alert.threshold));
}

const RESET_KEY_PREFIX = "reset:";

export function resetEventKey(bucketId: string): string {
  return `${RESET_KEY_PREFIX}${bucketId}`;
}

// Re-arm logic, driven by percent (never resetsAt — see alertKey). Iterating the CURRENT buckets
// means a fired key is retained only while its bucket still exists and still justifies suppression;
// keys for vanished buckets are simply never re-added. An alert key stays suppressed while percent is
// still at/above the threshold (minus hysteresis); once percent falls further, the key drops and the
// alert re-arms for the next genuine climb. A reset key stays set while the bucket is still "empty"
// (percent < WARNING); once percent climbs back to WARNING the key drops so the next drop can re-fire.
export function pruneFiredKeys(firedKeys: ReadonlySet<string>, buckets: Bucket[]): Set<string> {
  const retained = new Set<string>();
  for (const bucket of buckets) {
    for (const threshold of ALERT_THRESHOLDS) {
      const key = alertKey(bucket.id, threshold);
      if (firedKeys.has(key) && bucket.percent >= threshold - REARM_HYSTERESIS) {
        retained.add(key);
      }
    }
    const resetKey = resetEventKey(bucket.id);
    if (firedKeys.has(resetKey) && bucket.percent < WARNING_THRESHOLD) {
      retained.add(resetKey);
    }
  }
  return retained;
}

export function formatAlertMessage(bucket: Bucket, threshold: AlertThreshold, now: Date = new Date()): string {
  return `${bucket.label}-Limit bei ${Math.round(bucket.percent)}% — Reset ${formatResetGerman(bucket.resetsAt, now)}`;
}

export interface ResetEvent {
  bucket: Bucket;
}

// A "reset event" is detected purely by comparing two snapshots (previous vs current last-good
// buckets) for the same bucket id: the bucket previously stood at >=WARNING_THRESHOLD and its
// percent has since dropped back to meaningful headroom (below WARNING_THRESHOLD minus hysteresis),
// meaning the rolling window has freed up. resetsAt is NOT consulted — it drifts every fetch under a
// rolling window (see alertKey), so a resetsAt change is not a reliable signal that the limit reset.
export function determineResetEvents(previousBuckets: Bucket[], currentBuckets: Bucket[]): ResetEvent[] {
  const events: ResetEvent[] = [];
  for (const current of currentBuckets) {
    const previous = previousBuckets.find((bucket) => bucket.id === current.id);
    if (previous === undefined) {
      continue;
    }
    if (previous.percent < WARNING_THRESHOLD) {
      continue;
    }
    if (current.percent >= WARNING_THRESHOLD - REARM_HYSTERESIS) {
      continue;
    }
    events.push({ bucket: current });
  }
  return events;
}

export function markResetEventsFired(firedKeys: ReadonlySet<string>, events: ResetEvent[]): Set<string> {
  return addKeys(firedKeys, events, (event) => resetEventKey(event.bucket.id));
}

export function formatResetMessage(bucket: Bucket): string {
  return `${bucket.label}-Limit resettet — wieder verfügbar`;
}
