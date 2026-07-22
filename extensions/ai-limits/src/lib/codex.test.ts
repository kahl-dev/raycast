import { describe, it, expect } from "vitest";
import {
  fetchCodexUsage,
  isCodexUnauthorizedError,
  isWithinCodexCooldown,
  loadCodexBuckets,
  parseCodexResetCreditsAvailable,
  parseCodexUsage,
  readCodexAuth,
  runCodexLoginStatus,
  shouldAttemptCodexLogin,
  shouldShowRedeemHint,
} from "./codex";
import { Bucket, FetchFunction } from "./types";
import { bucket } from "./__fixtures__/bucket";
import codexFixture from "./__fixtures__/codex-usage.json";
import { fakeExecFile, fakeExecFileFails } from "./__fixtures__/exec";
import { jsonResponse, malformedJsonResponse } from "./__fixtures__/response";

describe("parseCodexUsage", () => {
  it("renders the primary window from the fixture and skips the null secondary window", () => {
    const buckets = parseCodexUsage(codexFixture);

    expect(buckets).to.deep.equal([
      {
        id: "openai:primary",
        provider: "openai",
        label: "OpenAI",
        percent: 100,
        resetsAt: new Date(1785141574 * 1000),
        windowSeconds: 604800,
      },
    ]);
  });

  it("boundary: renders both windows when secondary is present", () => {
    const buckets = parseCodexUsage({
      rate_limit: {
        primary_window: { used_percent: 10, reset_at: 1785141574, limit_window_seconds: 604800 },
        secondary_window: { used_percent: 20, reset_at: 1785141600, limit_window_seconds: 18000 },
      },
    });

    expect(buckets.map((b) => b.id)).to.deep.equal(["openai:primary", "openai:secondary"]);
    expect(buckets.map((b) => b.windowSeconds)).to.deep.equal([604800, 18000]);
  });

  it("boundary: used_percent of 0, 100, and above 100 are all accepted", () => {
    const makeBody = (used_percent: number) => ({
      rate_limit: {
        primary_window: { used_percent, reset_at: 1785141574, limit_window_seconds: 604800 },
        secondary_window: null,
      },
    });

    expect(parseCodexUsage(makeBody(0))[0].percent).to.equal(0);
    expect(parseCodexUsage(makeBody(100))[0].percent).to.equal(100);
    expect(parseCodexUsage(makeBody(130))[0].percent).to.equal(130);
  });

  it("failure: throws when rate_limit is missing", () => {
    expect(() => parseCodexUsage({})).to.throw(/rate_limit/);
  });

  it("failure: throws when used_percent is not numeric", () => {
    expect(() =>
      parseCodexUsage({
        rate_limit: {
          primary_window: { used_percent: "high", reset_at: 1, limit_window_seconds: 604800 },
          secondary_window: null,
        },
      }),
    ).to.throw(/used_percent/);
  });

  it("failure: throws when reset_at is not numeric", () => {
    expect(() =>
      parseCodexUsage({
        rate_limit: {
          primary_window: { used_percent: 10, reset_at: "later", limit_window_seconds: 604800 },
          secondary_window: null,
        },
      }),
    ).to.throw(/reset_at/);
  });

  it("boundary: windowSeconds validation — throws when limit_window_seconds is not numeric", () => {
    expect(() =>
      parseCodexUsage({
        rate_limit: {
          primary_window: { used_percent: 10, reset_at: 1785141574, limit_window_seconds: "1 week" },
          secondary_window: null,
        },
      }),
    ).to.throw(/limit_window_seconds/);
  });

  it("boundary: windowSeconds validation — throws when limit_window_seconds is missing", () => {
    expect(() =>
      parseCodexUsage({
        rate_limit: {
          primary_window: { used_percent: 10, reset_at: 1785141574 },
          secondary_window: null,
        },
      }),
    ).to.throw(/limit_window_seconds/);
  });

  it("failure: throws when the response body is not an object", () => {
    expect(() => parseCodexUsage(null)).to.throw();
  });
});

