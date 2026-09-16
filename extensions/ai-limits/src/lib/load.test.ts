import { describe, expect, it, vi } from "vitest";
import { aiLimitsReport, reportAccount, reportBucket } from "./__fixtures__/report";
import { LoadCacheDependencies, loadUsageData } from "./load";
import { HistoryPoint } from "./projection";
import { AiLimitsReport } from "./report";

interface FakeCacheStore {
  lastGoodReport: AiLimitsReport | null;
  lastObservedAt: Record<string, Date | null>;
  firedAlertKeys: Set<string>;
  bucketHistory: Record<string, HistoryPoint[]>;
}

// Map-backed in-memory fake — no module mocking. Mirrors the real cache.ts contract used by
// load.ts: writes on this instance are immediately visible to subsequent reads on the same
// instance, which is what the concurrent-load and dedup invariants below rely on.
function createFakeCache(initial: Partial<FakeCacheStore> = {}): LoadCacheDependencies {
  const store: FakeCacheStore = {
    lastGoodReport: null,
    lastObservedAt: {},
    firedAlertKeys: new Set<string>(),
    bucketHistory: {},
    ...initial,
  };

  return {
    getLastGoodReport: vi.fn((): AiLimitsReport | null => store.lastGoodReport),
    setLastGoodReport: vi.fn((report: AiLimitsReport): void => {
      store.lastGoodReport = report;
    }),
    getLastObservedAt: vi.fn((bucketKey: string): Date | null => store.lastObservedAt[bucketKey] ?? null),
    setLastObservedAt: vi.fn((bucketKey: string, date: Date): void => {
      store.lastObservedAt[bucketKey] = date;
    }),
    getFiredAlertKeys: vi.fn((): Set<string> => new Set(store.firedAlertKeys)),
    setFiredAlertKeys: vi.fn((keys: Set<string>): void => {
      store.firedAlertKeys = new Set(keys);
    }),
    getBucketHistory: vi.fn((bucketKey: string): HistoryPoint[] => store.bucketHistory[bucketKey] ?? []),
    setBucketHistory: vi.fn((bucketKey: string, history: HistoryPoint[]): void => {
      store.bucketHistory[bucketKey] = history;
    }),
  };
}

function rawBucket(overrides: Record<string, unknown> = {}) {
  return {
    id: "anthropic.weekly_all",
    provider: "anthropic",
    account: "work",
    label: "Weekly (all models)",
    percent: 50,
    resets_at: "2026-09-20T10:53:00.000Z",
    window_seconds: 604800,
    observed_at: "2026-09-16T11:19:00.000Z",
    elapsed_percent: 70,
    ...overrides,
  };
}

function rawReport(overrides: Record<string, unknown> = {}) {
  return {
    fetched_at: "2026-09-16T11:20:00.000Z",
    stale: false,
    accounts: [{ name: "work", label: "w" }],
    buckets: [rawBucket()],
    errors: [],
    skipped: [],
    reset_credits: null,
    plans: [],
    sources: [],
    ...overrides,
  };
}

const NOW = new Date("2026-09-16T11:25:00.000Z");

describe("loadUsageData — success path", () => {
  it("parses the runner output and persists it as the last-good report", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport();

    const result = await loadUsageData({
      now: () => NOW,
      cache,
      runAiLimits: async () => raw,
      notify,
    });

    expect(result.runError).to.equal(null);
    expect(result.report).to.not.equal(null);
    expect(result.report?.buckets[0].percent).to.equal(50);
    expect(cache.setLastGoodReport).toHaveBeenCalledTimes(1);
  });
});

describe("loadUsageData — runner/parser failure", () => {
  it("with a last-good report present: snapshot carries runError, the old report, no history, no alerts, no reset events", async () => {
    const lastGood = aiLimitsReport({
      buckets: [reportBucket({ key: "anthropic:work:anthropic.weekly_all", id: "anthropic.weekly_all", percent: 40 })],
    });
    const cache = createFakeCache({ lastGoodReport: lastGood });
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const result = await loadUsageData({
      now: () => NOW,
      cache,
      runAiLimits: async () => {
        throw new Error("ai-limits exited with code 1");
      },
      notify,
    });

    expect(result.report).to.deep.equal(lastGood);
    expect(result.runError).to.equal("ai-limits exited with code 1");
    expect(cache.setBucketHistory).not.toHaveBeenCalled();
    expect(cache.setFiredAlertKeys).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("with no last-good report: snapshot report is null, runError set", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const result = await loadUsageData({
      now: () => NOW,
      cache,
      runAiLimits: async () => {
        throw new Error("ai-limits-nonexistent-binary-xyz: no such file or directory");
      },
      notify,
    });

    expect(result.report).to.equal(null);
    expect(result.runError).to.equal("ai-limits-nonexistent-binary-xyz: no such file or directory");
    expect(notify).not.toHaveBeenCalled();
  });

  it("a parser rejection (valid JSON, invalid shape) is treated the same as a runner rejection", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const result = await loadUsageData({
      now: () => NOW,
      cache,
      runAiLimits: async () => ({ not: "a valid report" }),
      notify,
    });

    expect(result.report).to.equal(null);
    expect(typeof result.runError).to.equal("string");
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("loadUsageData — history", () => {
  it("records exactly one history point across two loads that return the identical report", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport();
    const deps = { now: () => NOW, cache, runAiLimits: async () => raw, notify };

    await loadUsageData(deps);
    await loadUsageData(deps);

    const history = cache.getBucketHistory("anthropic:work:anthropic.weekly_all");
    expect(history.length).to.equal(1);
  });

  it("records a second history point when observed_at advances between loads", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const first = rawReport();
    const second = rawReport({
      buckets: [rawBucket({ percent: 60, observed_at: "2026-09-16T11:24:00.000Z" })],
    });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => first, notify });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => second, notify });

    const history = cache.getBucketHistory("anthropic:work:anthropic.weekly_all");
    expect(history.length).to.equal(2);
    expect(history[1].percent).to.equal(60);
  });
});

