import { useState, useEffect, useCallback } from "react";
import { isAutomationPaused } from "./util/hammerspoon";

// Whether the audio daemon's automation is paused — queried once when a command opens, for the
// list's navigation-title badge. The pause state only changes via the separate Toggle Audio
// Automation command, so it does not need re-querying on every device-list reload.
export function useAutomationPaused(): boolean {
  const [paused, setPaused] = useState(false);
  const refresh = useCallback(async () => {
    setPaused(await isAutomationPaused());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return paused;
}

export function pausedNavigationTitle(base: string, paused: boolean): string | undefined {
  return paused ? `${base} · ⏸️ Automation paused` : undefined;
}
