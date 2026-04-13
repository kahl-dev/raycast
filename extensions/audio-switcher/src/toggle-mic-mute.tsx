import { showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function getInputMuted(): Promise<boolean> {
  const { stdout } = await execFileAsync("osascript", [
    "-e",
    "input volume of (get volume settings)",
  ]);
  return stdout.trim() === "0";
}

async function setInputMuted(muted: boolean): Promise<void> {
  const volume = muted ? "0" : "100";
  await execFileAsync("osascript", [
    "-e",
    `set volume input volume ${volume}`,
  ]);
}

export default async function Command() {
  const currentlyMuted = await getInputMuted();
  await setInputMuted(!currentlyMuted);
  await showHUD(currentlyMuted ? "🎙️ Mic On" : "🔇 Mic Muted");
}
