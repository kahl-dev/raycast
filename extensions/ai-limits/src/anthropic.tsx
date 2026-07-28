// Command name stays "anthropic" even though it now covers both providers in one menu-bar item:
// Raycast tracks command activation by name, and the user already first-activated the "anthropic"
// command — renaming it would deactivate it again and force a manual re-enable. Only the display
// TITLE changed (see package.json's "title": "AI Limits").
import { MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { DropdownContent } from "./dropdown";
import { loadUsageData, staleSuffix } from "./lib/load";
import { buildMenuBarTitle } from "./lib/menu-bar-title";
import { Bucket } from "./lib/types";
import { loadDependencies } from "./load-dependencies";

// BUMP THIS whenever UsageSnapshot gains or renames a field. useCachedPromise persists its resolved
// value and hands it straight back on the next launch; its cache key is objecthash(args) inside a
// namespace of objecthash(fn), and the fn text here does not change when lib/load.ts does — so
// without a version in args, a snapshot written by an older build is restored into code that
// expects the new shape. That is not a glitch: the stale snapshot renders, the render throws, and
// the command dies before the fresh fetch can overwrite the cache, so every subsequent tick repeats
// it. Observed 2026-07-28 after adding anthropicSkipped (crash loop 15:03 -> 16:08).
const SNAPSHOT_VERSION = 2;

export default function Command() {
  const { data, isLoading, mutate } = useCachedPromise(
    (version: number) => {
      void version; // consumed only by the cache key, which is objecthash(args)
      return loadUsageData(loadDependencies);
    },
    [SNAPSHOT_VERSION],
  );
  // Raycast unloads a menu-bar command once the menu closes — which an item's onAction does — and
  // only isLoading holds it open. mutate(asyncUpdate) does NOT raise isLoading while it awaits the
  // update (@raycast/utils 1.19.1), so without this the refresh fetch gets killed mid-flight.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const now = new Date();
  const allBuckets: Bucket[] = data ? [...data.anthropicBuckets, ...data.codexBuckets] : [];
  const title = buildMenuBarTitle(allBuckets);

  // force:true is what makes this button do anything at all — opening the menu already ran a load
  // and wrote both attempt timestamps, so an un-forced refresh a second later is skipped by the 60s
  // gates and returns the exact same last-good data.
  //
  // No optimisticUpdate and no shouldRevalidateAfter override: mutate() only pushes new data into
  // React state via one of those two paths, so without either, the awaited fetch would update Cache
  // but leave title/dropdown stale until the next interval tick. The default revalidate() (a
  // second, un-forced loadUsageData right after this one settles) is cheap — it hits the gates and
  // serves the last-good data the forced call just wrote.
  async function refresh() {
    setIsRefreshing(true);
    try {
      await mutate(loadUsageData(loadDependencies, { force: true }));
    } finally {
      setIsRefreshing(false);
    }
  }

  // `data` crosses a deserialization boundary — it may be a snapshot persisted by an older build,
  // so a field added since then is absent at runtime despite what the type says. SNAPSHOT_VERSION
  // is the real guard; the `?? []` below keeps a forgotten bump from wedging the command.
  return (
    <MenuBarExtra title={title} isLoading={isLoading || isRefreshing} tooltip="AI Limits">
      {data && (
        <DropdownContent
          anthropicBuckets={data.anthropicBuckets}
          codexBuckets={data.codexBuckets}
          anthropicSkipped={data.anthropicSkipped ?? []}
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
