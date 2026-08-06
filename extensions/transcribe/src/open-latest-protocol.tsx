import { getPreferenceValues, showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { latestProtocol } from "./lib/vault";

const execFileAsync = promisify(execFile);

interface Preferences {
  vaultTranscriptsDir: string;
}

async function openInObsidian(absolutePath: string): Promise<void> {
  const url = `obsidian://open?path=${encodeURIComponent(absolutePath)}`;
  await execFileAsync("open", [url]);
}

export default async function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const protocol = await latestProtocol(preferences.vaultTranscriptsDir);

  if (!protocol) {
    await showHUD("Keine Protokolle gefunden");
    return;
  }

  try {
    await openInObsidian(protocol.path);
    await showHUD(protocol.name);
  } catch (error) {
    await showHUD(`Öffnen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
}
