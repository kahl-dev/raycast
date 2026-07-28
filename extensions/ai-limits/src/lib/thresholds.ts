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

// Re-arm logic, driven by percent (never resetsAt — see alertKey). Iterating the CURRENT buckets
// means a fired key is retained only while its bucket still exists and still justifies suppression;
// keys for vanished buckets are simply never re-added. An alert key stays suppressed while percent is
// still at/above the threshold (minus hysteresis); once percent falls further, the key drops and the
// alert re-arms for the next genuine climb.
export function pruneFiredKeys(firedKeys: ReadonlySet<string>, buckets: Bucket[]): Set<string> {
  const retained = new Set<string>();
  for (const bucket of buckets) {
    for (const threshold of ALERT_THRESHOLDS) {
      const key = alertKey(bucket.id, threshold);
      if (firedKeys.has(key) && bucket.percent >= threshold - REARM_HYSTERESIS) {
        retained.add(key);
      }
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

// How far percent must fall between two consecutive observations to count as a reset rather than
// noise. Anthropic's windows are anchored, not rolling — across requests resets_at keeps the same
// wall-clock boundary and only its sub-second component moves — so percent only ever accumulates
// inside a window and any real decrease means the window rolled over or Anthropic granted a reset
// mid-window. The magnitude floor keeps a one-or-two-point wobble from reading as a reset.
export const RESET_DROP_POINTS = 10;

// A "reset event" is a drop in percent between the previous and current snapshot for the same
// bucket id. It deliberately does not care how high the bucket stood beforehand: a goodwill reset
// granted at 50% is exactly as worth reporting as a window rollover from 100%.
//
// No dedup state is needed, unlike alerts. Firing makes the post-reset value the new baseline, so
// the same reset can never produce a second drop — see the invariant test in thresholds.test.ts.
// resetsAt is NOT consulted: its sub-second component changes on every request, which is what made
// the original resetsAt-keyed dedup re-fire on every tick.
export function determineResetEvents(previousBuckets: Bucket[], currentBuckets: Bucket[]): ResetEvent[] {
  const events: ResetEvent[] = [];
  for (const current of currentBuckets) {
    const previous = previousBuckets.find((bucket) => bucket.id === current.id);
    if (previous === undefined) {
      continue;
    }
    if (previous.percent - current.percent < RESET_DROP_POINTS) {
      continue;
    }
    events.push({ bucket: current });
  }
  return events;
}

export function formatResetMessage(bucket: Bucket): string {
  return `${bucket.label}-Limit resettet — wieder verfügbar`;
}
