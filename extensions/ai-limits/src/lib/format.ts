import { Bucket, displaySeverity, secondsUntil, Severity } from "./types";

const WEEKDAY_LABELS_GERMAN = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export function formatTimeShort(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Coarse "biggest unit first" duration, matching the tmux statusline countdown style: days+hours
// once at least a day remains, hours+minutes once at least an hour remains, otherwise just minutes.
export function formatDurationShort(seconds: number): string {
  if (seconds >= SECONDS_PER_DAY) {
    const days = Math.floor(seconds / SECONDS_PER_DAY);
    const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    return `${days}d ${hours}h`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${hours}h ${minutes}m`;
  }
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`;
}

export function formatWeekdayAndTime(date: Date, now: Date = new Date()): string {
  const time = formatTimeShort(date);
  const isSameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isSameDay) {
    return time;
  }

  return `${WEEKDAY_LABELS_GERMAN[date.getDay()]} ${time}`;
}

export function formatResetGerman(date: Date, now: Date = new Date()): string {
  const base = formatWeekdayAndTime(date, now);
  const secondsUntilReset = secondsUntil(date, now);

  if (secondsUntilReset <= 0) {
    return base;
  }

  return `${base} (in ${formatDurationShort(secondsUntilReset)})`;
}

export interface BucketSeverity {
  bucket: Bucket;
  severity: Severity;
}

// Precomputes displaySeverity once per bucket so a dropdown render needing each bucket's own
// severity (BucketRow's dot color, dropdown.tsx) does not recompute displaySeverity redundantly.
export function computeBucketSeverities(buckets: Bucket[], now: Date): BucketSeverity[] {
  return buckets.map((bucket) => ({ bucket, severity: displaySeverity(bucket, now) }));
}

// Exported for reuse by menu-bar-title.ts (the menu-bar title's "F" slot uses the same
// highest-percent reduction, applied to a pre-filtered weekly_scoped subset).
export function highestPercentBucket(buckets: Bucket[]): Bucket | null {
  if (buckets.length === 0) {
    return null;
  }
  return buckets.reduce((highest, current) => (current.percent > highest.percent ? current : highest));
}

function findBucketById(buckets: Bucket[], id: string): Bucket | null {
  return buckets.find((bucket) => bucket.id === id) ?? null;
}

// Exported for reuse by menu-bar-title.ts (each of the menu-bar title's four fixed slots is
// exactly one of these fixed-id lookups) and dropdown.tsx (the OpenAI reset-credits row needs the
// primary bucket specifically).
export function findSessionBucket(buckets: Bucket[]): Bucket | null {
  return findBucketById(buckets, "anthropic:session");
}

export function findWeeklyAllBucket(buckets: Bucket[]): Bucket | null {
  return findBucketById(buckets, "anthropic:weekly_all");
}

export function findHighestWeeklyScopedBucket(buckets: Bucket[]): Bucket | null {
  return highestPercentBucket(buckets.filter((bucket) => bucket.id.startsWith("anthropic:weekly_scoped:")));
}

export function findPrimaryOpenAiBucket(buckets: Bucket[]): Bucket | null {
  return findBucketById(buckets, "openai:primary");
}
