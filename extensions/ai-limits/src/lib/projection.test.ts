import { describe, it, expect } from "vitest";
import {
  appendHistory,
  HISTORY_MAX_AGE_MS,
  HISTORY_MAX_ENTRIES,
  parseHistoryJson,
  projectLimitHit,
  pruneHistory,
  serializeHistoryJson,
} from "./projection";

describe("pruneHistory", () => {
  const now = new Date("2026-07-21T09:00:00.000Z");

  it("keeps entries younger than 48h", () => {
    const point = { at: new Date(now.getTime() - HISTORY_MAX_AGE_MS + 1000), percent: 10 };
    expect(pruneHistory([point], now)).to.deep.equal([point]);
  });

  it("boundary: drops an entry at exactly 48h old", () => {
    const point = { at: new Date(now.getTime() - HISTORY_MAX_AGE_MS), percent: 10 };
    expect(pruneHistory([point], now)).to.deep.equal([]);
  });

  it("drops entries older than 48h", () => {
    const stale = { at: new Date(now.getTime() - HISTORY_MAX_AGE_MS - 1000), percent: 10 };
    const fresh = { at: new Date(now.getTime() - 1000), percent: 20 };
    expect(pruneHistory([stale, fresh], now)).to.deep.equal([fresh]);
  });

  it("invariant: never exceeds the entry cap, keeping the most recent ones", () => {
    const overflow = 10;
    const total = HISTORY_MAX_ENTRIES + overflow;
    const points = Array.from({ length: total }, (_unused, index) => ({
      at: new Date(now.getTime() - (total - index) * 1000),
      percent: index,
    }));

    const pruned = pruneHistory(points, now);

    expect(pruned).to.have.length(HISTORY_MAX_ENTRIES);
    expect(pruned[0].percent).to.equal(overflow);
    expect(pruned[pruned.length - 1].percent).to.equal(total - 1);
  });

  it("boundary: exactly the cap's worth of entries are all kept", () => {
    const points = Array.from({ length: HISTORY_MAX_ENTRIES }, (_unused, index) => ({
      at: new Date(now.getTime() - (HISTORY_MAX_ENTRIES - index) * 1000),
      percent: index,
    }));

    expect(pruneHistory(points, now)).to.have.length(HISTORY_MAX_ENTRIES);
  });
});

describe("serializeHistoryJson / parseHistoryJson", () => {
  it("round-trips a history array through JSON", () => {
    const history = [
      { at: new Date("2026-07-21T09:00:00.000Z"), percent: 10 },
      { at: new Date("2026-07-21T09:35:00.000Z"), percent: 25 },
    ];

    expect(parseHistoryJson(serializeHistoryJson(history))).to.deep.equal(history);
  });

  it("round-trips an empty history array", () => {
    expect(parseHistoryJson(serializeHistoryJson([]))).to.deep.equal([]);
  });

  it("failure: malformed (non-JSON) history string resets to an empty array instead of crashing", () => {
    expect(parseHistoryJson("not json{{{")).to.deep.equal([]);
  });

  it("failure: valid JSON that is not an array resets to an empty array", () => {
    expect(parseHistoryJson('{"not": "an array"}')).to.deep.equal([]);
  });

  it("failure: entries with the wrong shape are dropped rather than crashing the whole parse", () => {
    const raw = JSON.stringify([
      { atIso: "2026-07-21T09:00:00.000Z", percent: 10 },
      { atIso: "2026-07-21T09:35:00.000Z" }, // missing percent
      { percent: 40 }, // missing atIso
      "not an object",
      { atIso: "not-a-date", percent: 50 },
    ]);

    expect(parseHistoryJson(raw)).to.deep.equal([{ at: new Date("2026-07-21T09:00:00.000Z"), percent: 10 }]);
  });
});

