export type Provider = "anthropic" | "openai";

export type Severity = "normal" | "warning" | "critical";

export const WARNING_THRESHOLD = 80;
export const CRITICAL_THRESHOLD = 95;

/**
 * Normalized usage bucket rendered generically in the dropdown.
 * ID schema: anthropic:session, anthropic:weekly_all, anthropic:weekly_scoped:<model-id>,
 * openai:primary, openai:secondary.
 */
export interface Bucket {
  id: string;
  provider: Provider;
  label: string;
  percent: number;
  resetsAt: Date;
  windowSeconds: number;
}

const PACE_WARNING_DIFF = 15;

// Diff of "how much of the limit is used" vs "how much of the window has elapsed" — mirrors the
// tmux statusline pace semantics: ahead of pace by more than 15 points is critical, any lead is
// at least a warning, at or behind pace is normal.
export function paceSeverity(percent: number, elapsedPercent: number): Severity {
  const diff = percent - elapsedPercent;
  if (diff <= 0) {
    return "normal";
  }
  if (diff <= PACE_WARNING_DIFF) {
    return "warning";
  }
  return "critical";
}

// Proportion of the window that has already elapsed, clamped to 0..100 — resetsAt in the past
// (stale data, clock skew) clamps to 100 (fully elapsed) rather than going negative.
export function computeElapsedPercent(windowSeconds: number, resetsAt: Date, now: Date): number {
  const secondsUntilReset = secondsUntil(resetsAt, now);
  const raw = ((windowSeconds - secondsUntilReset) / windowSeconds) * 100;
  return Math.min(100, Math.max(0, raw));
}

// Render-time severity used for display (menu bar icon tint, dropdown dot color). Purely
// percent/pace-based — the absolute 80/95 alert thresholds (thresholds.ts) are computed
// separately, straight off bucket.percent. A bucket at >=95% is always shown critical, even at
// good pace, because it is nearly exhausted regardless of how quickly it got there.
export function displaySeverity(bucket: Bucket, now: Date): Severity {
  if (bucket.percent >= CRITICAL_THRESHOLD) {
    return "critical";
  }
  return paceSeverity(bucket.percent, computeElapsedPercent(bucket.windowSeconds, bucket.resetsAt, now));
}

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Shared cooldown-window predicate: has at least `thresholdMs` elapsed since the last attempt?
// Never having attempted counts as elapsed (immediately eligible). Backs both the Anthropic
// fetch cooldown and the Codex login-retry debounce, which differ only in threshold and polarity.
export function hasElapsed(lastAttemptAt: Date | null, now: Date, thresholdMs: number): boolean {
  if (lastAttemptAt === null) {
    return true;
  }
  return now.getTime() - lastAttemptAt.getTime() >= thresholdMs;
}

export function secondsUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 1000;
}

export function parseFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} ist keine endliche Zahl: ${JSON.stringify(value)}`);
  }
  return value;
}

// Narrows the top-level shape shared by every raw API/file JSON payload this extension parses
// (Anthropic usage, Codex usage) before callers cast to their specific Raw*Response interface.
export function assertJsonObject(json: unknown, context: string): asserts json is Record<string, unknown> {
  if (typeof json !== "object" || json === null) {
    throw new Error(`${context} ist kein Objekt`);
  }
}

export function parseJsonOrThrow(raw: string, context: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${context} ist kein valides JSON: ${toError(error).message}`);
  }
}

export async function readJsonBody(response: Response, context: string): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${context} ist kein valides JSON: ${toError(error).message}`);
  }
}
