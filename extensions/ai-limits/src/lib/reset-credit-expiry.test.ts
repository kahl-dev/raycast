import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetCreditEntry } from "./__fixtures__/report";
import {
  determineExpiryWarnings,
  EXPIRY_WARNING_SECONDS,
  formatExpiryWarningMessage,
  pruneExpiryWarningIds,
} from "./reset-credit-expiry";

// The expiry instants are real UTC timestamps; their local calendar day ("22 Oct") holds in the
// user's zone but not east of UTC+3:28, so the zone is pinned for the date-formatting assertions.
// Node re-reads TZ whenever process.env.TZ is assigned.
beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Berlin");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const EXPIRES_AT = new Date("2026-10-22T20:31:07.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function before(milliseconds: number): Date {
  return new Date(EXPIRES_AT.getTime() - milliseconds);
}

describe("EXPIRY_WARNING_SECONDS", () => {
  it("is exactly three days", () => {
    expect(EXPIRY_WARNING_SECONDS).to.equal(259200);
  });
});

describe("determineExpiryWarnings", () => {
  it("warns about nothing four days before expiry", () => {
    expect(determineExpiryWarnings([resetCreditEntry()], new Set(), before(4 * DAY_MS))).to.deep.equal([]);
  });

  it("warns about nothing at exactly 72 hours before expiry (strictly less than three days)", () => {
    expect(determineExpiryWarnings([resetCreditEntry()], new Set(), before(3 * DAY_MS))).to.deep.equal([]);
  });

  it("warns exactly once one millisecond inside the 72-hour window", () => {
    expect(determineExpiryWarnings([resetCreditEntry()], new Set(), before(3 * DAY_MS - 1))).to.deep.equal([
      { id: "RateLimitResetCredit_6ebf262083f08191adacb227e3b1b96b", expiresAt: EXPIRES_AT },
    ]);
  });

  it("warns exactly once two days before expiry", () => {
    expect(determineExpiryWarnings([resetCreditEntry()], new Set(), before(2 * DAY_MS))).to.deep.equal([
      { id: "RateLimitResetCredit_6ebf262083f08191adacb227e3b1b96b", expiresAt: EXPIRES_AT },
    ]);
  });

  it("does not warn again for an id that already fired", () => {
    const fired = new Set(["RateLimitResetCredit_6ebf262083f08191adacb227e3b1b96b"]);
    expect(determineExpiryWarnings([resetCreditEntry()], fired, before(2 * DAY_MS))).to.deep.equal([]);
  });

  it("never warns about a credit without expires_at", () => {
    expect(
      determineExpiryWarnings([resetCreditEntry({ expiresAt: null })], new Set(), before(2 * DAY_MS)),
    ).to.deep.equal([]);
  });

  it("does not warn about a credit that already expired", () => {
    expect(
      determineExpiryWarnings([resetCreditEntry()], new Set(), new Date(EXPIRES_AT.getTime() + HOUR_MS)),
    ).to.deep.equal([]);
  });

  it("does not warn at the exact expiry instant", () => {
    expect(determineExpiryWarnings([resetCreditEntry()], new Set(), EXPIRES_AT)).to.deep.equal([]);
  });

  it("does not warn about a credit that is no longer available", () => {
    expect(
      determineExpiryWarnings([resetCreditEntry({ status: "redeemed" })], new Set(), before(2 * DAY_MS)),
    ).to.deep.equal([]);
  });

  it("warns only once for a credit id listed twice in the same report", () => {
    const entries = [resetCreditEntry({ id: "twice" }), resetCreditEntry({ id: "twice" })];
    expect(determineExpiryWarnings(entries, new Set(), before(DAY_MS))).to.deep.equal([
      { id: "twice", expiresAt: EXPIRES_AT },
    ]);
  });

  it("warns once per expiring credit when several expire, skipping the ones outside the window", () => {
    const entries = [
      resetCreditEntry({ id: "soon-a" }),
      resetCreditEntry({ id: "later", expiresAt: new Date(EXPIRES_AT.getTime() + 5 * DAY_MS) }),
      resetCreditEntry({ id: "soon-b" }),
    ];
    expect(determineExpiryWarnings(entries, new Set(), before(DAY_MS))).to.deep.equal([
      { id: "soon-a", expiresAt: EXPIRES_AT },
      { id: "soon-b", expiresAt: EXPIRES_AT },
    ]);
  });
});

describe("pruneExpiryWarningIds", () => {
  it("keeps the id of a credit that is still listed and available", () => {
    const fired = new Set(["a"]);
    expect([...pruneExpiryWarningIds(fired, [resetCreditEntry({ id: "a" })])]).to.deep.equal(["a"]);
  });

  it("removes the id of a credit that disappeared from the list", () => {
    const fired = new Set(["a", "b"]);
    expect([...pruneExpiryWarningIds(fired, [resetCreditEntry({ id: "b" })])]).to.deep.equal(["b"]);
  });

  it("removes every id when the list is known empty", () => {
    expect([...pruneExpiryWarningIds(new Set(["a"]), [])]).to.deep.equal([]);
  });

  it("removes the id of a credit that is still listed but no longer available", () => {
    const fired = new Set(["a"]);
    expect([...pruneExpiryWarningIds(fired, [resetCreditEntry({ id: "a", status: "redeemed" })])]).to.deep.equal([]);
  });

  it("does not mutate the set it was given", () => {
    const fired = new Set(["a"]);
    pruneExpiryWarningIds(fired, []);
    expect([...fired]).to.deep.equal(["a"]);
  });
});

describe("formatExpiryWarningMessage", () => {
  it("names the remaining time and the local expiry date", () => {
    const warning = { id: "a", expiresAt: EXPIRES_AT };
    expect(formatExpiryWarningMessage(warning, before(2 * DAY_MS))).to.equal(
      "Codex reset credit expires in 2d 0h (22 Oct)",
    );
  });

  it("switches to hours and minutes inside the last day", () => {
    const warning = { id: "a", expiresAt: EXPIRES_AT };
    expect(formatExpiryWarningMessage(warning, before(5 * HOUR_MS + 30 * 60 * 1000))).to.equal(
      "Codex reset credit expires in 5h 30m (22 Oct)",
    );
  });
});
