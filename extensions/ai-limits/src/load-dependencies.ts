import * as cache from "./lib/cache";
import { readCodexAuth, runCodexLoginStatus } from "./lib/codex";
import { readAnthropicToken } from "./lib/keychain";
import { LoadDependencies } from "./lib/load";
import { sendMacNotification } from "./lib/notify";

// Wires the pure loadUsageData (lib/load.ts) to the real Cache-backed storage, Keychain,
// filesystem, and network implementations, for the single anthropic.tsx menu-bar command.
export const loadDependencies: LoadDependencies = {
  now: () => new Date(),
  cache: {
    getLastAnthropicAttemptAt: cache.getLastAnthropicAttemptAt,
    setLastAnthropicAttemptAt: cache.setLastAnthropicAttemptAt,
    getLastCodexAttemptAt: cache.getLastCodexAttemptAt,
    setLastCodexAttemptAt: cache.setLastCodexAttemptAt,
    getLastCodexLoginAttemptAt: cache.getLastCodexLoginAttemptAt,
    setLastCodexLoginAttemptAt: cache.setLastCodexLoginAttemptAt,
    getLastGoodBuckets: cache.getLastGoodBuckets,
    setLastGoodBuckets: cache.setLastGoodBuckets,
    getLastCodexResetCreditsAvailable: cache.getLastCodexResetCreditsAvailable,
    setLastCodexResetCreditsAvailable: cache.setLastCodexResetCreditsAvailable,
    getFiredAlertKeys: cache.getFiredAlertKeys,
    setFiredAlertKeys: cache.setFiredAlertKeys,
    getLastUpdatedAt: cache.getLastUpdatedAt,
    setLastUpdatedAt: cache.setLastUpdatedAt,
    getBucketHistory: cache.getBucketHistory,
    setBucketHistory: cache.setBucketHistory,
  },
  readToken: readAnthropicToken,
  readAuth: readCodexAuth,
  runLoginStatus: runCodexLoginStatus,
  fetchImplementation: fetch,
  notify: sendMacNotification,
};
