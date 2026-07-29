import { showHUD } from "@raycast/api";
import { toggleAutomation } from "./util/hammerspoon";

export default async function Command() {
  const result = await toggleAutomation();
  if (result === null) {
    // null = Hammerspoon unreachable (see runHs) — the toggle itself works undocked.
    await showHUD("Hammerspoon unreachable");
    return;
  }
  const { state, docked } = result;
  if (state === "PAUSED") {
    await showHUD(docked ? "⏸️ Audio automation paused" : "⏸️ Paused — applies at next dock");
  } else {
    await showHUD(docked ? "▶️ Audio automation active" : "▶️ Active — applies at next dock");
  }
}
