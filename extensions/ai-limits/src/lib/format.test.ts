import { describe, it, expect } from "vitest";
import { formatDurationShort, formatReset, formatTimeShort } from "./format";

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

describe("formatReset", () => {
  it("returns time plus countdown when the reset is later today", () => {
    const now = new Date(2026, 6, 21, 8, 0);
    const resetsAt = new Date(2026, 6, 21, 11, 29);

    expect(formatReset(resetsAt, now)).to.equal("11:29 (in 3h 29m)");
  });

  it("returns weekday, time, and countdown when the reset is on a different day", () => {
    const now = new Date(2026, 6, 21, 8, 0); // Tuesday
    const resetsAt = new Date(2026, 6, 27, 22, 0); // Monday next week

    expect(formatReset(resetsAt, now)).to.equal("Mon 22:00 (in 6d 14h)");
  });

  it("boundary: omits the countdown when resetsAt equals now", () => {
    const now = new Date(2026, 6, 21, 8, 0);

    expect(formatReset(now, now)).to.equal("08:00");
  });

  it("boundary: omits the countdown when resetsAt is in the past", () => {
    const now = new Date(2026, 6, 21, 8, 0);
    const resetsAt = new Date(2026, 6, 21, 7, 0);

    expect(formatReset(resetsAt, now)).to.equal("07:00");
  });
});
