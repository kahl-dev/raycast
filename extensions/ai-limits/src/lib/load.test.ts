import { describe, expect, it, vi } from "vitest";
import { bucket } from "./__fixtures__/bucket";
import codexFixture from "./__fixtures__/codex-usage.json";
import { jsonResponse } from "./__fixtures__/response";
import { parseCodexUsage } from "./codex";
import { LoadCacheDependencies, loadUsageData } from "./load";
import { HistoryPoint } from "./projection";
import { Bucket, Provider } from "./types";

interface FakeCacheStore {
  lastAnthropicAttemptAt: Date | null;
  lastCodexAttemptAt: Date | null;
  lastCodexLoginAttemptAt: Date | null;
  lastGoodAnthropicBuckets: Bucket[] | null;
  lastGoodCodexBuckets: Bucket[] | null;
  firedAlertKeys: Set<string>;
  lastUpdatedAt: Date | null;
  bucketHistory: Record<string, HistoryPoint[]>;
  lastCodexResetCreditsAvailable: number | null;
}

// Map-backed in-memory fake — no module mocking. The `vi.fn` wrapper keeps the fake introspectable
// (call counts/args) while behaving like a real cache: writes are visible to subsequent reads on
// the same instance, which is what the alert-dedup and cooldown-skip invariants below rely on.
function createFakeCache(initial: Partial<FakeCacheStore> = {}): LoadCacheDependencies {
  const store: FakeCacheStore = {
    lastAnthropicAttemptAt: null,
    lastCodexAttemptAt: null,
    lastCodexLoginAttemptAt: null,
    lastGoodAnthropicBuckets: null,
    lastGoodCodexBuckets: null,
    firedAlertKeys: new Set<string>(),
    lastUpdatedAt: null,
    bucketHistory: {},
    lastCodexResetCreditsAvailable: null,
    ...initial,
  };

  return {
    getLastAnthropicAttemptAt: vi.fn((): Date | null => store.lastAnthropicAttemptAt),
    setLastAnthropicAttemptAt: vi.fn((date: Date): void => {
      store.lastAnthropicAttemptAt = date;
    }),
    getLastCodexAttemptAt: vi.fn((): Date | null => store.lastCodexAttemptAt),
    setLastCodexAttemptAt: vi.fn((date: Date): void => {
      store.lastCodexAttemptAt = date;
    }),
    getLastCodexLoginAttemptAt: vi.fn((): Date | null => store.lastCodexLoginAttemptAt),
    setLastCodexLoginAttemptAt: vi.fn((date: Date): void => {
      store.lastCodexLoginAttemptAt = date;
    }),
    getLastGoodBuckets: vi.fn((provider: Provider): Bucket[] | null =>
      provider === "anthropic" ? store.lastGoodAnthropicBuckets : store.lastGoodCodexBuckets,
    ),
    setLastGoodBuckets: vi.fn((provider: Provider, buckets: Bucket[]): void => {
      if (provider === "anthropic") {
        store.lastGoodAnthropicBuckets = buckets;
      } else {
        store.lastGoodCodexBuckets = buckets;
      }
    }),
    getFiredAlertKeys: vi.fn((): Set<string> => new Set(store.firedAlertKeys)),
    setFiredAlertKeys: vi.fn((keys: Set<string>): void => {
      store.firedAlertKeys = new Set(keys);
    }),
    getLastUpdatedAt: vi.fn((): Date | null => store.lastUpdatedAt),
    setLastUpdatedAt: vi.fn((date: Date): void => {
      store.lastUpdatedAt = date;
    }),
    getBucketHistory: vi.fn((bucketId: string): HistoryPoint[] => store.bucketHistory[bucketId] ?? []),
    setBucketHistory: vi.fn((bucketId: string, history: HistoryPoint[]): void => {
      store.bucketHistory[bucketId] = history;
    }),
    getLastCodexResetCreditsAvailable: vi.fn((): number | null => store.lastCodexResetCreditsAvailable),
    setLastCodexResetCreditsAvailable: vi.fn((value: number | null): void => {
      store.lastCodexResetCreditsAvailable = value;
    }),
  };
}

