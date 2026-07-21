import { Icon, launchCommand, LaunchType, MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { DropdownContent, severityColor } from "./dropdown";
import * as cache from "./lib/cache";
import { readCodexAuth, runCodexLoginStatus } from "./lib/codex";
import { buildMenuBarTitle, computeBucketSeverities, highestDisplaySeverity, TitleLayout } from "./lib/format";
import { readAnthropicToken } from "./lib/keychain";
import { LoadDependencies, loadUsageData, staleSuffix } from "./lib/load";
import { sendMacNotification } from "./lib/notify";
import { PILL_COMMAND_KINDS, pillCommandName } from "./lib/pill-selection";

const loadDependencies: LoadDependencies = {
  now: () => new Date(),
  cache: {
    getLastAnthropicAttemptAt: cache.getLastAnthropicAttemptAt,
    setLastAnthropicAttemptAt: cache.setLastAnthropicAttemptAt,
    getLastCodexLoginAttemptAt: cache.getLastCodexLoginAttemptAt,
    setLastCodexLoginAttemptAt: cache.setLastCodexLoginAttemptAt,
    getLastGoodBuckets: cache.getLastGoodBuckets,
    setLastGoodBuckets: cache.setLastGoodBuckets,
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

export default function MenuBar() {
  const [layout, setLayoutState] = useState<TitleLayout>(() => cache.getLayout());
  const { data, isLoading, mutate } = useCachedPromise(() => loadUsageData(loadDependencies), []);

  const now = new Date();
  const allBuckets = data ? [...data.anthropicBuckets, ...data.codexBuckets] : [];
  const title = data ? buildMenuBarTitle(layout, allBuckets) : "…";

  // Computed once here (not once per BucketRow render) so the menu bar icon tint (worst-of-all)
  // and each row's own dot color share the same displaySeverity result per bucket.
  const anthropicSeverities = data ? computeBucketSeverities(data.anthropicBuckets, now) : [];
  const codexSeverities = data ? computeBucketSeverities(data.codexBuckets, now) : [];
  const tintColor = severityColor(highestDisplaySeverity([...anthropicSeverities, ...codexSeverities]));

  function selectLayout(next: TitleLayout) {
    setLayoutState(next);
    cache.setLayout(next);
  }

  // revalidate() (useCachedPromise) returns void, giving no signal for "the fetch has finished
  // and Cache now holds fresh buckets" — mutate() wraps the same loadUsageData call in a promise
  // we can await, so the pill fan-out below only launches once Cache is actually up to date
  // (loadUsageData writes setLastGoodBuckets synchronously before its promise resolves).
  // shouldRevalidateAfter is disabled: in a menu-bar command, mutate()'s default behavior awaits
  // a *second* revalidate() (calling loadUsageData again) after the passed promise settles — that
  // would fetch Codex's uncooled-down endpoint twice and record a duplicate history point for no
  // benefit, since the awaited call below already wrote fresh buckets to Cache.
  async function refreshAndNotifyPills() {
    await mutate(loadUsageData(loadDependencies), { shouldRevalidateAfter: false });
    await Promise.all(
      PILL_COMMAND_KINDS.map(async (kind) => {
        const commandName = pillCommandName(kind);
        try {
          await launchCommand({ name: commandName, type: LaunchType.Background });
        } catch (error) {
          // A pill command the user disabled (e.g. the session pill, disabledByDefault) makes
          // launchCommand throw — that must not abort refreshing the other pills or surface an
          // error for what is, from the user's perspective, an intentional configuration.
          console.error(`AI Limits: Pill-Befehl "${commandName}" konnte nicht aktualisiert werden`, error);
        }
      }),
    );
  }

  return (
    <MenuBarExtra icon={{ source: Icon.Gauge, tintColor }} title={title} isLoading={isLoading} tooltip="AI Limits">
      {data && (
        <DropdownContent
          anthropicBuckets={data.anthropicBuckets}
          codexBuckets={data.codexBuckets}
          codexHint={data.codexHint}
          codexResetCreditsAvailable={data.codexResetCreditsAvailable}
          lastUpdatedAt={data.lastUpdatedAt}
          staleSuffixText={staleSuffix(data)}
          now={now}
          onRefresh={refreshAndNotifyPills}
          layoutSection={{ layout, onSelectLayout: selectLayout }}
        />
      )}
    </MenuBarExtra>
  );
}
