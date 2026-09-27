import { AiLimitsReport, ReportAccount, ReportBucket, ReportResetCreditEntry } from "../report";

export function reportAccount(overrides: Partial<ReportAccount> = {}): ReportAccount {
  return {
    name: "work",
    label: "w",
    ...overrides,
  };
}

export function reportBucket(overrides: Partial<ReportBucket> = {}): ReportBucket {
  return {
    key: "anthropic:work:anthropic.session",
    id: "anthropic.session",
    provider: "anthropic",
    account: "work",
    label: "Session (5h)",
    percent: 63,
    resetsAt: new Date("2026-09-16T16:00:00.000Z"),
    windowSeconds: 18000,
    observedAt: new Date("2026-09-16T11:19:00.000Z"),
    elapsedPercent: 40,
    ...overrides,
  };
}

// The real Codex credit observed on 2026-09-27 (ai-limits app-server source).
export function resetCreditEntry(overrides: Partial<ReportResetCreditEntry> = {}): ReportResetCreditEntry {
  return {
    provider: "codex",
    account: "default",
    id: "RateLimitResetCredit_6ebf262083f08191adacb227e3b1b96b",
    resetType: "codexRateLimits",
    status: "available",
    title: "Full reset",
    grantedAt: new Date("2026-09-22T20:31:07.000Z"),
    expiresAt: new Date("2026-10-22T20:31:07.000Z"),
    ...overrides,
  };
}

export function aiLimitsReport(overrides: Partial<AiLimitsReport> = {}): AiLimitsReport {
  return {
    fetchedAt: new Date("2026-09-16T11:20:00.000Z"),
    stale: false,
    accounts: [reportAccount()],
    buckets: [reportBucket()],
    errors: [],
    skipped: [],
    resetCredits: null,
    resetCreditEntries: null,
    plans: [],
    sources: [],
    ...overrides,
  };
}
