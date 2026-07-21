import { describe, it, expect } from "vitest";
import { fetchAnthropicUsage, isWithinAnthropicCooldown, loadAnthropicBuckets, parseAnthropicUsage } from "./anthropic";
import { Bucket, FetchFunction } from "./types";
import anthropicFixture from "./__fixtures__/anthropic-usage.json";
import { jsonResponse, malformedJsonResponse } from "./__fixtures__/response";

describe("parseAnthropicUsage", () => {
  it("renders limits[] generically, ignoring is_active (verified fixture has is_active:false on shown buckets)", () => {
    const buckets = parseAnthropicUsage(anthropicFixture);

    expect(buckets).to.have.length(3);
    expect(buckets.map((b) => b.id)).to.deep.equal([
      "anthropic:session",
      "anthropic:weekly_all",
      "anthropic:weekly_scoped:fable",
    ]);
    expect(buckets.map((b) => b.label)).to.deep.equal(["Session", "Woche", "Fable"]);
    expect(buckets.map((b) => b.percent)).to.deep.equal([23, 5, 8]);
    expect(buckets[1].resetsAt.toISOString()).to.equal("2026-07-27T19:59:59.982Z");
    expect(buckets.map((b) => b.windowSeconds)).to.deep.equal([18000, 604800, 604800]);
  });

  it("boundary: empty limits[] returns no buckets (does not fall back to legacy)", () => {
    expect(
      parseAnthropicUsage({ limits: [], five_hour: { utilization: 1, resets_at: "2026-01-01T00:00:00Z" } }),
    ).to.deep.equal([]);
  });

  it("boundary: falls back to five_hour/seven_day only when limits[] is entirely missing", () => {
    const buckets = parseAnthropicUsage({
      five_hour: { utilization: 12, resets_at: "2026-01-01T00:00:00.000Z" },
      seven_day: { utilization: 34, resets_at: "2026-01-08T00:00:00.000Z" },
    });

    expect(buckets).to.deep.equal([
      {
        id: "anthropic:session",
        provider: "anthropic",
        label: "Session",
        percent: 12,
        resetsAt: new Date("2026-01-01T00:00:00.000Z"),
        windowSeconds: 18000,
      },
      {
        id: "anthropic:weekly_all",
        provider: "anthropic",
        label: "Woche",
        percent: 34,
        resetsAt: new Date("2026-01-08T00:00:00.000Z"),
        windowSeconds: 604800,
      },
    ]);
  });

  it("boundary: legacy fallback also applies when limits is explicitly null", () => {
    const buckets = parseAnthropicUsage({
      limits: null,
      five_hour: { utilization: 5, resets_at: "2026-01-01T00:00:00.000Z" },
      seven_day: null,
    });

    expect(buckets).to.have.length(1);
    expect(buckets[0].id).to.equal("anthropic:session");
  });

  it("boundary: weekly_scoped with scope:null falls back to a generic id and label", () => {
    const buckets = parseAnthropicUsage({
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 10,
          severity: "normal",
          resets_at: "2026-01-08T00:00:00.000Z",
          scope: null,
          is_active: false,
        },
      ],
    });

    expect(buckets).to.have.length(1);
    expect(buckets[0].id).to.equal("anthropic:weekly_scoped:unknown");
    expect(buckets[0].label).to.equal("Woche (Modell)");
  });

  it("boundary: an unknown future kind still renders generically instead of being dropped", () => {
    const buckets = parseAnthropicUsage({
      limits: [
        {
          kind: "five_hour_burst",
          group: "session",
          percent: 50,
          severity: "normal",
          resets_at: "2026-01-01T00:00:00.000Z",
          scope: null,
          is_active: true,
        },
      ],
    });

    expect(buckets[0].id).to.equal("anthropic:five_hour_burst");
    expect(buckets[0].label).to.equal("Five Hour Burst");
  });

  it("boundary: windowSeconds is 18000 for kind session, 604800 for the weekly group, and 18000 for an unknown kind in the session group", () => {
    const makeLimit = (kind: string, group: string) => ({
      kind,
      group,
      percent: 10,
      severity: "normal",
      resets_at: "2026-01-01T00:00:00.000Z",
      scope: null,
      is_active: true,
    });

    expect(parseAnthropicUsage({ limits: [makeLimit("session", "session")] })[0].windowSeconds).to.equal(18000);
    expect(parseAnthropicUsage({ limits: [makeLimit("weekly_all", "weekly")] })[0].windowSeconds).to.equal(604800);
    expect(parseAnthropicUsage({ limits: [makeLimit("weekly_scoped", "weekly")] })[0].windowSeconds).to.equal(604800);
    expect(parseAnthropicUsage({ limits: [makeLimit("five_hour_burst", "session")] })[0].windowSeconds).to.equal(18000);
  });

  it("boundary: percent 0, 100, and above 100 are all accepted without clamping", () => {
    const makeLimit = (percent: number) => ({
      kind: "session",
      group: "session",
      percent,
      severity: "normal",
      resets_at: "2026-01-01T00:00:00.000Z",
      scope: null,
      is_active: true,
    });

    expect(parseAnthropicUsage({ limits: [makeLimit(0)] })[0].percent).to.equal(0);
    expect(parseAnthropicUsage({ limits: [makeLimit(100)] })[0].percent).to.equal(100);
    expect(parseAnthropicUsage({ limits: [makeLimit(140)] })[0].percent).to.equal(140);
  });

  it("failure: throws a descriptive error when a limit has a non-numeric percent", () => {
    expect(() =>
      parseAnthropicUsage({
        limits: [
          {
            kind: "session",
            percent: "high",
            resets_at: "2026-01-01T00:00:00.000Z",
            scope: null,
          },
        ],
      }),
    ).to.throw(/percent/);
  });

  it("failure: throws a descriptive error when a limit has an invalid resets_at", () => {
    expect(() =>
      parseAnthropicUsage({
        limits: [{ kind: "session", percent: 10, resets_at: "not-a-date", scope: null }],
      }),
    ).to.throw(/resets_at/);
  });

  it("failure: throws when limits is present but not an array", () => {
    expect(() => parseAnthropicUsage({ limits: "nope" })).to.throw();
  });

  it("failure: throws when the response body is not an object", () => {
    expect(() => parseAnthropicUsage("nope")).to.throw();
    expect(() => parseAnthropicUsage(null)).to.throw();
  });
});

