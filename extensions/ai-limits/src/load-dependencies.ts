import { runAiLimits } from "./lib/ai-limits-runner";
import * as cache from "./lib/cache";
import { LoadDependencies } from "./lib/load";
import { sendMacNotification } from "./lib/notify";

// Wires the pure loadUsageData (lib/load.ts) to the real Cache-backed storage and the real
// `ai-limits --json` subprocess, for the single anthropic.tsx menu-bar command.
export const loadDependencies: LoadDependencies = {
  now: () => new Date(),
  cache: {
    getLastGoodReport: cache.getLastGoodReport,
    setLastGoodReport: cache.setLastGoodReport,
    getLastObservedAt: cache.getLastObservedAt,
    setLastObservedAt: cache.setLastObservedAt,
    getFiredAlertKeys: cache.getFiredAlertKeys,
    setFiredAlertKeys: cache.setFiredAlertKeys,
    getBucketHistory: cache.getBucketHistory,
    setBucketHistory: cache.setBucketHistory,
  },
  runAiLimits: () => runAiLimits(),
  notify: sendMacNotification,
};
