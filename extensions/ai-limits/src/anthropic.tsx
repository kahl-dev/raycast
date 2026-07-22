// Command name stays "anthropic" even though it now covers both providers in one menu-bar item:
// Raycast tracks command activation by name, and the user already first-activated the "anthropic"
// command — renaming it would deactivate it again and force a manual re-enable. Only the display
// TITLE changed (see package.json's "title": "AI Limits").
import { MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { DropdownContent } from "./dropdown";
import { loadUsageData, staleSuffix } from "./lib/load";
import { buildMenuBarTitle } from "./lib/menu-bar-title";
import { Bucket } from "./lib/types";
import { loadDependencies } from "./load-dependencies";

export default function Command() {
  const { data, isLoading, mutate } = useCachedPromise(() => loadUsageData(loadDependencies), []);
  const now = new Date();
  const allBuckets: Bucket[] = data ? [...data.anthropicBuckets, ...data.codexBuckets] : [];
  const title = buildMenuBarTitle(allBuckets);

  // No optimisticUpdate and no shouldRevalidateAfter override: mutate() only pushes new data into
  // React state via one of those two paths, so without either, the awaited fetch below would update
  // Cache but leave title/dropdown stale until the next 5-minute interval. The default revalidate()
  // (a second loadUsageData call right after this one settles) is safe to let run because both
  // providers now sit behind 60s attempt gates (isWithinAnthropicCooldown / isWithinCodexCooldown,
  // see load.test.ts "cooldown-skip" cases) — that second call skips both networks and serves
  // last-good from Cache, so it's cheap and does not double-fetch or double-record history.
  async function refresh() {
    await mutate(loadUsageData(loadDependencies));
  }

  return (
    <MenuBarExtra title={title} isLoading={isLoading} tooltip="AI Limits">
      {data && (
        <DropdownContent
          anthropicBuckets={data.anthropicBuckets}
          codexBuckets={data.codexBuckets}
          codexHint={data.codexHint}
          codexResetCreditsAvailable={data.codexResetCreditsAvailable}
          lastUpdatedAt={data.lastUpdatedAt}
          staleSuffixText={staleSuffix(data)}
          now={now}
          onRefresh={refresh}
        />
      )}
    </MenuBarExtra>
  );
}
