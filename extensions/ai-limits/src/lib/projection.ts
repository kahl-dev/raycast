export const HISTORY_MAX_AGE_MS = 48 * 60 * 60 * 1000;
// Sized to exactly one session window at the command's poll interval: 120 × 150s = 18000s, the
// same 5h as SESSION_WINDOW_SECONDS (anthropic.ts). The burn-rate projection reads oldest-vs-newest
// across this ring, so the cap is what actually bounds the lookback — HISTORY_MAX_AGE_MS never
// binds first. Re-derive this if the manifest's `interval` changes.
export const HISTORY_MAX_ENTRIES = 120;

const MINIMUM_PROJECTION_SPAN_MS = 30 * 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface HistoryPoint {
  at: Date;
  percent: number;
}

function isValidHistoryEntry(value: unknown): value is { atIso: string; percent: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { atIso?: unknown }).atIso === "string" &&
    typeof (value as { percent?: unknown }).percent === "number"
  );
}

// Cache storage format for a bucket's history ring: {atIso, percent}[] (ISO string, matching
// cache.ts's convention for Date fields). Pure and defensive by design — cache.ts's real backing
// store (@raycast/api's Cache) cannot be imported in this project's vitest environment at all, so
// any validation logic that needs to be unit tested has to live here rather than in cache.ts.
// Malformed JSON, a non-array payload, or individual entries with the wrong shape never throw —
// they are dropped, degrading to an empty (or partial) history rather than crashing the extension.
export function parseHistoryJson(raw: string): HistoryPoint[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const points: HistoryPoint[] = [];
  for (const entry of parsed) {
    if (!isValidHistoryEntry(entry)) {
      continue;
    }
    const at = new Date(entry.atIso);
    if (Number.isNaN(at.getTime())) {
      continue;
    }
    points.push({ at, percent: entry.percent });
  }
  return points;
}

export function serializeHistoryJson(history: HistoryPoint[]): string {
  return JSON.stringify(history.map((point) => ({ atIso: point.at.toISOString(), percent: point.percent })));
}

// Drops entries older than 48h and caps the ring at HISTORY_MAX_ENTRIES (oldest dropped first) — keeps the
// cached per-bucket history small without a separate GC job, mirroring pruneFiredKeys' self-cleaning
// approach in thresholds.ts.
export function pruneHistory(history: HistoryPoint[], now: Date): HistoryPoint[] {
  const cutoff = now.getTime() - HISTORY_MAX_AGE_MS;
  const recent = history.filter((point) => point.at.getTime() > cutoff);
  if (recent.length <= HISTORY_MAX_ENTRIES) {
    return recent;
  }
  return recent.slice(recent.length - HISTORY_MAX_ENTRIES);
}

export function appendHistory(history: HistoryPoint[], point: HistoryPoint, now: Date): HistoryPoint[] {
  return pruneHistory([...history, point], now);
}

// Linear projection from the oldest-vs-newest history points: percent/hour slope, extrapolated to
// 100%. A non-positive slope (flat or falling usage) never reaches 100%, so there is nothing to
// project. A projection landing after the window's own reset is moot — the window (and the
// counter) resets before the limit would ever actually be hit. The newest point already at or
// past 100% is moot for the same reason, and without this guard the (100 - newest.percent) term
// goes negative, projecting a "limit hit" date in the past.
export function projectLimitHit(history: HistoryPoint[], windowResetAt: Date, now: Date): Date | null {
  if (history.length < 2) {
    return null;
  }

  const oldest = history[0];
  const newest = history[history.length - 1];
  if (newest.percent >= 100) {
    return null;
  }

  const spanMs = newest.at.getTime() - oldest.at.getTime();
  if (spanMs < MINIMUM_PROJECTION_SPAN_MS) {
    return null;
  }

  const spanHours = spanMs / MILLISECONDS_PER_HOUR;
  const slopePerHour = (newest.percent - oldest.percent) / spanHours;
  if (slopePerHour <= 0) {
    return null;
  }

  const hoursToHundred = (100 - newest.percent) / slopePerHour;
  const projected = new Date(now.getTime() + hoursToHundred * MILLISECONDS_PER_HOUR);
  if (projected.getTime() > windowResetAt.getTime()) {
    return null;
  }
  return projected;
}
