import { describe, it, expect } from "vitest";
import {
  buildMenuBarTitle,
  computeBucketSeverities,
  formatDurationShort,
  formatResetGerman,
  formatTimeShort,
  highestDisplaySeverity,
  TITLE_LAYOUTS,
} from "./format";
import { bucket } from "./__fixtures__/bucket";

const session = bucket({ id: "anthropic:session", label: "Session", percent: 24 });
const weeklyAll = bucket({ id: "anthropic:weekly_all", label: "Woche", percent: 5 });
const weeklyScopedFable = bucket({
  id: "anthropic:weekly_scoped:fable",
  label: "Fable",
  percent: 8,
});
const openaiPrimary = bucket({
  id: "openai:primary",
  provider: "openai",
  label: "OpenAI",
  percent: 100,
});

describe("formatTimeShort", () => {
  it("zero-pads single-digit hours and minutes", () => {
    const date = new Date(2026, 6, 21, 9, 5);
    expect(formatTimeShort(date)).to.equal("09:05");
  });

  it("formats double-digit hours and minutes without padding artifacts", () => {
    const date = new Date(2026, 6, 21, 22, 30);
    expect(formatTimeShort(date)).to.equal("22:30");
  });
});

describe("formatDurationShort", () => {
  it("boundary: less than a minute rounds down to 0m", () => {
    expect(formatDurationShort(30)).to.equal("0m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatDurationShort(45 * 60)).to.equal("45m");
  });

  it("boundary: formats hours and minutes at exactly 1 hour", () => {
    expect(formatDurationShort(60 * 60)).to.equal("1h 0m");
  });

  it("formats hours and minutes when under a day", () => {
    expect(formatDurationShort(2 * 60 * 60 + 5 * 60)).to.equal("2h 5m");
  });

  it("boundary: formats days and hours at exactly 1 day", () => {
    expect(formatDurationShort(24 * 60 * 60)).to.equal("1d 0h");
  });

  it("formats days and hours for multi-day spans", () => {
    expect(formatDurationShort(3 * 24 * 60 * 60 + 10 * 60 * 60)).to.equal("3d 10h");
  });
});

describe("formatResetGerman", () => {
  it("returns time plus countdown when the reset is later today", () => {
    const now = new Date(2026, 6, 21, 8, 0);
    const resetsAt = new Date(2026, 6, 21, 11, 29);

    expect(formatResetGerman(resetsAt, now)).to.equal("11:29 (in 3h 29m)");
  });

  it("returns weekday, time, and countdown when the reset is on a different day", () => {
    const now = new Date(2026, 6, 21, 8, 0); // Tuesday
    const resetsAt = new Date(2026, 6, 27, 22, 0); // Monday next week

    expect(formatResetGerman(resetsAt, now)).to.equal("Mo 22:00 (in 6d 14h)");
  });

  it("boundary: omits the countdown when resetsAt equals now", () => {
    const now = new Date(2026, 6, 21, 8, 0);

    expect(formatResetGerman(now, now)).to.equal("08:00");
  });

  it("boundary: omits the countdown when resetsAt is in the past", () => {
    const now = new Date(2026, 6, 21, 8, 0);
    const resetsAt = new Date(2026, 6, 21, 7, 0);

    expect(formatResetGerman(resetsAt, now)).to.equal("07:00");
  });
});

describe("computeBucketSeverities", () => {
  const now = new Date(2026, 6, 21, 8, 0);

  it("pairs each bucket with its displaySeverity, preserving input order", () => {
    const normalBucket = bucket({
      id: "anthropic:session",
      percent: 30,
      resetsAt: new Date(now.getTime() - 1000),
      windowSeconds: 18000,
    });
    const criticalBucket = bucket({
      id: "anthropic:weekly_all",
      percent: 95,
      resetsAt: new Date(now.getTime() + 18000 * 1000),
      windowSeconds: 18000,
    });

    expect(computeBucketSeverities([normalBucket, criticalBucket], now)).to.deep.equal([
      { bucket: normalBucket, severity: "normal" },
      { bucket: criticalBucket, severity: "critical" },
    ]);
  });

  it("boundary: returns an empty array for an empty bucket list", () => {
    expect(computeBucketSeverities([], now)).to.deep.equal([]);
  });
});

describe("highestDisplaySeverity", () => {
  const now = new Date(2026, 6, 21, 8, 0);

  it("returns normal for an empty list", () => {
    expect(highestDisplaySeverity([])).to.equal("normal");
  });

  it("returns critical when a bucket is at or above 95 percent (override), regardless of pace", () => {
    // Window just started (elapsedPercent ~0) so pace alone would say critical anyway here — the
    // point of this test is the >=95 override path, not pace, so pin percent to exactly 95.
    const resetsAt = new Date(now.getTime() + 18000 * 1000);
    const severities = computeBucketSeverities([bucket({ percent: 95, resetsAt, windowSeconds: 18000 })], now);
    expect(highestDisplaySeverity(severities)).to.equal("critical");
  });

  it("returns the worst severity across buckets, not just the highest-percent bucket's", () => {
    // badPaceLowerPercent: window just started (elapsedPercent ~0) but already at 60% -> diff ~60 -> critical.
    // higherPercentGoodPace: a *higher* raw percent (90%) but the window is fully elapsed -> diff -10 -> normal.
    // The old percent-based highestSeverity would have picked higherPercentGoodPace (90 > 60) and
    // returned "warning" — highestDisplaySeverity must return "critical" instead.
    const badPaceLowerPercent = bucket({
      id: "anthropic:session",
      percent: 60,
      resetsAt: new Date(now.getTime() + 18000 * 1000 - 1000),
      windowSeconds: 18000,
    });
    const higherPercentGoodPace = bucket({
      id: "anthropic:weekly_all",
      percent: 90,
      resetsAt: new Date(now.getTime() - 1000),
      windowSeconds: 18000,
    });
    const severities = computeBucketSeverities([higherPercentGoodPace, badPaceLowerPercent], now);
    expect(highestDisplaySeverity(severities)).to.equal("critical");
  });

  it("returns normal when every bucket is on or behind pace and below 95 percent", () => {
    const onPace = bucket({ percent: 30, resetsAt: new Date(now.getTime() - 1000), windowSeconds: 18000 });
    const severities = computeBucketSeverities([onPace], now);
    expect(highestDisplaySeverity(severities)).to.equal("normal");
  });
});

describe("TITLE_LAYOUTS", () => {
  it("contains exactly the four defined layouts in order", () => {
    expect(TITLE_LAYOUTS).to.deep.equal(["weekly", "all", "max", "icon"]);
  });
});

describe("buildMenuBarTitle", () => {
  it("icon layout is always empty regardless of buckets", () => {
    expect(buildMenuBarTitle("icon", [session, weeklyAll, weeklyScopedFable, openaiPrimary])).to.equal("");
    expect(buildMenuBarTitle("icon", [])).to.equal("");
  });

  it("weekly layout renders weekly_all, highest weekly_scoped, highest openai (no session)", () => {
    expect(buildMenuBarTitle("weekly", [session, weeklyAll, weeklyScopedFable, openaiPrimary])).to.equal("W5 F8 O100");
  });

  it("weekly layout omits the weekly_scoped slot when absent", () => {
    expect(buildMenuBarTitle("weekly", [session, weeklyAll, openaiPrimary])).to.equal("W5 O100");
  });

  it("weekly layout omits the openai slot when absent", () => {
    expect(buildMenuBarTitle("weekly", [weeklyAll, weeklyScopedFable])).to.equal("W5 F8");
  });

  it("weekly layout returns empty string when no buckets are known", () => {
    expect(buildMenuBarTitle("weekly", [])).to.equal("");
  });

  it("weekly layout picks the highest of multiple weekly_scoped buckets", () => {
    const lowerScoped = bucket({ id: "anthropic:weekly_scoped:other", label: "Other", percent: 3 });
    expect(buildMenuBarTitle("weekly", [weeklyAll, weeklyScopedFable, lowerScoped])).to.equal("W5 F8");
  });

  it("all layout includes session in addition to the weekly slots", () => {
    expect(buildMenuBarTitle("all", [session, weeklyAll, weeklyScopedFable, openaiPrimary])).to.equal("S24 W5 F8 O100");
  });

  it("all layout omits session when it is missing", () => {
    expect(buildMenuBarTitle("all", [weeklyAll, weeklyScopedFable, openaiPrimary])).to.equal("W5 F8 O100");
  });

  it("max layout renders only the single highest bucket across providers", () => {
    expect(buildMenuBarTitle("max", [session, weeklyAll, weeklyScopedFable, openaiPrimary])).to.equal("O100");
  });

  it("max layout uses the anthropic label initial when anthropic is highest", () => {
    const highSession = bucket({ id: "anthropic:session", label: "Session", percent: 99 });
    expect(buildMenuBarTitle("max", [highSession, weeklyAll])).to.equal("S99");
  });

  it("max layout returns empty string when there are no buckets", () => {
    expect(buildMenuBarTitle("max", [])).to.equal("");
  });

  it("openai letter is always O regardless of the bucket label text", () => {
    const secondary = bucket({ id: "openai:secondary", provider: "openai", label: "OpenAI (sekundär)", percent: 42 });
    expect(buildMenuBarTitle("max", [secondary])).to.equal("O42");
  });
});
