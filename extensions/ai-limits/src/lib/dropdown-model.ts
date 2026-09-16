import { formatTimeShort } from "./format";
import { AiLimitsReport, ReportBucket } from "./report";
import { CRITICAL_THRESHOLD, paceSeverity, Severity } from "./types";

export interface DropdownBucketRow {
  key: string;
  label: string;
  percent: number;
  severity: Severity;
  resetsAt: Date;
}

export interface DropdownErrorRow {
  message: string;
}

export interface DropdownSkippedRow {
  reason: string;
}

export interface DropdownAccountSection {
  title: string;
  rows: DropdownBucketRow[];
  errorRows: DropdownErrorRow[];
  skippedRows: DropdownSkippedRow[];
  standLabel: string | null;
}

export interface DropdownCodexSection {
  rows: DropdownBucketRow[];
  errorRows: DropdownErrorRow[];
  skippedRows: DropdownSkippedRow[];
  standLabel: string | null;
  resetCreditsLabel: string;
  resetCreditsSubtitle: string | null;
}

export interface DropdownModel {
  accountSections: DropdownAccountSection[];
  codexSection: DropdownCodexSection;
}

function computeSeverity(bucket: ReportBucket): Severity {
  if (bucket.percent >= CRITICAL_THRESHOLD) {
    return "critical";
  }
  return paceSeverity(bucket.percent, bucket.elapsedPercent);
}

function toRow(bucket: ReportBucket): DropdownBucketRow {
  return {
    key: bucket.key,
    label: bucket.label,
    percent: bucket.percent,
    severity: computeSeverity(bucket),
    resetsAt: bucket.resetsAt,
  };
}

function oldestObservedAt(buckets: ReportBucket[]): Date | null {
  if (buckets.length === 0) {
    return null;
  }
  return buckets.reduce(
    (oldest, bucket) => (bucket.observedAt < oldest ? bucket.observedAt : oldest),
    buckets[0].observedAt,
  );
}

// null (no "Stand" row at all) only when the account/pair has no buckets — an account with only
// errors renders its error rows without a timestamp that would otherwise claim a measurement.
function buildStandLabel(buckets: ReportBucket[], hasErrors: boolean): string | null {
  const oldest = oldestObservedAt(buckets);
  if (oldest === null) {
    return null;
  }
  const base = `Stand ${formatTimeShort(oldest)}`;
  return hasErrors ? `${base} (veraltet)` : base;
}

export function shouldShowRedeemHint(primaryCodexPercent: number | null): boolean {
  return primaryCodexPercent !== null && primaryCodexPercent >= 100;
}

export function buildDropdownModel(report: AiLimitsReport): DropdownModel {
  const accountSections: DropdownAccountSection[] = report.accounts.map((account) => {
    const buckets = report.buckets.filter(
      (bucket) => bucket.provider === "anthropic" && bucket.account === account.name,
    );
    const errorRows = report.errors
      .filter((error) => error.provider === "anthropic" && error.account === account.name)
      .map((error) => ({ message: error.message }));
    const skippedRows = report.skipped
      .filter((skipped) => skipped.provider === "anthropic" && skipped.account === account.name)
      .map((skipped) => ({ reason: skipped.reason }));
    const plan = report.plans.find((entry) => entry.provider === "anthropic" && entry.account === account.name);
    const title =
      plan !== undefined && plan.plan !== null ? `Claude · ${account.name} (${plan.plan})` : `Claude · ${account.name}`;

    return {
      title,
      rows: buckets.map(toRow),
      errorRows,
      skippedRows,
      standLabel: buildStandLabel(buckets, errorRows.length > 0),
    };
  });

  const codexBuckets = report.buckets.filter((bucket) => bucket.provider === "codex");
  const codexErrorRows = report.errors
    .filter((error) => error.provider === "codex")
    .map((error) => ({ message: error.message }));
  const codexSkippedRows = report.skipped
    .filter((skipped) => skipped.provider === "codex")
    .map((skipped) => ({ reason: skipped.reason }));
  const primaryCodexBucket = codexBuckets.find((bucket) => bucket.id === "codex.primary") ?? null;
  const resetCreditsLabel =
    report.resetCredits === null ? "Reset-Credits: unbekannt" : `Reset-Credits: ${report.resetCredits} verfügbar`;
  // "N > 0" gates the redeem hint independently of the pace-based shouldShowRedeemHint check: a
  // maxed-out primary bucket with zero reset credits has nothing to redeem.
  const hasRedeemableCredits = report.resetCredits !== null && report.resetCredits > 0;
  const resetCreditsSubtitle =
    hasRedeemableCredits && shouldShowRedeemHint(primaryCodexBucket ? primaryCodexBucket.percent : null)
      ? "Einlösen: codex → /usage"
      : null;

  const codexSection: DropdownCodexSection = {
    rows: codexBuckets.map(toRow),
    errorRows: codexErrorRows,
    skippedRows: codexSkippedRows,
    standLabel: buildStandLabel(codexBuckets, codexErrorRows.length > 0),
    resetCreditsLabel,
    resetCreditsSubtitle,
  };

  return { accountSections, codexSection };
}
