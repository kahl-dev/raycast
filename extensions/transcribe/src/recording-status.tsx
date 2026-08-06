import { Icon, MenuBarExtra, getPreferenceValues, open, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { execFile } from "child_process";
import { promisify } from "util";
import { getState, MTApiAuthError, MTApiUnreachableError, readToken, TokenMissingError } from "./lib/mt-api";
import { listProtocols, ProtocolFile } from "./lib/vault";

const execFileAsync = promisify(execFile);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openMeetingTranscriberSettings(): Promise<void> {
  try {
    await execFileAsync("open", ["-a", "MeetingTranscriber"]);
  } catch {
    try {
      await execFileAsync("open", ["/Applications/MeetingTranscriber.app"]);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "MeetingTranscriber konnte nicht geöffnet werden",
        message: errorMessage(error),
      });
    }
  }
}

async function openProtocol(protocolPath: string): Promise<void> {
  try {
    await open(protocolPath);
  } catch (error) {
    await showToast({ style: Toast.Style.Failure, title: "Öffnen fehlgeschlagen", message: errorMessage(error) });
  }
}

interface Preferences {
  protocolsDir: string;
  mtBaseUrl: string;
  mtTokenPath: string;
}

type ViewState =
  | { kind: "idle" | "watching" | "recording" }
  | { kind: "error"; message: string };

async function loadStatus(): Promise<{ state: ViewState; protocols: ProtocolFile[] }> {
  const preferences = getPreferenceValues<Preferences>();
  const protocols = await listProtocols(preferences.protocolsDir).catch(() => [] as ProtocolFile[]);

  try {
    const token = readToken(preferences.mtTokenPath);
    const mtState = await getState(preferences.mtBaseUrl, token);
    if (mtState.watchState === "error") {
      return { state: { kind: "error", message: "MeetingTranscriber meldet einen unbekannten Status" }, protocols };
    }
    return { state: { kind: mtState.watchState }, protocols };
  } catch (error) {
    if (error instanceof TokenMissingError || error instanceof MTApiAuthError || error instanceof MTApiUnreachableError) {
      return { state: { kind: "error", message: error.message }, protocols };
    }
    return { state: { kind: "error", message: error instanceof Error ? error.message : String(error) }, protocols };
  }
}

function iconFor(state: ViewState): Icon {
  switch (state.kind) {
    case "recording":
      return Icon.CircleFilled;
    case "watching":
      return Icon.Eye;
    case "idle":
      return Icon.Pause;
    case "error":
      return Icon.Warning;
  }
}

function labelFor(state: ViewState): string {
  switch (state.kind) {
    case "recording":
      return "🔴 Recording";
    case "watching":
      return "👁 Watching";
    case "idle":
      return "⏸ Idle";
    case "error":
      return `⚠️ ${state.message}`;
  }
}

export default function Command() {
  const { data, isLoading } = useCachedPromise(loadStatus);

  const state = data?.state ?? { kind: "idle" as const };
  const protocols = data?.protocols ?? [];

  return (
    <MenuBarExtra icon={iconFor(state)} isLoading={isLoading} tooltip="MeetingTranscriber Recording Status">
      <MenuBarExtra.Item title={labelFor(state)} />
      <MenuBarExtra.Section title="Letzte Protokolle">
        {protocols.slice(0, 5).map((protocol) => (
          <MenuBarExtra.Item key={protocol.path} title={protocol.name} onAction={() => openProtocol(protocol.path)} />
        ))}
      </MenuBarExtra.Section>
      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Open MeetingTranscriber Settings" onAction={openMeetingTranscriberSettings} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