describe("parseCodexResetCreditsAvailable", () => {
  it("failure: absent rate_limit_reset_credits does not crash, returns null", () => {
    expect(parseCodexResetCreditsAvailable({})).to.equal(null);
  });

  it("returns null when rate_limit_reset_credits is explicitly null", () => {
    expect(parseCodexResetCreditsAvailable({ rate_limit_reset_credits: null })).to.equal(null);
  });

  it("returns null when available_count is explicitly null", () => {
    expect(parseCodexResetCreditsAvailable({ rate_limit_reset_credits: { available_count: null } })).to.equal(null);
  });

  it("returns the available_count when present", () => {
    expect(parseCodexResetCreditsAvailable({ rate_limit_reset_credits: { available_count: 3 } })).to.equal(3);
  });

  it("boundary: available_count of 0 is returned as 0, not treated as absent", () => {
    expect(parseCodexResetCreditsAvailable({ rate_limit_reset_credits: { available_count: 0 } })).to.equal(0);
  });

  it("failure: throws when available_count is present but not numeric", () => {
    expect(() => parseCodexResetCreditsAvailable({ rate_limit_reset_credits: { available_count: "three" } })).to.throw(
      /available_count/,
    );
  });
});

describe("shouldShowRedeemHint", () => {
  it("is true at exactly 100 percent", () => {
    expect(shouldShowRedeemHint(bucket({ percent: 100 }))).to.equal(true);
  });

  it("is true for a fractional percent just above 100 (rounds to 100% in the UI, strict equality would miss it)", () => {
    expect(shouldShowRedeemHint(bucket({ percent: 100.4 }))).to.equal(true);
  });

  it("is true above 100 (Codex used_percent can exceed 100, see codex.test.ts parseCodexUsage fixture)", () => {
    expect(shouldShowRedeemHint(bucket({ percent: 130 }))).to.equal(true);
  });

  it("is false for a fractional percent just below 100", () => {
    expect(shouldShowRedeemHint(bucket({ percent: 99.6 }))).to.equal(false);
  });

  it("is false when there is no primary Codex bucket", () => {
    expect(shouldShowRedeemHint(null)).to.equal(false);
  });
});

describe("readCodexAuth", () => {
  it("extracts accessToken and accountId from a valid auth.json", async () => {
    const auth = await readCodexAuth(async () =>
      JSON.stringify({ tokens: { access_token: "codex-token", account_id: "acct-1" } }),
    );

    expect(auth).to.deep.equal({ accessToken: "codex-token", accountId: "acct-1" });
  });

  it("rejects when the file cannot be read (missing auth.json)", async () => {
    await expect(
      readCodexAuth(async () => {
        throw new Error("ENOENT: no such file or directory");
      }),
    ).rejects.toThrow(/nicht lesbar/);
  });

  it("rejects when the file is not valid JSON", async () => {
    await expect(readCodexAuth(async () => "not json{{{")).rejects.toThrow(/kein valides JSON/);
  });

  it("rejects when access_token is missing", async () => {
    await expect(readCodexAuth(async () => JSON.stringify({ tokens: { account_id: "acct-1" } }))).rejects.toThrow(
      /access_token/,
    );
  });

  it("rejects when account_id is missing", async () => {
    await expect(
      readCodexAuth(async () => JSON.stringify({ tokens: { access_token: "codex-token" } })),
    ).rejects.toThrow(/account_id/);
  });
});

