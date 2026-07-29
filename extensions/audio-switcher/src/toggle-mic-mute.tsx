import { showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { toggleInputMute } from "./util/hammerspoon";

const execFileAsync = promisify(execFile);

// Fallback when the Wave:3 mic can't be targeted directly (Hammerspoon unreachable, device not
// found, or no per-device volume control): toggle the CURRENT default input's volume via
// AppleScript. Returns the new muted state.
async function toggleCurrentInputMute(): Promise<boolean> {
  const { stdout } = await execFileAsync("osascript", ["-e", "input volume of (get volume settings)"]);
  const currentlyMuted = stdout.trim() === "0";
  await execFileAsync("osascript", ["-e", `set volume input volume ${currentlyMuted ? "100" : "0"}`]);
  return !currentlyMuted;
}

export default async function Command() {
  // Daemon mute preserves the mic's gain on unmute; null -> AppleScript fallback (see
  // toggleInputMute's docstring for the failure modes).
  const nowMuted = (await toggleInputMute()) ?? (await toggleCurrentInputMute());
  await showHUD(nowMuted ? "🔇 Mic Muted" : "🎙️ Mic On");
}
