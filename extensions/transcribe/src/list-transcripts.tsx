import { Action, ActionPanel, getPreferenceValues, Icon, List, showInFinder, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { listProtocols, ProtocolFile } from "./lib/vault";

const execFileAsync = promisify(execFile);

interface Preferences {
  vaultTranscriptsDir: string;
}

async function listTxtTranscripts(dir: string): Promise<ProtocolFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const transcripts: ProtocolFile[] = [];
  for (const name of entries) {
    if (path.extname(name).toLowerCase() !== ".txt") continue;
    const filePath = path.join(dir, name);
    const stats = await fs.stat(filePath);
    transcripts.push({ path: filePath, name, mtimeMs: stats.mtimeMs });
  }
  return transcripts;
}

async function openInObsidian(absolutePath: string): Promise<void> {
  const url = `obsidian://open?path=${encodeURIComponent(absolutePath)}`;
  try {
    await execFileAsync("open", [url]);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Open in Obsidian fehlgeschlagen",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function revealInFinder(filePath: string): Promise<void> {
  try {
    await showInFinder(filePath);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Reveal in Finder fehlgeschlagen",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export default function Command() {
  const { data, isLoading } = useCachedPromise(async (dir: string) => {
    const [protocols, transcripts] = await Promise.all([listProtocols(dir), listTxtTranscripts(dir)]);
    return [...protocols, ...transcripts].sort((a, b) => b.mtimeMs - a.mtimeMs);
  }, [getPreferenceValues<Preferences>().vaultTranscriptsDir]);

  const items = data ?? [];

  return (
    <List isLoading={isLoading} filtering searchBarPlaceholder="Nach Dateiname suchen...">
      {items.map((item) => (
        <List.Item
          key={item.path}
          title={item.name}
          subtitle={item.path}
          icon={item.name.endsWith(".md") ? Icon.Document : Icon.Text}
          actions={
            <ActionPanel>
              <Action title="Open in Obsidian" icon={Icon.AppWindow} onAction={() => openInObsidian(item.path)} />
              <Action.Open title="Open with Default App" target={item.path} />
              <Action.CopyToClipboard title="Copy Path" content={item.path} />
              <Action
                title="Reveal in Finder"
                icon={Icon.Finder}
                onAction={() => revealInFinder(item.path)}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
