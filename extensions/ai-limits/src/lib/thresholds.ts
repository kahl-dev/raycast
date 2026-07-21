import { formatResetGerman } from "./format";
import { Bucket, WARNING_THRESHOLD, CRITICAL_THRESHOLD } from "./types";

export const ALERT_THRESHOLDS = [WARNING_THRESHOLD, CRITICAL_THRESHOLD] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

export interface FiredAlert {
  bucket: Bucket;
  threshold: AlertThreshold;
}

export function alertKey(bucket: Bucket, threshold: AlertThreshold): string {
  return `${bucket.id}:${bucket.resetsAt.toISOString()}:${threshold}`;
}

export function determineAlertsToFire(buckets: Bucket[], firedKeys: ReadonlySet<string>): FiredAlert[] {
  const alerts: FiredAlert[] = [];
  for (const bucket of buckets) {
    for (const threshold of ALERT_THRESHOLDS) {
      if (bucket.percent < threshold) {
        continue;
      }
      if (firedKeys.has(alertKey(bucket, threshold))) {
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
  return addKeys(firedKeys, fired, (alert) => alertKey(alert.bucket, alert.threshold));
}

const RESET_KEY_PREFIX = "reset:";

export function resetEventKey(bucketId: string, resetsAtIso: string): string {
  return `${RESET_KEY_PREFIX}${bucketId}:${resetsAtIso}`;
}

// Selbstbereinigend, wie pruneFiredKeys unten: ein gefeuerte Key bleibt nur gültig, solange
// (Bucket, resetsAt) unverändert ist. Zwei Key-Formen laufen durch dasselbe firedAlertKeys-Cache-
// Feld — Alert-Keys (`${id}:${resetsAtIso}:${threshold}`) und Reset-Keys (`reset:${id}:${resetsAtIso}`,
// kein Threshold-Suffix) — daher der Präfix-Branch statt eines einzigen Präfix-Musters.
export function pruneFiredKeys(firedKeys: ReadonlySet<string>, buckets: Bucket[]): Set<string> {
  const currentAlertPrefixes = buckets.map((bucket) => `${bucket.id}:${bucket.resetsAt.toISOString()}:`);
  const currentResetKeys = new Set(buckets.map((bucket) => resetEventKey(bucket.id, bucket.resetsAt.toISOString())));
  const pruned = new Set<string>();
  for (const key of firedKeys) {
    if (key.startsWith(RESET_KEY_PREFIX)) {
      if (currentResetKeys.has(key)) {
        pruned.add(key);
      }
      continue;
    }
    if (currentAlertPrefixes.some((prefix) => key.startsWith(prefix))) {
      pruned.add(key);
    }
  }
  return pruned;
}

export function formatAlertMessage(bucket: Bucket, threshold: AlertThreshold, now: Date = new Date()): string {
  return `${bucket.label}-Limit bei ${Math.round(bucket.percent)}% — Reset ${formatResetGerman(bucket.resetsAt, now)}`;
}

export interface ResetEvent {
  bucket: Bucket;
}

// A "reset event" is detected purely by comparing two snapshots (previous vs current last-good
// buckets) for the same bucket id: the bucket previously stood at >=WARNING_THRESHOLD and its
// resetsAt changed, meaning the window rolled over and the limit is available again.
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
    if (previous.resetsAt.getTime() === current.resetsAt.getTime()) {
      continue;
    }
    events.push({ bucket: current });
  }
  return events;
}

export function markResetEventsFired(firedKeys: ReadonlySet<string>, events: ResetEvent[]): Set<string> {
  return addKeys(firedKeys, events, (event) => resetEventKey(event.bucket.id, event.bucket.resetsAt.toISOString()));
}

export function formatResetMessage(bucket: Bucket): string {
  return `${bucket.label}-Limit resettet — wieder verfügbar`;
}