describe("appendHistory", () => {
  const now = new Date("2026-07-21T09:00:00.000Z");

  it("appends the new point after the existing ones", () => {
    const existing = [{ at: new Date(now.getTime() - 1000), percent: 5 }];
    const appended = appendHistory(existing, { at: now, percent: 10 }, now);

    expect(appended).to.deep.equal([...existing, { at: now, percent: 10 }]);
  });

  it("prunes while appending, so the ring never exceeds the entry cap or 48h", () => {
    const existing = Array.from({ length: HISTORY_MAX_ENTRIES }, (_unused, index) => ({
      at: new Date(now.getTime() - (HISTORY_MAX_ENTRIES - index) * 1000),
      percent: index,
    }));

    const appended = appendHistory(existing, { at: now, percent: 100 }, now);

    expect(appended).to.have.length(HISTORY_MAX_ENTRIES);
    expect(appended[appended.length - 1]).to.deep.equal({ at: now, percent: 100 });
  });
});

describe("projectLimitHit", () => {
  const now = new Date("2026-07-21T09:00:00.000Z");
  const windowResetAt = new Date("2026-07-27T22:00:00.000Z"); // far in the future for most cases

  it("boundary: fewer than 2 points returns null", () => {
    expect(projectLimitHit([], windowResetAt, now)).to.equal(null);
    expect(projectLimitHit([{ at: now, percent: 10 }], windowResetAt, now)).to.equal(null);
  });

  it("boundary: a span of less than 30 minutes returns null", () => {
    const oldest = { at: new Date(now.getTime() - 29 * 60 * 1000), percent: 10 };
    const newest = { at: now, percent: 20 };
    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.equal(null);
  });

  it("boundary: a span of exactly 30 minutes is accepted", () => {
    const oldest = { at: new Date(now.getTime() - 30 * 60 * 1000), percent: 10 };
    const newest = { at: now, percent: 20 };
    // slope: 10 percent / 0.5h = 20 percent/h -> (100-20)/20 = 4h to 100% -> 2026-07-21T13:00:00Z,
    // well before windowResetAt.
    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.deep.equal(new Date("2026-07-21T13:00:00.000Z"));
  });

  it("returns null when the slope is flat (no change)", () => {
    const oldest = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 20 };
    const newest = { at: now, percent: 20 };
    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.equal(null);
  });

  it("returns null when the slope is negative (usage went down)", () => {
    const oldest = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 30 };
    const newest = { at: now, percent: 20 };
    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.equal(null);
  });

  it("uses the oldest and newest points, ignoring intermediate ones", () => {
    const oldest = { at: new Date(now.getTime() - 2 * 60 * 60 * 1000), percent: 0 };
    const middle = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 999 }; // would skew a naive average
    const newest = { at: now, percent: 20 };
    // slope: 20 percent / 2h = 10 percent/h -> (100-20)/10 = 8h -> 2026-07-21T17:00:00Z
    expect(projectLimitHit([oldest, middle, newest], windowResetAt, now)).to.deep.equal(
      new Date("2026-07-21T17:00:00.000Z"),
    );
  });

  it("boundary: a projection landing exactly on windowResetAt is returned, not nulled", () => {
    const oldest = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 0 };
    // slope: 50 percent/h -> (100-50)/50 = 1h to 100% -> now + 1h
    const newest = { at: now, percent: 50 };
    const resetExactlyAtProjection = new Date(now.getTime() + 60 * 60 * 1000);

    expect(projectLimitHit([oldest, newest], resetExactlyAtProjection, now)).to.deep.equal(resetExactlyAtProjection);
  });

  it("returns null when the projection lands after windowResetAt (window resets first)", () => {
    const oldest = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 0 };
    const newest = { at: now, percent: 50 };
    const resetBeforeProjection = new Date(now.getTime() + 60 * 60 * 1000 - 1000);

    expect(projectLimitHit([oldest, newest], resetBeforeProjection, now)).to.equal(null);
  });

  it("boundary: newest point already at exactly 100 percent returns null (nothing left to project)", () => {
    const oldest = { at: new Date(now.getTime() - 60 * 60 * 1000), percent: 50 };
    const newest = { at: now, percent: 100 };

    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.equal(null);
  });

  it("returns null when the newest point is already past 100 percent, even with a positive slope (would otherwise project a date in the past)", () => {
    const oldest = { at: new Date(now.getTime() - 40 * 60 * 1000), percent: 98 };
    const newest = { at: now, percent: 104 };

    expect(projectLimitHit([oldest, newest], windowResetAt, now)).to.equal(null);
  });
});
