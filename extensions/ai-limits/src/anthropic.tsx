// Command name stays "anthropic" even though it now covers both Claude accounts and Codex in one
// menu-bar item: Raycast tracks command activation by name, and the user already first-activated
// the "anthropic" command — renaming it would deactivate it again and force a manual re-enable.
// Only the display TITLE changed (see package.json's "title": "AI Limits").
import { MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { DropdownContent } from "./dropdown";
import { loadUsageData } from "./lib/load";
import { buildMenuBarTitle } from "./lib/menu-bar-title";
import { loadDependencies } from "./load-dependencies";

// BUMP THIS whenever UsageSnapshot gains or renames a field. useCachedPromise persists its resolved
// value and hands it straight back on the next launch; its cache key is objecthash(args) inside a
// namespace of objecthash(fn), and the fn text here does not change when lib/load.ts does — so
// without a version in args, a snapshot written by an older build is restored into code that
// expects the new shape. That is not a glitch: the stale snapshot renders, the render throws, and
// the command dies before the fresh fetch can overwrite the cache, so every subsequent tick repeats
// it. Bumped to 3 with the `ai-limits --json` report/UsageSnapshot rewrite (multi-account).
const SNAPSHOT_VERSION = 3;

const TITLE_PLACEHOLDER = "AI Limits";

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
  const title = data?.report ? buildMenuBarTitle(data.report) : TITLE_PLACEHOLDER;

  // No `force`: `bin/ai-limits` owns its own cooldown/caching now, so a manual refresh is just
  // another loadUsageData call — the extension no longer bypasses anything.
  async function refresh() {
    setIsRefreshing(true);
    try {
      await mutate(loadUsageData(loadDependencies));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <MenuBarExtra title={title} isLoading={isLoading || isRefreshing} tooltip="AI Limits">
      {data && <DropdownContent report={data.report} runError={data.runError} now={now} onRefresh={refresh} />}
    </MenuBarExtra>
  );
}
