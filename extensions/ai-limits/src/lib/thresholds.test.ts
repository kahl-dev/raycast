import { describe, it, expect } from "vitest";
import {
  ALERT_THRESHOLDS,
  alertKey,
  determineAlertsToFire,
  determineResetEvents,
  formatAlertMessage,
  formatResetMessage,
  markAlertsFired,
  pruneFiredKeys,
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

  it("drops a stale key left over from an older key format", () => {
    // Reset events no longer use firedAlertKeys at all (they are derived from a percent drop, which
    // cannot repeat for the same reset). Any leftover reset: key from an older build is simply not
    // retained, because it matches no alert key of any current bucket.
    const b = bucket({ percent: 5 });
    const fired = new Set(["reset:" + b.id]);

    expect(pruneFiredKeys(fired, [b])).to.deep.equal(new Set());
  });
});

describe("formatAlertMessage", () => {
  it("matches the German alert wording with label, rounded percent, and reset time", () => {
    const b = bucket({ label: "Fable", percent: 82.4, resetsAt: new Date(2026, 6, 27, 22, 0) });
    const now = new Date(2026, 6, 21, 8, 0);

    expect(formatAlertMessage(b, 80, now)).to.equal("Fable-Limit bei 82% — Reset Mo 22:00 (in 6d 14h)");
  });
});

describe("determineResetEvents", () => {
  it("fires on a full window rollover", () => {
    const previous = bucket({ percent: 100 });
    const current = bucket({ percent: 6 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("feature: fires on a mid-window reset granted well below the warning threshold", () => {
    // The case the old previous>=80 rule silently swallowed: Anthropic hands out a goodwill reset
    // while usage sits at 50%, which is exactly the event worth being told about.
    const previous = bucket({ percent: 50 });
    const current = bucket({ percent: 0 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("boundary: fires at exactly the 10-point drop", () => {
    const previous = bucket({ percent: 30 });
    const current = bucket({ percent: 20 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([{ bucket: current }]);
  });

  it("boundary: stays silent one point short of the drop threshold", () => {
    const previous = bucket({ percent: 30 });
    const current = bucket({ percent: 21 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("does not fire while usage climbs", () => {
    const previous = bucket({ percent: 90 });
    const current = bucket({ percent: 91 });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("does not fire on an unchanged percent, even when resetsAt drifts", () => {
    const previous = bucket({ percent: 90, resetsAt: new Date("2026-07-20T22:00:00.000Z") });
    const current = bucket({ percent: 90, resetsAt: new Date("2026-07-27T22:00:00.000Z") });

    expect(determineResetEvents([previous], [current])).to.deep.equal([]);
  });

  it("invariant: the same reset cannot fire twice, because the post-reset value becomes the baseline", () => {
    const beforeReset = bucket({ percent: 100 });
    const afterReset = bucket({ percent: 6 });

    expect(determineResetEvents([beforeReset], [afterReset])).to.have.length(1);
    // Next tick compares the already-reset value against the next observation — no second drop.
    expect(determineResetEvents([afterReset], [bucket({ percent: 8 })])).to.deep.equal([]);
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

describe("formatResetMessage", () => {
  it("matches the German reset wording", () => {
    const b = bucket({ label: "Fable" });
    expect(formatResetMessage(b)).to.equal("Fable-Limit resettet — wieder verfügbar");
  });
});
