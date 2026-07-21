import { describe, it, expect } from "vitest";
import {
  ALERT_THRESHOLDS,
  alertKey,
  determineAlertsToFire,
  determineResetEvents,
  formatAlertMessage,
  formatResetMessage,
  markAlertsFired,
  markResetEventsFired,
  pruneFiredKeys,
  resetEventKey,
} from "./thresholds";
import { bucket as baseBucket } from "./__fixtures__/bucket";
import { Bucket } from "./types";

function bucket(overrides: Partial<Bucket>): Bucket {
  return baseBucket({
    id: "anthropic:weekly_scoped:fable",
    label: "Fable",
    percent: 82,
    resetsAt: new Date("2026-07-27T22:00:00.000Z"),
    ...overrides,
  });
}

describe("ALERT_THRESHOLDS", () => {
  it("is exactly 80 and 95", () => {
    expect(ALERT_THRESHOLDS).to.deep.equal([80, 95]);
  });
});

describe("alertKey", () => {
  it("combines bucket id, ISO reset timestamp, and threshold", () => {
    const b = bucket({});
    expect(alertKey(b, 80)).to.equal("anthropic:weekly_scoped:fable:2026-07-27T22:00:00.000Z:80");
  });
});

describe("determineAlertsToFire", () => {
  it("fires the 80 threshold when percent is exactly 80 and not yet fired", () => {
    const b = bucket({ percent: 80 });
    const alerts = determineAlertsToFire([b], new Set());
    expect(alerts).to.deep.equal([{ bucket: b, threshold: 80 }]);
  });

  it("does not fire below 80", () => {
    const b = bucket({ percent: 79 });
    expect(determineAlertsToFire([b], new Set())).to.deep.equal([]);
  });

  it("fires both 80 and 95 when percent is exactly 95", () => {
    const b = bucket({ percent: 95 });
    const alerts = determineAlertsToFire([b], new Set());
    expect(alerts).to.deep.equal([
      { bucket: b, threshold: 80 },
      { bucket: b, threshold: 95 },
    ]);
  });

  it("skips a threshold already present in firedKeys", () => {
    const b = bucket({ percent: 95 });
    const fired = new Set([alertKey(b, 80)]);
    expect(determineAlertsToFire([b], fired)).to.deep.equal([{ bucket: b, threshold: 95 }]);
  });

  it("invariant: fires exactly once per bucket+window+threshold across repeated calls", () => {
    const b = bucket({ percent: 82 });
    const firstRun = determineAlertsToFire([b], new Set());
    const firedAfterFirst = markAlertsFired(new Set(), firstRun);

    const secondRun = determineAlertsToFire([b], firedAfterFirst);

    expect(firstRun).to.deep.equal([{ bucket: b, threshold: 80 }]);
    expect(secondRun).to.deep.equal([]);
  });
});

describe("markAlertsFired", () => {
  it("adds new keys without dropping existing ones", () => {
    const b = bucket({ percent: 95 });
    const existing = new Set(["some:other:key:80"]);

    const next = markAlertsFired(existing, [{ bucket: b, threshold: 95 }]);

    expect(next).to.deep.equal(new Set(["some:other:key:80", alertKey(b, 95)]));
  });
});

