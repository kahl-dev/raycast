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
  it("combines bucket id and threshold, without the drifting resetsAt", () => {
    const b = bucket({});
    expect(alertKey(b.id, 80)).to.equal("anthropic:weekly_scoped:fable:80");
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
    const fired = new Set([alertKey(b.id, 80)]);
    expect(determineAlertsToFire([b], fired)).to.deep.equal([{ bucket: b, threshold: 95 }]);
  });

  it("invariant: fires exactly once per bucket+threshold across repeated calls", () => {
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

    expect(next).to.deep.equal(new Set(["some:other:key:80", alertKey(b.id, 95)]));
  });
});

describe("pruneFiredKeys", () => {
  it("regression: keeps an alert key while resetsAt drifts but percent stays high", () => {
    // The core rolling-window guard: resetsAt moves every fetch, but as long as percent stays at/above
    // the threshold the alert must remain suppressed rather than re-firing each tick.
    const before = bucket({ percent: 99, resetsAt: new Date("2026-07-27T22:00:00.000Z") });
    const drifted = bucket({ percent: 99, resetsAt: new Date("2026-07-27T22:05:00.000Z") });
    const fired = new Set([alertKey(before.id, 80), alertKey(before.id, 95)]);

    expect(pruneFiredKeys(fired, [drifted])).to.deep.equal(
      new Set([alertKey(drifted.id, 80), alertKey(drifted.id, 95)]),
    );
  });

  it("re-arms (drops) an alert key once percent falls below threshold minus hysteresis", () => {
    // Fired at 95; percent has fallen to 89 (< 95 - 5), so the 95 alert re-arms while the 80 alert
    // (89 >= 80 - 5) stays suppressed.
    const b = bucket({ percent: 89 });
    const fired = new Set([alertKey(b.id, 80), alertKey(b.id, 95)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([alertKey(b.id, 80)]));
  });

  it("keeps an alert key within the hysteresis band just below the threshold", () => {
    // Fired at 80; percent slipped to 76 (>= 80 - 5) — still within the band, so it stays suppressed
    // and does not flap.
    const b = bucket({ percent: 76 });
    const fired = new Set([alertKey(b.id, 80)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([alertKey(b.id, 80)]));
  });

  it("drops keys for buckets that no longer exist at all", () => {
    const gone = bucket({ id: "anthropic:weekly_scoped:retired" });
    const fired = new Set([alertKey(gone.id, 80)]);

    expect(pruneFiredKeys(fired, [])).to.deep.equal(new Set());
  });

  it("keeps a reset key while the bucket stays empty (percent below WARNING)", () => {
    const b = bucket({ percent: 5 });
    const fired = new Set([resetEventKey(b.id)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([resetEventKey(b.id)]));
  });

  it("re-arms (drops) a reset key once percent climbs back to WARNING", () => {
    const b = bucket({ percent: 80 });
    const fired = new Set([resetEventKey(b.id)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set());
  });

  it("keeps both an alert key and a reset key side by side in the overlap band", () => {
    // percent 77 sits in the narrow band where both apply: 77 >= 80 - 5 keeps the 80 alert suppressed,
    // and 77 < 80 keeps the reset key set. Below 75 only the reset key would remain; at/above 80 only
    // the alert key.
    const b = bucket({ percent: 77 });
    const fired = new Set([alertKey(b.id, 80), resetEventKey(b.id)]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set([alertKey(b.id, 80), resetEventKey(b.id)]));
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
    expect(resetEventKey("anthropic:weekly_scoped:fable")).to.equal("reset:anthropic:weekly_scoped:fable");
  });
});

describe("determineResetEvents", () => {
  it("fires when a bucket that was >=80 percent drops back to meaningful headroom", () => {
    const previous = bucket({ percent: 85 });
    const current = bucket({ percent: 5 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("boundary: fires at exactly 80 percent previously (the WARNING_THRESHOLD)", () => {
    const previous = bucket({ percent: 80 });
    const current = bucket({ percent: 5 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("does not fire when the previous percent was below 80", () => {
    const previous = bucket({ percent: 79 });
    const current = bucket({ percent: 5 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("does not fire when percent stays high (no real headroom returned, only resetsAt drift)", () => {
    const previous = bucket({ percent: 90, resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const current = bucket({ percent: 91, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("boundary: does not fire when current percent sits exactly at WARNING minus hysteresis", () => {
    const previous = bucket({ percent: 90 });
    const current = bucket({ percent: 75 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("boundary: fires when current percent is one point inside the hysteresis band", () => {
    const previous = bucket({ percent: 90 });
    const current = bucket({ percent: 74 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("does not fire for a bucket with no previous entry (first-ever load)", () => {
    const current = bucket({ percent: 5 });

    expect(determineResetEvents([], [current])).to.deep.equal([]);
  });

  it("does not fire for a bucket that disappeared (no current entry)", () => {
    const previous = bucket({ percent: 90 });

    expect(determineResetEvents([previous], [])).to.deep.equal([]);
  });

  it("matches previous and current buckets by id only, across otherwise different providers/labels", () => {
    const previous = bucket({ id: "openai:primary", provider: "openai", percent: 100 });
    const current = bucket({ id: "openai:primary", provider: "openai", percent: 0 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });
});

describe("markResetEventsFired", () => {
  it("adds reset-prefixed keys without dropping existing ones", () => {
    const current = bucket({});
    const existing = new Set(["some:other:key:80"]);

    const next = markResetEventsFired(existing, [{ bucket: current }]);

    expect(next).to.deep.equal(new Set(["some:other:key:80", resetEventKey(current.id)]));
  });
});

describe("formatResetMessage", () => {
  it("matches the German reset wording", () => {
    const b = bucket({ label: "Fable" });
    expect(formatResetMessage(b)).to.equal("Fable-Limit resettet — wieder verfügbar");
  });
});