describe("fetchAnthropicUsage", () => {
  it("resolves with parsed buckets on a 200 response", async () => {
    const fetchImplementation: FetchFunction = async () => jsonResponse(200, anthropicFixture);

    const buckets = await fetchAnthropicUsage("token-123", fetchImplementation);

    expect(buckets).to.have.length(3);
  });

  it("rejects with the status code on a 429 response", async () => {
    const fetchImplementation: FetchFunction = async () => jsonResponse(429, { error: "rate_limited" });

    await expect(fetchAnthropicUsage("token-123", fetchImplementation)).rejects.toThrow(/429/);
  });

  it("rejects when the network call itself fails", async () => {
    const fetchImplementation: FetchFunction = async () => {
      throw new Error("getaddrinfo ENOTFOUND api.anthropic.com");
    };

    await expect(fetchAnthropicUsage("token-123", fetchImplementation)).rejects.toThrow(/ENOTFOUND/);
  });

  it("rejects when the response body is not valid JSON", async () => {
    const fetchImplementation: FetchFunction = async () => malformedJsonResponse(200);

    await expect(fetchAnthropicUsage("token-123", fetchImplementation)).rejects.toThrow(/kein valides JSON/);
  });
});

describe("isWithinAnthropicCooldown", () => {
  it("is false when there has never been an attempt", () => {
    expect(isWithinAnthropicCooldown(null, new Date())).to.equal(false);
  });

  it("boundary: true at 59999ms elapsed (just under 60s)", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 59_999);
    expect(isWithinAnthropicCooldown(lastAttemptAt, now)).to.equal(true);
  });

  it("boundary: false at exactly 60000ms elapsed", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 60_000);
    expect(isWithinAnthropicCooldown(lastAttemptAt, now)).to.equal(false);
  });
});

describe("loadAnthropicBuckets", () => {
  const now = new Date("2026-07-21T09:00:00.000Z");
  const lastGoodBuckets: Bucket[] = [
    {
      id: "anthropic:session",
      provider: "anthropic",
      label: "Session",
      percent: 11,
      resetsAt: new Date("2026-07-21T09:00:00.000Z"),
      windowSeconds: 18000,
    },
  ];

  it("skips the network call within the cooldown and returns last-good", async () => {
    let fetchCalled = false;
    const result = await loadAnthropicBuckets({
      now: () => now,
      lastAttemptAt: new Date(now.getTime() - 1000),
      lastGoodBuckets,
      readToken: async () => "token",
      fetchImplementation: async () => {
        fetchCalled = true;
        return jsonResponse(200, anthropicFixture);
      },
    });

    expect(fetchCalled).to.equal(false);
    expect(result).to.deep.equal({ buckets: lastGoodBuckets, attempted: false, error: null });
  });

  it("attempts and returns fresh buckets on success", async () => {
    const result = await loadAnthropicBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastGoodBuckets: null,
      readToken: async () => "token",
      fetchImplementation: async () => jsonResponse(200, anthropicFixture),
    });

    expect(result.attempted).to.equal(true);
    expect(result.error).to.equal(null);
    expect(result.buckets).to.have.length(3);
  });

  it("invariant: last-good survives a token read failure, attempted is still true", async () => {
    const result = await loadAnthropicBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastGoodBuckets,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      fetchImplementation: async () => jsonResponse(200, anthropicFixture),
    });

    expect(result.attempted).to.equal(true);
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.error).to.be.instanceOf(Error);
  });

  it("invariant: last-good survives a fetch failure (e.g. 429), attempted is still true", async () => {
    const result = await loadAnthropicBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastGoodBuckets,
      readToken: async () => "token",
      fetchImplementation: async () => jsonResponse(429, {}),
    });

    expect(result.attempted).to.equal(true);
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.error).to.be.instanceOf(Error);
  });
});
