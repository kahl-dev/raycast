import { describe, expect, it } from "vitest";
import { aiLimitsReport, reportAccount, reportBucket } from "./__fixtures__/report";
import { buildDropdownModel, DropdownAccountSection, shouldShowRedeemHint } from "./dropdown-model";
import { formatTimeShort } from "./format";

function anthropicBucket(account: string, id: string, overrides: Partial<Parameters<typeof reportBucket>[0]> = {}) {
  return reportBucket({
    key: `anthropic:${account}:${id}`,
    id,
    provider: "anthropic",
    account,
    ...overrides,
  });
}

function codexBucket(id: string, overrides: Partial<Parameters<typeof reportBucket>[0]> = {}) {
  return reportBucket({
    key: `codex:default:${id}`,
    id,
    provider: "codex",
    account: "default",
    ...overrides,
  });
}

describe("buildDropdownModel — account sections", () => {
  it("emits one section per accounts[] entry, in accounts[] order", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" }), reportAccount({ name: "private", label: "p" })],
      buckets: [
        anthropicBucket("work", "anthropic.session", { label: "Session (5h)", percent: 10, elapsedPercent: 10 }),
        anthropicBucket("private", "anthropic.session", { label: "Session (5h)", percent: 20, elapsedPercent: 20 }),
      ],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections.map((section: DropdownAccountSection) => section.title)).to.deep.equal([
      "Claude · work",
      "Claude · private",
    ]);
  });

  it("section title includes the raw plan in parentheses when plans[] has a matching entry", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 10 })],
      plans: [{ provider: "anthropic", account: "work", plan: "max_20x", source: "credentials" }],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].title).to.equal("Claude · work (max_20x)");
  });

  it("section title omits the parentheses when no plan entry matches the account", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 10 })],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].title).to.equal("Claude · work");
  });

  it("section title omits the parentheses when the matching plan entry's plan is null", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 10 })],
      plans: [{ provider: "anthropic", account: "work", plan: null, source: "credentials" }],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].title).to.equal("Claude · work");
  });

  it("an account with only errors gets no rows and only error rows", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [],
      errors: [{ provider: "anthropic", account: "work", message: "Keychain-Token fehlt" }],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows).to.deep.equal([]);
    expect(model.accountSections[0].errorRows).to.deep.equal([{ message: "Keychain-Token fehlt" }]);
    expect(model.accountSections[0].standLabel).to.equal(null);
  });

  it("bucket rows follow report order and carry raw label/percent/resetsAt", () => {
    const resetsAt = new Date("2026-09-20T10:53:00.000Z");
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [
        anthropicBucket("work", "anthropic.weekly_all", {
          label: "Weekly (all models)",
          percent: 85,
          elapsedPercent: 70,
          resetsAt,
        }),
        anthropicBucket("work", "anthropic.session", {
          label: "Session (5h)",
          percent: 10,
          elapsedPercent: 40,
          resetsAt,
        }),
      ],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows).to.deep.equal([
      {
        key: "anthropic:work:anthropic.weekly_all",
        label: "Weekly (all models)",
        percent: 85,
        severity: "warning",
        resetsAt,
      },
      {
        key: "anthropic:work:anthropic.session",
        label: "Session (5h)",
        percent: 10,
        severity: "normal",
        resetsAt,
      },
    ]);
  });

  it("severity is critical for percent >= 95 regardless of pace", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 95, elapsedPercent: 99 })],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows[0].severity).to.equal("critical");
  });

  it("severity is normal when percent - elapsedPercent <= 0", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 40, elapsedPercent: 60 })],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows[0].severity).to.equal("normal");
  });

  it("severity is warning when percent - elapsedPercent is between 0 and 15", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 50, elapsedPercent: 40 })],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows[0].severity).to.equal("warning");
  });

  it("severity is critical when percent - elapsedPercent exceeds 15 even below the 95 floor", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 60, elapsedPercent: 40 })],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].rows[0].severity).to.equal("critical");
  });

  it("Stand HH:MM equals the oldest observedAt among that account's buckets", () => {
    const older = new Date("2026-09-16T11:10:00.000Z");
    const newer = new Date("2026-09-16T11:19:00.000Z");
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [
        anthropicBucket("work", "anthropic.weekly_all", { percent: 85, elapsedPercent: 70, observedAt: newer }),
        anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 40, observedAt: older }),
      ],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].standLabel).to.equal(`Stand ${formatTimeShort(older)}`);
  });

  it("appends ' (veraltet)' to Stand when errors[] exist for that provider/account pair", () => {
    const observedAt = new Date("2026-09-16T11:10:00.000Z");
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 40, observedAt })],
      errors: [{ provider: "anthropic", account: "work", message: "teilweise fehlgeschlagen" }],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].standLabel).to.equal(`Stand ${formatTimeShort(observedAt)} (veraltet)`);
  });

  it("does not append the veraltet suffix for a different account's errors", () => {
    const observedAt = new Date("2026-09-16T11:10:00.000Z");
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" }), reportAccount({ name: "private", label: "p" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 40, observedAt })],
      errors: [{ provider: "anthropic", account: "private", message: "teilweise fehlgeschlagen" }],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].standLabel).to.equal(`Stand ${formatTimeShort(observedAt)}`);
  });

  it("skipped entries for the account appear as skippedRows carrying the raw reason", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [anthropicBucket("work", "anthropic.session", { percent: 10, elapsedPercent: 40 })],
      skipped: [{ provider: "anthropic", account: "work", reason: "Limit nicht lesbar" }],
      plans: [],
    });
    const model = buildDropdownModel(report);
    expect(model.accountSections[0].skippedRows).to.deep.equal([{ reason: "Limit nicht lesbar" }]);
  });
});

