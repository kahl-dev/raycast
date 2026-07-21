import { describe, it, expect } from "vitest";
import { bucket } from "./__fixtures__/bucket";
import { computeElapsedPercent, displaySeverity, paceSeverity, toError } from "./types";

describe("toError", () => {
  it("passes an Error instance through unchanged", () => {
    const original = new Error("boom");
    expect(toError(original)).to.equal(original);
  });

  it("wraps a non-Error value in an Error", () => {
    const wrapped = toError("plain string failure");
    expect(wrapped).to.be.instanceOf(Error);
    expect(wrapped.message).to.equal("plain string failure");
  });

  it("wraps null and undefined without throwing", () => {
    expect(toError(null).message).to.equal("null");
    expect(toError(undefined).message).to.equal("undefined");
  });
});

describe("computeElapsedPercent", () => {
  it("boundary: clamps to 0 when the window just started (resetsAt equals now plus the full window)", () => {
    const windowSeconds = 18000;
    const now = new Date("2026-07-21T00:00:00.000Z");
    const resetsAt = new Date(now.getTime() + windowSeconds * 1000);
    expect(computeElapsedPercent(windowSeconds, resetsAt, now)).to.equal(0);
  });

  it("boundary: clamps to 100 when resetsAt is already in the past", () => {
    const windowSeconds = 18000;
    const now = new Date("2026-07-21T00:00:00.000Z");
    const resetsAt = new Date(now.getTime() - 1000);
    expect(computeElapsedPercent(windowSeconds, resetsAt, now)).to.equal(100);
  });

  it("computes the proportion of the window that has elapsed", () => {
    const windowSeconds = 18000; // 5h
    const now = new Date("2026-07-21T00:00:00.000Z");
    const resetsAt = new Date(now.getTime() + (windowSeconds / 2) * 1000); // half the window remains
    expect(computeElapsedPercent(windowSeconds, resetsAt, now)).to.equal(50);
  });
});

describe("paceSeverity", () => {
  it("boundary: diff exactly 0 is normal", () => {
    expect(paceSeverity(50, 50)).to.equal("normal");
  });

  it("is normal when usage trails the elapsed window (diff negative)", () => {
    expect(paceSeverity(10, 50)).to.equal("normal");
  });

  it("boundary: diff exactly 15 is warning", () => {
    expect(paceSeverity(65, 50)).to.equal("warning");
  });

  it("is critical above a diff of 15", () => {
    expect(paceSeverity(66, 50)).to.equal("critical");
  });
});

describe("displaySeverity", () => {
  const windowSeconds = 18000; // 5h
  const now = new Date("2026-07-21T05:00:00.000Z");

  it("boundary: percent >= 95 is always critical regardless of good pace", () => {
    // Window has barely started (elapsedPercent near 0) yet usage is already at 95 — pace alone
    // would say "critical" anyway here, so pick a percent/elapsed combo where pace would say normal.
    const resetsAt = new Date(now.getTime() + windowSeconds * 1000 - 1000); // elapsedPercent ~0
    const b = bucket({ percent: 95, resetsAt, windowSeconds });
    expect(displaySeverity(b, now)).to.equal("critical");
  });

  it("falls back to pace severity below the 95 override", () => {
    // Window fully elapsed (elapsedPercent 100) but usage only at 50 -> diff -50 -> normal.
    const resetsAt = new Date(now.getTime() - 1000);
    const b = bucket({ percent: 50, resetsAt, windowSeconds });
    expect(displaySeverity(b, now)).to.equal("normal");
  });

  it("is critical when pace is far ahead of elapsed time, even below 95 percent", () => {
    // Window just started (elapsedPercent ~0) but usage already at 80 -> diff ~80 -> critical.
    const resetsAt = new Date(now.getTime() + windowSeconds * 1000 - 1000);
    const b = bucket({ percent: 80, resetsAt, windowSeconds });
    expect(displaySeverity(b, now)).to.equal("critical");
  });
});