const codexAuth = { accessToken: "codex-token", accountId: "acct-1" };

describe("loadUsageData", () => {
  it("smoke: everything unreachable resolves without throwing, empty buckets, both stale, no writes, no notification", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();
    const notify = vi.fn(async (): Promise<void> => {});

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => {
        throw new Error("should not be called — both providers fail before reaching fetch");
      },
      notify,
    });

    expect(result).to.deep.equal({
      anthropicBuckets: [],
      codexBuckets: [],
      codexHint: "Codex-Login nicht gefunden",
      codexResetCreditsAvailable: null,
      lastUpdatedAt: now,
      anthropicStale: true,
      codexStale: true,
    });
    expect(notify).not.toHaveBeenCalled();
    expect(cache.setLastGoodBuckets).not.toHaveBeenCalled();
  });

  it("smoke: anthropic unreachable but codex fine — codex buckets present, only anthropic stale", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(result.anthropicBuckets).to.deep.equal([]);
    expect(result.codexBuckets).to.deep.equal(parseCodexUsage(codexFixture));
    expect(result.anthropicStale).to.equal(true);
    expect(result.codexStale).to.equal(false);
    expect(result.codexResetCreditsAvailable).to.equal(null);
  });

  it("feature: appends a history point per bucket on every successful load", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();

    await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(cache.setBucketHistory).toHaveBeenCalledWith("openai:primary", [{ at: now, percent: 100 }]);
  });

  it("feature: history accumulates across repeated successful loads instead of being overwritten with a single point", async () => {
    const cache = createFakeCache();
    const deps = {
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify: vi.fn(async (): Promise<void> => {}),
    };

    const firstNow = new Date("2026-07-21T09:00:00.000Z");
    await loadUsageData({ ...deps, now: () => firstNow });

    const secondNow = new Date("2026-07-21T09:35:00.000Z");
    await loadUsageData({ ...deps, now: () => secondNow });

    expect(cache.setBucketHistory).toHaveBeenLastCalledWith("openai:primary", [
      { at: firstNow, percent: 100 },
      { at: secondNow, percent: 100 },
    ]);
  });

  it("does not append history when the codex load fails (last-good fallback, no fresh data)", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();

    await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => {
        throw new Error("should not be called — both providers fail before reaching fetch");
      },
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(cache.setBucketHistory).not.toHaveBeenCalled();
  });

  it("feature: exposes codexResetCreditsAvailable from a fresh codex response", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();
    const bodyWithResetCredits = { ...codexFixture, rate_limit_reset_credits: { available_count: 2 } };

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, bodyWithResetCredits),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(result.codexResetCreditsAvailable).to.equal(2);
  });

  it("feature: a fresh successful codex fetch overwrites the previously cached reset-credits value", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache({ lastCodexResetCreditsAvailable: 5 });
    const bodyWithResetCredits = { ...codexFixture, rate_limit_reset_credits: { available_count: 2 } };

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, bodyWithResetCredits),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(result.codexResetCreditsAvailable).to.equal(2);
    expect(cache.setLastCodexResetCreditsAvailable).toHaveBeenCalledWith(2);
  });

  it("cooldown-skip: within the codex cooldown, returns the previously cached reset-credits value instead of null", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache({ lastCodexAttemptAt: now, lastCodexResetCreditsAvailable: 3 });

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => {
        throw new Error("should not be called — cooldown skip returns before any auth/fetch");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — cooldown skip returns before any auth/fetch");
      },
      fetchImplementation: async () => {
        throw new Error("should not be called — cooldown skip returns before any auth/fetch");
      },
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(result.codexResetCreditsAvailable).to.equal(3);
    expect(cache.setLastCodexResetCreditsAvailable).not.toHaveBeenCalled();
  });

  it("failure: a failed codex fetch keeps the previously cached reset-credits value, without persisting a new one", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache({ lastCodexResetCreditsAvailable: 4 });

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => "token",
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => jsonResponse(200, { limits: [] }),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(result.codexResetCreditsAvailable).to.equal(4);
    expect(cache.setLastCodexResetCreditsAvailable).not.toHaveBeenCalled();
  });

  it("cooldown-skip: within the anthropic cooldown, skips readToken, passes through last-good, does not re-persist the attempt timestamp", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const lastGoodAnthropicBuckets: Bucket[] = [bucket({ percent: 11 })];
    const cache = createFakeCache({ lastAnthropicAttemptAt: now, lastGoodAnthropicBuckets });
    const readToken = vi.fn(async () => "token");

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken,
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(readToken).not.toHaveBeenCalled();
    expect(result.anthropicBuckets).to.deep.equal(lastGoodAnthropicBuckets);
    expect(cache.setLastAnthropicAttemptAt).not.toHaveBeenCalled();
  });

  it("cooldown-skip: within the codex cooldown, skips readAuth, passes through last-good, does not re-persist the attempt timestamp", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const lastGoodCodexBuckets: Bucket[] = [
      bucket({ id: "openai:primary", provider: "openai", label: "OpenAI", percent: 42, windowSeconds: 604800 }),
    ];
    const cache = createFakeCache({ lastCodexAttemptAt: now, lastGoodCodexBuckets });
    const readAuth = vi.fn(async () => codexAuth);

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => "token",
      readAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called — cooldown skip returns before any auth/fetch");
      },
      // Only Anthropic actually fetches in this test (Codex is cooldown-skipped) — an empty
      // limits[] is a valid, minimal Anthropic response (see anthropic.test.ts boundary case).
      fetchImplementation: async () => jsonResponse(200, { limits: [] }),
      notify: vi.fn(async (): Promise<void> => {}),
    });

    expect(readAuth).not.toHaveBeenCalled();
    expect(result.codexBuckets).to.deep.equal(lastGoodCodexBuckets);
    expect(cache.setLastCodexAttemptAt).not.toHaveBeenCalled();
  });

  it("invariant: a bucket at 100% fires the 80 and 95 alerts exactly once; a repeat call with the same state fires nothing", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();
    const notify = vi.fn(async (): Promise<void> => {});
    const deps = {
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify,
    };

    await loadUsageData(deps);

    expect(notify).toHaveBeenCalledTimes(2);

    notify.mockClear();
    await loadUsageData(deps);

    expect(notify).not.toHaveBeenCalled();
  });

  it("regression: a bucket held at 99% while its resets_at drifts stays silent after the first alert", async () => {
    // The rolling-window bug: Anthropic recomputes resets_at = now + window on each request, so a dedup
    // key that embeds resets_at changes every fetch and both the alert AND the reset notification
    // re-fire forever. This guard holds Fable at a constant 99% but drifts resets_at between two genuine
    // fetches (>60s apart, past the anthropic cooldown gate). The second fetch's zero-notification
    // assertion covers both dedup paths at once: no re-fired 80/95 alert and no spurious reset message.
    const cache = createFakeCache();
    const notify = vi.fn(async (): Promise<void> => {});
    const fableBody = (resetsAtIso: string) => ({
      limits: [
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 99,
          resets_at: resetsAtIso,
          scope: { model: { id: "fable", display_name: "Fable" } },
        },
      ],
    });
    const baseDeps = {
      cache,
      readToken: async () => "token",
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      notify,
    };

    // First fetch: Fable at 99% fires the 80 and 95 alerts once each.
    await loadUsageData({
      ...baseDeps,
      now: () => new Date("2026-07-21T09:00:00.000Z"),
      fetchImplementation: async () => jsonResponse(200, fableBody("2026-07-28T09:00:00.000Z")),
    });
    expect(notify).toHaveBeenCalledTimes(2);

    // Second fetch >60s later (past the cooldown gate, so it genuinely re-fetches) with a drifted
    // resets_at — the exact rolling-window signature that used to bust the dedup key.
    notify.mockClear();
    await loadUsageData({
      ...baseDeps,
      now: () => new Date("2026-07-21T09:01:01.000Z"),
      fetchImplementation: async () => jsonResponse(200, fableBody("2026-07-28T09:01:01.000Z")),
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("feature: fires a reset notification when a bucket that was >=80 percent gets a new reset window", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const staleResetsAt = new Date("2026-07-14T19:59:59.982Z");
    const freshResetsAt = new Date("2026-07-27T19:59:59.982Z");
    const previousBucket = bucket({
      id: "anthropic:weekly_all",
      label: "Woche",
      percent: 85,
      resetsAt: staleResetsAt,
      windowSeconds: 604800,
    });
    const cache = createFakeCache({ lastGoodAnthropicBuckets: [previousBucket] });
    const notify = vi.fn(async (): Promise<void> => {});
    const freshAnthropicBody = {
      limits: [
        { kind: "weekly_all", group: "weekly", percent: 5, resets_at: freshResetsAt.toISOString(), scope: null },
      ],
    };

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => "token",
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => jsonResponse(200, freshAnthropicBody),
      notify,
    });

    expect(notify).toHaveBeenCalledWith("AI Limits", "Woche-Limit resettet — wieder verfügbar");
    expect(result.anthropicBuckets[0].resetsAt).to.deep.equal(freshResetsAt);
  });

  it("invariant: a reset notification fires exactly once per (bucket id, new resetsAt) — a repeat call with the same window does not refire", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const staleResetsAt = new Date("2026-07-14T19:59:59.982Z");
    const freshResetsAt = new Date("2026-07-27T19:59:59.982Z");
    const previousBucket = bucket({
      id: "anthropic:weekly_all",
      label: "Woche",
      percent: 85,
      resetsAt: staleResetsAt,
      windowSeconds: 604800,
    });
    const cache = createFakeCache({ lastGoodAnthropicBuckets: [previousBucket] });
    const notify = vi.fn(async (): Promise<void> => {});
    const freshAnthropicBody = {
      limits: [
        { kind: "weekly_all", group: "weekly", percent: 5, resets_at: freshResetsAt.toISOString(), scope: null },
      ],
    };
    const deps = {
      now: () => now,
      cache,
      readToken: async () => "token",
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => jsonResponse(200, freshAnthropicBody),
      notify,
    };

    await loadUsageData(deps);
    expect(notify).toHaveBeenCalledTimes(1);

    notify.mockClear();
    await loadUsageData(deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not fire a reset notification on the very first load (no previous snapshot to compare against)", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();
    const notify = vi.fn(async (): Promise<void> => {});
    const freshAnthropicBody = {
      limits: [
        { kind: "weekly_all", group: "weekly", percent: 85, resets_at: "2026-07-27T19:59:59.982Z", scope: null },
      ],
    };

    await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => "token",
      readAuth: async () => {
        throw new Error("Codex-Auth-Datei nicht lesbar");
      },
      runLoginStatus: async () => {
        throw new Error("should not be called — readAuth already failed");
      },
      fetchImplementation: async () => jsonResponse(200, freshAnthropicBody),
      notify,
    });

    expect(notify).not.toHaveBeenCalledWith("AI Limits", "Woche-Limit resettet — wieder verfügbar");
  });

  it("failure: a rejecting notify does not abort the load — buckets and last-good writes still land", async () => {
    const now = new Date("2026-07-21T09:00:00.000Z");
    const cache = createFakeCache();
    const notify = vi.fn(async (): Promise<void> => {
      throw new Error("osascript: not permitted");
    });

    const result = await loadUsageData({
      now: () => now,
      cache,
      readToken: async () => {
        throw new Error("Anthropic-Token nicht im Keychain gefunden");
      },
      readAuth: async () => codexAuth,
      runLoginStatus: async () => {
        throw new Error("should not be called on a clean codex success");
      },
      fetchImplementation: async () => jsonResponse(200, codexFixture),
      notify,
    });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(result.codexBuckets).to.deep.equal(parseCodexUsage(codexFixture));
    expect(cache.setLastGoodBuckets).toHaveBeenCalledWith("openai", parseCodexUsage(codexFixture));
  });
});