describe("fetchCodexUsage", () => {
  const auth = { accessToken: "codex-token", accountId: "acct-1" };

  it("resolves with parsed buckets and resetCreditsAvailable on a 200 response", async () => {
    const fetchImplementation: FetchFunction = async () => jsonResponse(200, codexFixture);

    const result = await fetchCodexUsage(auth, fetchImplementation);

    expect(result.buckets).to.have.length(1);
    expect(result.resetCreditsAvailable).to.equal(null);
  });

  it("resolves with resetCreditsAvailable populated when the response includes it", async () => {
    const bodyWithResetCredits = { ...codexFixture, rate_limit_reset_credits: { available_count: 2 } };
    const fetchImplementation: FetchFunction = async () => jsonResponse(200, bodyWithResetCredits);

    const result = await fetchCodexUsage(auth, fetchImplementation);

    expect(result.resetCreditsAvailable).to.equal(2);
  });

  it("throws a tagged unauthorized error on 401 (token_expired)", async () => {
    const fetchImplementation: FetchFunction = async () => jsonResponse(401, { error: "token_expired" });

    await expect(fetchCodexUsage(auth, fetchImplementation)).rejects.toSatisfy((error: unknown) =>
      isCodexUnauthorizedError(error),
    );
  });

  it("rejects with the status code on other non-ok responses", async () => {
    const fetchImplementation: FetchFunction = async () => jsonResponse(500, {});

    await expect(fetchCodexUsage(auth, fetchImplementation)).rejects.toThrow(/500/);
  });

  it("rejects when the network call itself fails", async () => {
    const fetchImplementation: FetchFunction = async () => {
      throw new Error("getaddrinfo ENOTFOUND chatgpt.com");
    };

    await expect(fetchCodexUsage(auth, fetchImplementation)).rejects.toThrow(/ENOTFOUND/);
  });

  it("rejects when the response body is not valid JSON", async () => {
    const fetchImplementation: FetchFunction = async () => malformedJsonResponse(200);

    await expect(fetchCodexUsage(auth, fetchImplementation)).rejects.toThrow(/kein valides JSON/);
  });
});

describe("isCodexUnauthorizedError", () => {
  it("is false for a plain Error", () => {
    expect(isCodexUnauthorizedError(new Error("boom"))).to.equal(false);
  });

  it("is false for a non-Error value", () => {
    expect(isCodexUnauthorizedError("boom")).to.equal(false);
  });
});

describe("isWithinCodexCooldown", () => {
  it("is false when there has never been an attempt", () => {
    expect(isWithinCodexCooldown(null, new Date())).to.equal(false);
  });

  it("boundary: true at 59999ms elapsed (just under 60s)", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 59_999);
    expect(isWithinCodexCooldown(lastAttemptAt, now)).to.equal(true);
  });

  it("boundary: false at exactly 60000ms elapsed", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 60_000);
    expect(isWithinCodexCooldown(lastAttemptAt, now)).to.equal(false);
  });
});

describe("shouldAttemptCodexLogin", () => {
  it("is true when there has never been a login attempt", () => {
    expect(shouldAttemptCodexLogin(null, new Date())).to.equal(true);
  });

  it("boundary: false at 59 minutes 59 seconds elapsed (just under 1h)", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 59 * 60 * 1000 + 59 * 1000);
    expect(shouldAttemptCodexLogin(lastAttemptAt, now)).to.equal(false);
  });

  it("boundary: true at exactly 1h elapsed", () => {
    const lastAttemptAt = new Date("2026-07-21T09:00:00.000Z");
    const now = new Date(lastAttemptAt.getTime() + 60 * 60 * 1000);
    expect(shouldAttemptCodexLogin(lastAttemptAt, now)).to.equal(true);
  });
});

describe("runCodexLoginStatus", () => {
  it("invokes `codex login status` via the injected exec function", async () => {
    const execFile = fakeExecFile("Logged in");

    await runCodexLoginStatus(execFile);

    expect(execFile.mock.calls).to.deep.equal([["codex", ["login", "status"]]]);
  });

  it("rejects when the codex CLI is not available", async () => {
    const execFile = fakeExecFileFails("command not found: codex");

    await expect(runCodexLoginStatus(execFile)).rejects.toThrow(/command not found/);
  });
});

