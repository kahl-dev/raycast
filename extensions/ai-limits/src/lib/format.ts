import { Bucket, displaySeverity, secondsUntil, Severity } from "./types";

export type TitleLayout = "weekly" | "all" | "max" | "icon";

export const TITLE_LAYOUTS: TitleLayout[] = ["weekly", "all", "max", "icon"];

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

const SEVERITY_RANK: Record<Severity, number> = { normal: 0, warning: 1, critical: 2 };

export interface BucketSeverity {
  bucket: Bucket;
  severity: Severity;
}

// Precomputes displaySeverity once per bucket so a render needing both the worst-of-all summary
// (menu bar icon tint) and each bucket's own severity (dropdown row dot color) does not compute
// displaySeverity twice per bucket — see menu-bar.tsx's BucketRow.
export function computeBucketSeverities(buckets: Bucket[], now: Date): BucketSeverity[] {
  return buckets.map((bucket) => ({ bucket, severity: displaySeverity(bucket, now) }));
}

// Worst pace-aware displaySeverity across all buckets — NOT necessarily the highest-percent
// bucket's severity, since a lower-percent bucket running ahead of its window's pace can be
// worse than a higher-percent bucket that is merely near the end of an already-mostly-elapsed
// window. Takes precomputed severities (computeBucketSeverities) rather than buckets+now so it
// stays a pure reduction, independent of how those severities were derived.
export function highestDisplaySeverity(bucketSeverities: BucketSeverity[]): Severity {
  let worst: Severity = "normal";
  for (const { severity } of bucketSeverities) {
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[worst]) {
      worst = severity;
    }
  }
  return worst;
}

function highestPercentBucket(buckets: Bucket[]): Bucket | null {
  if (buckets.length === 0) {
    return null;
  }
  return buckets.reduce((highest, current) => (current.percent > highest.percent ? current : highest));
}

// Titel-Slots sind bewusst fix (nicht generisch aus limits[] abgeleitet) — nur das Dropdown
// ist vollständig generisch. Neue Bucket-Kinds tauchen im Dropdown auf, aber nicht im Titel,
// bis sie hier explizit verdrahtet werden.
function titleLetterFor(bucket: Bucket): string {
  // OpenAI ist bewusst auf "O" gepinnt, unabhängig vom Label-Wortlaut — der Buchstabe soll
  // stabil bleiben, auch wenn das Label später z.B. "Codex" heißt. Nicht durch die
  // generische Initiale ersetzen, obwohl sie heute dasselbe ergeben würde.
  if (bucket.provider === "openai") {
    return "O";
  }
  return bucket.label.charAt(0).toUpperCase();
}

function titleSlot(bucket: Bucket | null): string | null {
  if (bucket === null) {
    return null;
  }
  return `${titleLetterFor(bucket)}${Math.round(bucket.percent)}`;
}

function findSessionBucket(buckets: Bucket[]): Bucket | null {
  return buckets.find((bucket) => bucket.id === "anthropic:session") ?? null;
}

function findWeeklyAllBucket(buckets: Bucket[]): Bucket | null {
  return buckets.find((bucket) => bucket.id === "anthropic:weekly_all") ?? null;
}

function findHighestWeeklyScopedBucket(buckets: Bucket[]): Bucket | null {
  return highestPercentBucket(buckets.filter((bucket) => bucket.id.startsWith("anthropic:weekly_scoped:")));
}

function findHighestOpenAiBucket(buckets: Bucket[]): Bucket | null {
  return highestPercentBucket(buckets.filter((bucket) => bucket.provider === "openai"));
}

function buildSlotTitle(buckets: Bucket[], includeSession: boolean): string {
  const slots = [
    includeSession ? findSessionBucket(buckets) : null,
    findWeeklyAllBucket(buckets),
    findHighestWeeklyScopedBucket(buckets),
    findHighestOpenAiBucket(buckets),
  ];

  return slots
    .map(titleSlot)
    .filter((slot): slot is string => slot !== null)
    .join(" ");
}

function buildMaxTitle(buckets: Bucket[]): string {
  return titleSlot(highestPercentBucket(buckets)) ?? "";
}

export function buildMenuBarTitle(layout: TitleLayout, buckets: Bucket[]): string {
  if (layout === "icon") {
    return "";
  }
  if (layout === "max") {
    return buildMaxTitle(buckets);
  }
  if (layout === "all") {
    return buildSlotTitle(buckets, true);
  }
  return buildSlotTitle(buckets, false);
}