describe("loadUsageData — alert dedup per account", () => {
  it("fires the same bucket id's alert separately for two different accounts", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({
      accounts: [
        { name: "work", label: "w" },
        { name: "private", label: "p" },
      ],
      buckets: [rawBucket({ account: "work", percent: 85 }), rawBucket({ account: "private", percent: 85 })],
    });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify).toHaveBeenCalledTimes(2);
    const messages = notify.mock.calls.map((call) => call[1] as string);
    expect(messages.some((message) => message.startsWith("work · Weekly (all models)"))).to.equal(true);
    expect(messages.some((message) => message.startsWith("private · Weekly (all models)"))).to.equal(true);
  });

  it("does not refire an already-fired alert on a second load at the same percent", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({ buckets: [rawBucket({ percent: 85 })] });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("loadUsageData — reset events per account", () => {
  it("fires a reset event only for the account whose percent dropped", async () => {
    const cache = createFakeCache({
      lastGoodReport: aiLimitsReport({
        accounts: [reportAccount({ name: "work", label: "w" }), reportAccount({ name: "private", label: "p" })],
        buckets: [
          reportBucket({
            key: "anthropic:work:anthropic.weekly_all",
            id: "anthropic.weekly_all",
            account: "work",
            percent: 90,
          }),
          reportBucket({
            key: "anthropic:private:anthropic.weekly_all",
            id: "anthropic.weekly_all",
            account: "private",
            percent: 20,
          }),
        ],
      }),
    });
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({
      accounts: [
        { name: "work", label: "w" },
        { name: "private", label: "p" },
      ],
      buckets: [rawBucket({ account: "work", percent: 5 }), rawBucket({ account: "private", percent: 22 })],
    });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify).toHaveBeenCalledTimes(1);
    const message = notify.mock.calls[0][1] as string;
    expect(message.startsWith("work · Weekly (all models)")).to.equal(true);
  });

  it("re-reads the reset baseline AFTER the runner await, seeing a concurrent load's fresher write", async () => {
    const cache = createFakeCache({
      lastGoodReport: aiLimitsReport({
        buckets: [
          reportBucket({
            key: "anthropic:work:anthropic.weekly_all",
            id: "anthropic.weekly_all",
            account: "work",
            percent: 12,
          }),
        ],
      }),
    });
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({ buckets: [rawBucket({ percent: 5 })] });

    const result = await loadUsageData({
      now: () => NOW,
      cache,
      runAiLimits: async () => {
        // Simulates a second, concurrent loadUsageData call finishing first and writing a fresher
        // last-good report while this call's own fetch is still in flight.
        cache.setLastGoodReport(
          aiLimitsReport({
            buckets: [
              reportBucket({
                key: "anthropic:work:anthropic.weekly_all",
                id: "anthropic.weekly_all",
                account: "work",
                percent: 90,
              }),
            ],
          }),
        );
        return raw;
      },
      notify,
    });

    expect(result.runError).to.equal(null);
    // Baseline 12 -> 5 would not cross a reset-drop threshold; baseline 90 -> 5 does. Firing here
    // proves the baseline read happened after the concurrent write, not before this call's own await.
    expect(notify).toHaveBeenCalledTimes(1);
    const message = notify.mock.calls[0][1] as string;
    expect(message.startsWith("work · Weekly (all models)")).to.equal(true);
  });
});

