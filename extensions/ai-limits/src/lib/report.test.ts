import { describe, expect, it } from "vitest";
import rawFixture from "./__fixtures__/ai-limits-report.json";
import { parseAiLimitsReport } from "./report";

function clone(): typeof rawFixture {
  return JSON.parse(JSON.stringify(rawFixture)) as typeof rawFixture;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asMutable(raw: typeof rawFixture): any {
  return raw;
}

describe("parseAiLimitsReport", () => {
  it("parses a full valid report into the expected structure", () => {
    const raw = clone();
    const result = parseAiLimitsReport(raw);
    expect(result).to.deep.equal({
      fetchedAt: new Date("2026-09-16T11:20:00.000Z"),
      stale: false,
      accounts: [
        { name: "work", label: "w" },
        { name: "private", label: "p" },
        { name: "work-2", label: "2" },
      ],
      buckets: [
        {
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
        },
        {
          key: "anthropic:work:anthropic.weekly_all",
          id: "anthropic.weekly_all",
          provider: "anthropic",
          account: "work",
          label: "Weekly (all models)",
          percent: 85,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:19:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "anthropic:work:anthropic.weekly.fable",
          id: "anthropic.weekly.fable",
          provider: "anthropic",
          account: "work",
          label: "Weekly (Fable)",
          percent: 52,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:19:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "anthropic:private:anthropic.session",
          id: "anthropic.session",
          provider: "anthropic",
          account: "private",
          label: "Session (5h)",
          percent: 12,
          resetsAt: new Date("2026-09-16T15:30:00.000Z"),
          windowSeconds: 18000,
          observedAt: new Date("2026-09-16T11:18:00.000Z"),
          elapsedPercent: 25,
        },
        {
          key: "anthropic:private:anthropic.weekly_all",
          id: "anthropic.weekly_all",
          provider: "anthropic",
          account: "private",
          label: "Weekly (all models)",
          percent: 0,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:18:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "anthropic:private:anthropic.weekly.fable",
          id: "anthropic.weekly.fable",
          provider: "anthropic",
          account: "private",
          label: "Weekly (Fable)",
          percent: 0,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:18:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "anthropic:work-2:anthropic.session",
          id: "anthropic.session",
          provider: "anthropic",
          account: "work-2",
          label: "Session (5h)",
          percent: 0,
          resetsAt: new Date("2026-09-16T15:00:00.000Z"),
          windowSeconds: 18000,
          observedAt: new Date("2026-09-16T11:17:00.000Z"),
          elapsedPercent: 10,
        },
        {
          key: "anthropic:work-2:anthropic.weekly_all",
          id: "anthropic.weekly_all",
          provider: "anthropic",
          account: "work-2",
          label: "Weekly (all models)",
          percent: 0,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:17:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "anthropic:work-2:anthropic.weekly.fable",
          id: "anthropic.weekly.fable",
          provider: "anthropic",
          account: "work-2",
          label: "Weekly (Fable)",
          percent: 0,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:17:00.000Z"),
          elapsedPercent: 70,
        },
        {
          key: "codex:default:codex.primary",
          id: "codex.primary",
          provider: "codex",
          account: "default",
          label: "Primary (7d)",
          percent: 100,
          resetsAt: new Date("2026-09-20T10:53:00.000Z"),
          windowSeconds: 604800,
          observedAt: new Date("2026-09-16T11:15:00.000Z"),
          elapsedPercent: 70,
        },
      ],
      errors: [],
      skipped: [],
      resetCredits: 0,
      plans: [
        { provider: "anthropic", account: "work", plan: "max_20x", source: "credentials" },
        { provider: "anthropic", account: "private", plan: "max_5x", source: "credentials" },
        { provider: "anthropic", account: "work-2", plan: "max_5x", source: "credentials" },
        { provider: "codex", account: "default", plan: "self_serve_business_prolite", source: "app-server" },
      ],
      sources: [
        { provider: "anthropic", account: "work", source: "endpoint" },
        { provider: "anthropic", account: "private", source: "endpoint" },
        { provider: "anthropic", account: "work-2", source: "endpoint" },
        { provider: "codex", account: "default", source: "app-server" },
      ],
    });
  });

  it("accepts a report whose lists are all empty and reset_credits is null", () => {
    const raw = clone();
    const mutable = asMutable(raw);
    mutable.accounts = [];
    mutable.buckets = [];
    mutable.errors = [];
    mutable.skipped = [];
    mutable.plans = [];
    mutable.sources = [];
    mutable.reset_credits = null;
    const result = parseAiLimitsReport(raw);
    expect(result.accounts).to.deep.equal([]);
    expect(result.buckets).to.deep.equal([]);
    expect(result.errors).to.deep.equal([]);
    expect(result.skipped).to.deep.equal([]);
    expect(result.plans).to.deep.equal([]);
    expect(result.sources).to.deep.equal([]);
    expect(result.resetCredits).to.equal(null);
  });

  it("rejects when the payload is not an object", () => {
    expect(() => parseAiLimitsReport(null)).toThrow();
    expect(() => parseAiLimitsReport("a string")).toThrow();
    expect(() => parseAiLimitsReport(42)).toThrow();
  });

  it("rejects when fetched_at is missing", () => {
    const raw = clone();
    delete asMutable(raw).fetched_at;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when fetched_at has the wrong type", () => {
    const raw = clone();
    asMutable(raw).fetched_at = 12345;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when stale is missing", () => {
    const raw = clone();
    delete asMutable(raw).stale;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when stale has the wrong type", () => {
    const raw = clone();
    asMutable(raw).stale = "false";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when accounts is missing", () => {
    const raw = clone();
    delete asMutable(raw).accounts;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's name is missing", () => {
    const raw = clone();
    delete asMutable(raw).accounts[0].name;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's name has the wrong type", () => {
    const raw = clone();
    asMutable(raw).accounts[0].name = 7;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's label is empty", () => {
    const raw = clone();
    asMutable(raw).accounts[0].label = "";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's label is two characters", () => {
    const raw = clone();
    asMutable(raw).accounts[0].label = "wp";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's label is an emoji", () => {
    const raw = clone();
    asMutable(raw).accounts[0].label = "\u{1F3AF}";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an account's label is missing", () => {
    const raw = clone();
    delete asMutable(raw).accounts[0].label;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when buckets is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's id is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].id;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's provider is unknown", () => {
    const raw = clone();
    asMutable(raw).buckets[0].provider = "openai";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's provider is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].provider;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's account is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].account;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's label is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].label;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's percent is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].percent;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's percent is NaN", () => {
    const raw = clone();
    asMutable(raw).buckets[0].percent = Number.NaN;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's percent is Infinity", () => {
    const raw = clone();
    asMutable(raw).buckets[0].percent = Number.POSITIVE_INFINITY;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's resets_at is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].resets_at;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's resets_at has the wrong type", () => {
    const raw = clone();
    asMutable(raw).buckets[0].resets_at = 12345;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's window_seconds is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].window_seconds;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's window_seconds is zero", () => {
    const raw = clone();
    asMutable(raw).buckets[0].window_seconds = 0;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's window_seconds is negative", () => {
    const raw = clone();
    asMutable(raw).buckets[0].window_seconds = -18000;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's observed_at is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].observed_at;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's observed_at has the wrong type", () => {
    const raw = clone();
    asMutable(raw).buckets[0].observed_at = 12345;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's elapsed_percent is missing", () => {
    const raw = clone();
    delete asMutable(raw).buckets[0].elapsed_percent;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's elapsed_percent is -1", () => {
    const raw = clone();
    asMutable(raw).buckets[0].elapsed_percent = -1;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a bucket's elapsed_percent is 101", () => {
    const raw = clone();
    asMutable(raw).buckets[0].elapsed_percent = 101;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("accepts a bucket's elapsed_percent at the 0 boundary", () => {
    const raw = clone();
    asMutable(raw).buckets[0].elapsed_percent = 0;
    const result = parseAiLimitsReport(raw);
    expect(result.buckets[0].elapsedPercent).to.equal(0);
  });

  it("accepts a bucket's elapsed_percent at the 100 boundary", () => {
    const raw = clone();
    asMutable(raw).buckets[0].elapsed_percent = 100;
    const result = parseAiLimitsReport(raw);
    expect(result.buckets[0].elapsedPercent).to.equal(100);
  });

  it("rejects when errors is missing", () => {
    const raw = clone();
    delete asMutable(raw).errors;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when an error entry is missing message", () => {
    const raw = clone();
    asMutable(raw).errors = [{ provider: "anthropic", account: "work" }];
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when skipped is missing", () => {
    const raw = clone();
    delete asMutable(raw).skipped;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a skipped entry is missing reason", () => {
    const raw = clone();
    asMutable(raw).skipped = [{ provider: "anthropic", account: "work" }];
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when reset_credits is missing", () => {
    const raw = clone();
    delete asMutable(raw).reset_credits;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when reset_credits has the wrong type", () => {
    const raw = clone();
    asMutable(raw).reset_credits = "0";
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when plans is missing", () => {
    const raw = clone();
    delete asMutable(raw).plans;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a plan entry is missing plan", () => {
    const raw = clone();
    delete asMutable(raw).plans[0].plan;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a plan entry is missing source", () => {
    const raw = clone();
    delete asMutable(raw).plans[0].source;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("accepts a plan entry whose plan is null", () => {
    const raw = clone();
    asMutable(raw).plans[0].plan = null;
    const result = parseAiLimitsReport(raw);
    expect(result.plans[0].plan).to.equal(null);
  });

  it("accepts a plan entry whose source is null", () => {
    const raw = clone();
    asMutable(raw).plans[0].source = null;
    const result = parseAiLimitsReport(raw);
    expect(result.plans[0].source).to.equal(null);
  });

  it("rejects when a plan entry's plan is neither a string nor null", () => {
    const raw = clone();
    asMutable(raw).plans[0].plan = 5;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a plan entry's source is neither a string nor null", () => {
    const raw = clone();
    asMutable(raw).plans[0].source = 5;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when sources is missing", () => {
    const raw = clone();
    delete asMutable(raw).sources;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });

  it("rejects when a source entry is missing source", () => {
    const raw = clone();
    delete asMutable(raw).sources[0].source;
    expect(() => parseAiLimitsReport(raw)).toThrow();
  });
});
