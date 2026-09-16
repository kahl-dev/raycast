export type Severity = "normal" | "warning" | "critical";

export const WARNING_THRESHOLD = 80;
export const CRITICAL_THRESHOLD = 95;

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

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function secondsUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 1000;
}
