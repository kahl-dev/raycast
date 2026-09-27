import { formatDayMonth, formatDurationShort } from "./format";
import { ReportResetCreditEntry } from "./report";
import { secondsUntil } from "./types";

export const EXPIRY_WARNING_SECONDS = 3 * 24 * 60 * 60;

export interface ExpiryWarning {
  id: string;
  expiresAt: Date;
}

// An available credit whose expiry lies strictly inside the next three days and not yet in the
// past, and whose id has not warned before — not even earlier in the same list, since the parser
// does not reject duplicate ids. A credit without expires_at never expires.
export function determineExpiryWarnings(
  entries: ReportResetCreditEntry[],
  firedIds: ReadonlySet<string>,
  now: Date,
): ExpiryWarning[] {
  const warnings: ExpiryWarning[] = [];
  const warnedIds = new Set(firedIds);
  for (const entry of entries) {
    if (entry.status !== "available" || entry.expiresAt === null || warnedIds.has(entry.id)) {
      continue;
    }
    const remainingSeconds = secondsUntil(entry.expiresAt, now);
    if (remainingSeconds > 0 && remainingSeconds < EXPIRY_WARNING_SECONDS) {
      warnings.push({ id: entry.id, expiresAt: entry.expiresAt });
      warnedIds.add(entry.id);
    }
  }
  return warnings;
}

// Keeps a fired id only while its credit is still listed as available. The caller passes a known
// list; a null list (the source cannot list credits) is no evidence and must not prune, or the
// warning would fire again once the list comes back.
export function pruneExpiryWarningIds(firedIds: ReadonlySet<string>, entries: ReportResetCreditEntry[]): Set<string> {
  const availableIds = new Set(entries.filter((entry) => entry.status === "available").map((entry) => entry.id));
  return new Set([...firedIds].filter((id) => availableIds.has(id)));
}

export function formatExpiryWarningMessage(warning: ExpiryWarning, now: Date): string {
  const remaining = formatDurationShort(secondsUntil(warning.expiresAt, now));
  return `Codex reset credit expires in ${remaining} (${formatDayMonth(warning.expiresAt)})`;
}
