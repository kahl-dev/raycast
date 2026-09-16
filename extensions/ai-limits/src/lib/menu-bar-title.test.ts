import { describe, expect, it } from "vitest";
import { aiLimitsReport, reportAccount, reportBucket } from "./__fixtures__/report";
import { buildMenuBarTitle } from "./menu-bar-title";

const THIN_SPACE = "\u2009";
const DASH = "\u2013";
const CODEX_LABEL = "\u1D33";

function weeklyAllBucket(account: string, percent: number) {
  return reportBucket({
    key: `anthropic:${account}:anthropic.weekly_all`,
    id: "anthropic.weekly_all",
    provider: "anthropic",
    account,
    percent,
  });
}

function codexPrimaryBucket(percent: number) {
  return reportBucket({
    key: "codex:default:codex.primary",
    id: "codex.primary",
    provider: "codex",
    account: "default",
    percent,
  });
}

describe("buildMenuBarTitle", () => {
  it("three accounts plus codex: byte-exact title with superscript labels and thin-space separators", () => {
    const report = aiLimitsReport({
      accounts: [
        reportAccount({ name: "work", label: "w" }),
        reportAccount({ name: "private", label: "p" }),
        reportAccount({ name: "work-2", label: "2" }),
      ],
      buckets: [weeklyAllBucket("work", 85), weeklyAllBucket("private", 0), weeklyAllBucket("work-2", 0)],
    });
    const withCodex = { ...report, buckets: [...report.buckets, codexPrimaryBucket(100)] };
    const title = buildMenuBarTitle(withCodex);
    const expected = ["ʷ85", "ᵖ0", "²0", `${CODEX_LABEL}100`].join(THIN_SPACE);
    expect(title).to.equal(expected);
  });

  it("account without a weekly_all bucket shows the dash placeholder for its slot", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" }), reportAccount({ name: "private", label: "p" })],
      buckets: [weeklyAllBucket("work", 85)],
    });
    const title = buildMenuBarTitle(report);
    expect(title).to.equal(["ʷ85", `ᵖ${DASH}`, `${CODEX_LABEL}${DASH}`].join(THIN_SPACE));
  });

  it("no codex bucket present shows the dash placeholder for the G slot", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [weeklyAllBucket("work", 85)],
    });
    const title = buildMenuBarTitle(report);
    expect(title).to.equal(["ʷ85", `${CODEX_LABEL}${DASH}`].join(THIN_SPACE));
  });

  it("five accounts render five slots plus codex, in accounts[] order", () => {
    const accounts = [
      reportAccount({ name: "a1", label: "a" }),
      reportAccount({ name: "a2", label: "b" }),
      reportAccount({ name: "a3", label: "c" }),
      reportAccount({ name: "a4", label: "d" }),
      reportAccount({ name: "a5", label: "e" }),
    ];
    const buckets = [
      weeklyAllBucket("a1", 10),
      weeklyAllBucket("a2", 20),
      weeklyAllBucket("a3", 30),
      weeklyAllBucket("a4", 40),
      weeklyAllBucket("a5", 50),
      codexPrimaryBucket(60),
    ];
    const report = aiLimitsReport({ accounts, buckets });
    const title = buildMenuBarTitle(report);
    expect(title).to.equal(["ᵃ10", "ᵇ20", "ᶜ30", "ᵈ40", "ᵉ50", `${CODEX_LABEL}60`].join(THIN_SPACE));
  });

  it("a digit label renders with the corresponding superscript digit", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work-2", label: "2" })],
      buckets: [weeklyAllBucket("work-2", 7)],
    });
    expect(buildMenuBarTitle(report)).to.equal(["²7", `${CODEX_LABEL}${DASH}`].join(THIN_SPACE));
  });

  it("rounds each slot's percent (Math.round)", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" })],
      buckets: [weeklyAllBucket("work", 84.5)],
    });
    expect(buildMenuBarTitle(report)).to.equal(["ʷ85", `${CODEX_LABEL}${DASH}`].join(THIN_SPACE));
  });

  it("boundary: empty accounts and no codex bucket shows only the G dash slot", () => {
    const report = aiLimitsReport({ accounts: [], buckets: [] });
    expect(buildMenuBarTitle(report)).to.equal(`${CODEX_LABEL}${DASH}`);
  });

  it("throws for an account label outside the [a-pr-z0-9] table", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "q" })],
      buckets: [],
    });
    expect(() => buildMenuBarTitle(report)).toThrow();
  });

  it("joins slots with exactly one THIN SPACE (U+2009) each, never a regular space", () => {
    const report = aiLimitsReport({
      accounts: [reportAccount({ name: "work", label: "w" }), reportAccount({ name: "private", label: "p" })],
      buckets: [weeklyAllBucket("work", 1), weeklyAllBucket("private", 2)],
    });
    const title = buildMenuBarTitle(report);
    expect(title.split(THIN_SPACE).length - 1).to.equal(2);
    expect(title.includes(" ")).to.equal(false);
  });
});
