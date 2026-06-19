import { showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { toggleInputMute } from "./util/hammerspoon";

const execFileAsync = promisify(execFile);

// Fallback when the Wave:3 mic can't be targeted directly (undocked, or no per-device volume):
// toggle the CURRENT default input's volume via AppleScript. Returns the new muted state.
async function toggleCurrentInputMute(): Promise<boolean> {
  const { stdout } = await execFileAsync("osascript", ["-e", "input volume of (get volume settings)"]);
  const currentlyMuted = stdout.trim() === "0";
  await execFileAsync("osascript", ["-e", `set volume input volume ${currentlyMuted ? "100" : "0"}`]);
  return !currentlyMuted;
}

export default async function Command() {
  // Mute the active input via the daemon (per-device, preserves the mic's gain on unmute);
  // null = daemon unavailable (undocked) -> fall back to AppleScript on the current input.
  const nowMuted = (await toggleInputMute()) ?? (await toggleCurrentInputMute());
  await showHUD(nowMuted ? "🔇 Mic Muted" : "🎙️ Mic On");
}