describe("loadUsageData — freshness gate", () => {
  it("ignores a bucket reported at an older observedAt than the baseline for alerts, pruning, and resets", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const run1 = rawReport({
      buckets: [rawBucket({ percent: 85, observed_at: "2026-09-16T12:20:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run1, notify });
    expect(notify).toHaveBeenCalledTimes(1);

    const run2 = rawReport({
      buckets: [rawBucket({ percent: 70, observed_at: "2026-09-16T12:05:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run2, notify });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls.some((call) => (call[1] as string).includes("resettet"))).to.equal(false);

    const run3 = rawReport({
      buckets: [rawBucket({ percent: 86, observed_at: "2026-09-16T12:25:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run3, notify });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("sends nothing and leaves fired keys unchanged when the identical report is served twice", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({ buckets: [rawBucket({ percent: 85 })] });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });
    const firedAfterFirst = cache.getFiredAlertKeys();

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(cache.getFiredAlertKeys()).to.deep.equal(firedAfterFirst);
  });
});

describe("loadUsageData — fired keys survive an absent or stale bucket", () => {
  it("does not re-fire once a fresh observation returns after the bucket was absent from a skipped run", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const run1 = rawReport({
      buckets: [rawBucket({ id: "anthropic.weekly.fable", percent: 96, observed_at: "2026-09-16T12:20:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run1, notify });
    expect(notify).toHaveBeenCalledTimes(1);

    const run2 = rawReport({
      buckets: [],
      skipped: [{ provider: "anthropic", account: "work", reason: "Fable-Limit nicht lesbar" }],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run2, notify });
    expect(notify).toHaveBeenCalledTimes(1);

    const run3 = rawReport({
      buckets: [rawBucket({ id: "anthropic.weekly.fable", percent: 96, observed_at: "2026-09-16T12:30:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run3, notify });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("fires again on a later fresh crossing after a fresh observation dropped below threshold minus hysteresis", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});

    const run1 = rawReport({
      buckets: [rawBucket({ id: "anthropic.weekly.fable", percent: 96, observed_at: "2026-09-16T12:20:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run1, notify });
    expect(notify).toHaveBeenCalledTimes(1);

    const run2 = rawReport({
      buckets: [rawBucket({ id: "anthropic.weekly.fable", percent: 70, observed_at: "2026-09-16T12:25:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run2, notify });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[1][1]).to.match(/-Limit resettet/);

    const run3 = rawReport({
      buckets: [rawBucket({ id: "anthropic.weekly.fable", percent: 96, observed_at: "2026-09-16T12:30:00.000Z" })],
    });
    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => run3, notify });
    expect(notify).toHaveBeenCalledTimes(3);
  });
});

describe("loadUsageData — one notification per bucket across simultaneous thresholds", () => {
  it("sends exactly one notification when a bucket is first observed at 100%, marking both the 80 and 95 keys fired", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({ buckets: [rawBucket({ percent: 100 })] });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(cache.getFiredAlertKeys()).to.deep.equal(
      new Set(["anthropic:work:anthropic.weekly_all:80", "anthropic:work:anthropic.weekly_all:95"]),
    );
  });
});

describe("loadUsageData — concurrent overlapping loads", () => {
  it("persists fired keys before awaiting notify, so an overlapping second load does not re-notify", async () => {
    const cache = createFakeCache();
    let releaseNotify: (() => void) | undefined;
    const notifyGate = new Promise<void>((resolve) => {
      releaseNotify = resolve;
    });
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {
      await notifyGate;
    });
    const raw = rawReport({ buckets: [rawBucket({ percent: 85 })] });
    const deps = { now: () => NOW, cache, runAiLimits: async () => raw, notify };

    const loads = Promise.all([loadUsageData(deps), loadUsageData(deps)]);
    // Both calls' synchronous work up to (and including) the notify call has run by now; neither
    // has resumed past its notify await because notifyGate is still pending.
    releaseNotify?.();
    await loads;

    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("loadUsageData — notification delivery", () => {
  it("a rejected notification does not reject loadUsageData and other data is still persisted", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {
      throw new Error("osascript failed");
    });
    const raw = rawReport({ buckets: [rawBucket({ percent: 85 })] });

    const result = await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(result.runError).to.equal(null);
    expect(cache.setLastGoodReport).toHaveBeenCalledTimes(1);
  });

  it("prefixes an anthropic notification with '<account> · <label>'", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({
      accounts: [{ name: "work", label: "w" }],
      buckets: [rawBucket({ account: "work", label: "Weekly (all models)", percent: 96 })],
    });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify.mock.calls[0][1]).to.match(/^work · Weekly \(all models\)/);
  });

  it("prefixes a codex notification with 'Codex · <label>'", async () => {
    const cache = createFakeCache();
    const notify = vi.fn<(title: string, message: string) => Promise<void>>(async () => {});
    const raw = rawReport({
      accounts: [],
      buckets: [
        rawBucket({
          id: "codex.primary",
          provider: "codex",
          account: "default",
          label: "Primary (7d)",
          percent: 96,
        }),
      ],
    });

    await loadUsageData({ now: () => NOW, cache, runAiLimits: async () => raw, notify });

    expect(notify.mock.calls[0][1]).to.match(/^Codex · Primary \(7d\)/);
  });
});
