import { showHUD } from "@raycast/api";
import { toggleAutomation } from "./util/hammerspoon";

export default async function Command() {
  const state = await toggleAutomation();
  if (state === null) {
    // No daemon (undocked) — there is no automation to pause; nothing to toggle.
    await showHUD("Audio daemon not running (undocked)");
    return;
  }
  await showHUD(state === "PAUSED" ? "⏸️ Audio automation paused" : "▶️ Audio automation active");
}