describe("buildDropdownModel — codex section", () => {
  it("shows 'Reset-Credits: 0 verfügbar' for reset_credits 0, with no redeem subtitle", () => {
    const report = aiLimitsReport({ accounts: [], buckets: [], plans: [], resetCredits: 0 });
    const model = buildDropdownModel(report);
    expect(model.codexSection.resetCreditsLabel).to.equal("Reset-Credits: 0 verfügbar");
    expect(model.codexSection.resetCreditsSubtitle).to.equal(null);
  });

  it("shows 'Reset-Credits: 3 verfügbar' with the redeem subtitle when the primary bucket is at/over 100%", () => {
    const report = aiLimitsReport({
      accounts: [],
      buckets: [codexBucket("codex.primary", { percent: 100, elapsedPercent: 70 })],
      plans: [],
      resetCredits: 3,
    });
    const model = buildDropdownModel(report);
    expect(model.codexSection.resetCreditsLabel).to.equal("Reset-Credits: 3 verfügbar");
    expect(model.codexSection.resetCreditsSubtitle).to.equal("Einlösen: codex → /usage");
  });

  it("shows 'Reset-Credits: 3 verfügbar' without the redeem subtitle when the primary bucket is below 100%", () => {
    const report = aiLimitsReport({
      accounts: [],
      buckets: [codexBucket("codex.primary", { percent: 40, elapsedPercent: 70 })],
      plans: [],
      resetCredits: 3,
    });
    const model = buildDropdownModel(report);
    expect(model.codexSection.resetCreditsLabel).to.equal("Reset-Credits: 3 verfügbar");
    expect(model.codexSection.resetCreditsSubtitle).to.equal(null);
  });

  it("shows 'Reset-Credits: unbekannt' for a null reset_credits", () => {
    const report = aiLimitsReport({
      accounts: [],
      buckets: [codexBucket("codex.primary", { percent: 100, elapsedPercent: 70 })],
      plans: [],
      resetCredits: null,
    });
    const model = buildDropdownModel(report);
    expect(model.codexSection.resetCreditsLabel).to.equal("Reset-Credits: unbekannt");
    expect(model.codexSection.resetCreditsSubtitle).to.equal(null);
  });

  it("codex rows carry raw label/percent and Stand from the codex bucket's observedAt", () => {
    const observedAt = new Date("2026-09-16T11:15:00.000Z");
    const report = aiLimitsReport({
      accounts: [],
      buckets: [codexBucket("codex.primary", { label: "Primary (7d)", percent: 100, elapsedPercent: 70, observedAt })],
      plans: [],
      resetCredits: 0,
    });
    const model = buildDropdownModel(report);
    expect(model.codexSection.rows).to.deep.equal([
      {
        key: "codex:default:codex.primary",
        label: "Primary (7d)",
        percent: 100,
        severity: "critical",
        resetsAt: report.buckets[0].resetsAt,
      },
    ]);
    expect(model.codexSection.standLabel).to.equal(`Stand ${formatTimeShort(observedAt)}`);
  });

  it("codex errors surface as errorRows on the codex section", () => {
    const report = aiLimitsReport({
      accounts: [],
      buckets: [],
      errors: [{ provider: "codex", account: "default", message: "app-server nicht erreichbar" }],
      plans: [],
      resetCredits: null,
    });
    const model = buildDropdownModel(report);
    expect(model.codexSection.errorRows).to.deep.equal([{ message: "app-server nicht erreichbar" }]);
  });
});

describe("shouldShowRedeemHint", () => {
  it("is true when the primary codex percent is at or above 100", () => {
    expect(shouldShowRedeemHint(100)).to.equal(true);
    expect(shouldShowRedeemHint(100.4)).to.equal(true);
  });

  it("is false when the primary codex percent is below 100", () => {
    expect(shouldShowRedeemHint(99.9)).to.equal(false);
  });

  it("is false when there is no primary codex bucket", () => {
    expect(shouldShowRedeemHint(null)).to.equal(false);
  });
});