describe("pruneFiredKeys", () => {
  it("keeps a key when the bucket window (resetsAt) is unchanged", () => {
    const b = bucket({});
    const fired = new Set([alertKey(b, 80)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([alertKey(b, 80)]));
  });

  it("self-prunes a key once the window resets (resetsAt changes)", () => {
    const staleBucket = bucket({ resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const freshBucket = bucket({ resetsAt: new Date("2026-07-27T22:00:00.000Z") });
    const fired = new Set([alertKey(staleBucket, 80), alertKey(staleBucket, 95)]);

    expect(pruneFiredKeys(fired, [freshBucket])).to.deep.equal(new Set());
  });

  it("drops keys for buckets that no longer exist at all", () => {
    const gone = bucket({ id: "anthropic:weekly_scoped:retired" });
    const fired = new Set([alertKey(gone, 80)]);

    expect(pruneFiredKeys(fired, [])).to.deep.equal(new Set());
  });

  it("tolerates reset: prefixed keys: keeps one when the bucket's resetsAt still matches", () => {
    const b = bucket({});
    const fired = new Set([resetEventKey(b.id, b.resetsAt.toISOString())]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([resetEventKey(b.id, b.resetsAt.toISOString())]));
  });

  it("self-prunes a reset: prefixed key once the bucket resets again (resetsAt changes)", () => {
    const staleBucket = bucket({ resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const freshBucket = bucket({ resetsAt: new Date("2026-07-27T22:00:00.000Z") });
    const fired = new Set([resetEventKey(staleBucket.id, staleBucket.resetsAt.toISOString())]);

    expect(pruneFiredKeys(fired, [freshBucket])).to.deep.equal(new Set());
  });

  it("keeps both an alert key and a reset key for the same bucket+window side by side", () => {
    const b = bucket({ percent: 82 });
    const fired = new Set([alertKey(b, 80), resetEventKey(b.id, b.resetsAt.toISOString())]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(fired);
  });
});

describe("formatAlertMessage", () => {
  it("matches the German alert wording with label, rounded percent, and reset time", () => {
    const b = bucket({ label: "Fable", percent: 82.4, resetsAt: new Date(2026, 6, 27, 22, 0) });
    const now = new Date(2026, 6, 21, 8, 0);

    expect(formatAlertMessage(b, 80, now)).to.equal("Fable-Limit bei 82% — Reset Mo 22:00 (in 6d 14h)");
  });
});

describe("resetEventKey", () => {
  it("uses a distinct reset: prefix, distinguishing it from alertKey", () => {
    expect(resetEventKey("anthropic:weekly_scoped:fable", "2026-07-27T22:00:00.000Z")).to.equal(
      "reset:anthropic:weekly_scoped:fable:2026-07-27T22:00:00.000Z",
    );
  });
});

describe("determineResetEvents", () => {
  it("fires when a bucket that was >=80 percent gets a new resetsAt", () => {
    const previous = bucket({ percent: 85, resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const current = bucket({ percent: 5, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("boundary: fires at exactly 80 percent (the WARNING_THRESHOLD)", () => {
    const previous = bucket({ percent: 80, resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const current = bucket({ percent: 5, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("does not fire when the previous percent was below 80", () => {
    const previous = bucket({ percent: 79, resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const current = bucket({ percent: 5, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("does not fire when resetsAt is unchanged", () => {
    const sameResetsAt = new Date("2026-07-20T22:00:00.000Z");
    const previous = bucket({ percent: 90, resetsAt: sameResetsAt });
    const current = bucket({ percent: 91, resetsAt: sameResetsAt });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("does not fire for a bucket with no previous entry (first-ever load)", () => {
    const current = bucket({ percent: 90, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([], [current])).to.deep.equal([]);
  });

  it("does not fire for a bucket that disappeared (no current entry)", () => {
    const previous = bucket({ percent: 90, resetsAt: new Date("2026-07-20T22:00:00.000Z") });

    expect(determineResetEvents([previous], [])).to.deep.equal([]);
  });

  it("matches previous and current buckets by id only, across otherwise different providers/labels", () => {
    const previous = bucket({
      id: "openai:primary",
      provider: "openai",
      percent: 100,
      resetsAt: new Date("2026-07-20T22:00:00.000Z"),
    });
    const current = bucket({
      id: "openai:primary",
      provider: "openai",
      percent: 0,
      resetsAt: new Date("2026-07-27T22:00:00.000Z"),
    });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });
});

describe("markResetEventsFired", () => {
  it("adds reset-prefixed keys without dropping existing ones", () => {
    const current = bucket({ resetsAt: new Date("2026-07-27T22:00:00.000Z") });
    const existing = new Set(["some:other:key:80"]);

    const next = markResetEventsFired(existing, [{ bucket: current }]);

    expect(next).to.deep.equal(
      new Set(["some:other:key:80", resetEventKey(current.id, current.resetsAt.toISOString())]),
    );
  });
});

describe("formatResetMessage", () => {
  it("matches the German reset wording", () => {
    const b = bucket({ label: "Fable" });
    expect(formatResetMessage(b)).to.equal("Fable-Limit resettet — wieder verfügbar");
  });
});
