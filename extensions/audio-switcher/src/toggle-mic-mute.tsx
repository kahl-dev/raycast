import { showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { toggleInputMute } from "./util/hammerspoon";

const execFileAsync = promisify(execFile);

// Fallback when the daemon can't mute (Hammerspoon unreachable, no default input, or neither mute
// nor volume control): toggle the CURRENT default input's volume via AppleScript, which has no
// mute control. On the Wave:3 this only drops to its lowest gain step, not silence — the daemon's
// hardware mute is the real path. Returns the new muted state.
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