describe("loadCodexBuckets", () => {
  const now = new Date("2026-07-21T09:00:00.000Z");
  const lastGoodBuckets: Bucket[] = [
    {
      id: "openai:primary",
      provider: "openai",
      label: "OpenAI",
      percent: 42,
      resetsAt: new Date("2026-07-21T09:00:00.000Z"),
      windowSeconds: 604800,
    },
  ];
  const auth = { accessToken: "codex-token", accountId: "acct-1" };

  it("skips the network call within the codex cooldown and returns last-good", async () => {
    let readAuthCalled = false;
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: new Date(now.getTime() - 1000),
      lastLoginAttemptAt: null,
      lastGoodBuckets,
      readAuth: async () => {
        readAuthCalled = true;
        return auth;
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      runLoginStatus: async () => {
        throw new Error("should not be called — cooldown skip returns before any auth/fetch");
      },
    });

    expect(readAuthCalled).to.equal(false);
    expect(result).to.deep.equal({
      buckets: lastGoodBuckets,
      attempted: false,
      loginAttempted: false,
      hint: null,
      error: null,
      resetCreditsAvailable: null,
    });
  });

  it("returns fresh buckets on a clean success", async () => {
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: null,
      lastGoodBuckets: null,
      readAuth: async () => auth,
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean success");
      },
    });

    expect(result).to.deep.equal({
      buckets: parseCodexUsage(codexFixture),
      attempted: true,
      loginAttempted: false,
      hint: null,
      error: null,
      resetCreditsAvailable: null,
    });
  });

  it("shows a hint and last-good when ~/.codex/auth.json is missing, without attempting login", async () => {
    let loginCalled = false;
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: null,
      lastGoodBuckets,
      readAuth: async () => {
        throw new Error("ENOENT");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      runLoginStatus: async () => {
        loginCalled = true;
      },
    });

    expect(loginCalled).to.equal(false);
    expect(result.attempted).to.equal(true);
    expect(result.loginAttempted).to.equal(false);
    expect(result.hint).to.equal("Codex-Login nicht gefunden");
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.resetCreditsAvailable).to.equal(null);
  });

  it("on 401 outside the login cooldown: retries `codex login status`, re-reads auth, and succeeds", async () => {
    let authCallCount = 0;
    let loginCalled = false;
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: null,
      lastGoodBuckets,
      readAuth: async () => {
        authCallCount += 1;
        return auth;
      },
      fetchImplementation: async () => {
        if (authCallCount === 1) {
          return jsonResponse(401, { error: "token_expired" });
        }
        return jsonResponse(200, codexFixture);
      },
      runLoginStatus: async () => {
        loginCalled = true;
      },
    });

    expect(loginCalled).to.equal(true);
    expect(authCallCount).to.equal(2);
    expect(result.attempted).to.equal(true);
    expect(result.loginAttempted).to.equal(true);
    expect(result.hint).to.equal(null);
    expect(result.error).to.equal(null);
    expect(result.buckets).to.deep.equal(parseCodexUsage(codexFixture));
    expect(result.resetCreditsAvailable).to.equal(null);
  });

  it("on 401 outside cooldown: retry still fails, falls back to last-good with a hint", async () => {
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: null,
      lastGoodBuckets,
      readAuth: async () => auth,
      fetchImplementation: async () => jsonResponse(401, { error: "token_expired" }),
      runLoginStatus: async () => {
        /* login status runs but token is still stale */
      },
    });

    expect(result.attempted).to.equal(true);
    expect(result.loginAttempted).to.equal(true);
    expect(result.hint).to.equal("Login abgelaufen");
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.error).to.be.instanceOf(Error);
    expect(result.resetCreditsAvailable).to.equal(null);
  });

  it("on 401 within the login cooldown: does not retry, shows hint immediately", async () => {
    let loginCalled = false;
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: new Date(now.getTime() - 1000),
      lastGoodBuckets,
      readAuth: async () => auth,
      fetchImplementation: async () => jsonResponse(401, { error: "token_expired" }),
      runLoginStatus: async () => {
        loginCalled = true;
      },
    });

    expect(loginCalled).to.equal(false);
    expect(result.attempted).to.equal(true);
    expect(result.loginAttempted).to.equal(false);
    expect(result.hint).to.equal("Login abgelaufen");
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.resetCreditsAvailable).to.equal(null);
  });

  it("on a non-401 failure (network/500): falls back to last-good without attempting login", async () => {
    let loginCalled = false;
    const result = await loadCodexBuckets({
      now: () => now,
      lastAttemptAt: null,
      lastLoginAttemptAt: null,
      lastGoodBuckets,
      readAuth: async () => auth,
      fetchImplementation: async () => jsonResponse(500, {}),
      runLoginStatus: async () => {
        loginCalled = true;
      },
    });

    expect(loginCalled).to.equal(false);
    expect(result.attempted).to.equal(true);
    expect(result.loginAttempted).to.equal(false);
    expect(result.hint).to.equal(null);
    expect(result.buckets).to.deep.equal(lastGoodBuckets);
    expect(result.error).to.be.instanceOf(Error);
    expect(result.resetCreditsAvailable).to.equal(null);
  });
});
