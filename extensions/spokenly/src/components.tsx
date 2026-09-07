import { List, ActionPanel, Action } from "@raycast/api";
import { SpokenlyTranscription } from "./types";
import { formatDate, formatDuration, formatFileSize, exportToFile } from "./utils";

export function TranscriptionListItem(props: { transcription: SpokenlyTranscription }) {
  const t = props.transcription;
  const preview = t.text.substring(0, 100) + (t.text.length > 100 ? "..." : "");

  const accessories = [{ text: `⏱️ ${formatDuration(t.duration)}` }];
  if (t.audioSize > 0) {
    accessories.push({ text: `💾 ${formatFileSize(t.audioSize)}` });
  }

  return (
    <List.Item
      title={preview}
      subtitle={formatDate(t.creationDate)}
      accessories={accessories}
      quickLook={t.audioPath ? { path: t.audioPath } : undefined}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Main">
            <Action.CopyToClipboard content={t.text} />
            <Action.Paste content={t.text} />
          </ActionPanel.Section>

          {t.audioPath && (
            <ActionPanel.Section title="Audio">
              <Action.ToggleQuickLook />
              <Action.Open target={t.audioPath} title="Play Audio" />
              <Action.ShowInFinder path={t.audioPath} />
              <Action.CopyToClipboard
                title="Copy Audio Path"
                content={t.audioPath}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
            </ActionPanel.Section>
          )}

          <ActionPanel.Section title="Export">
            <Action
              title="Export to File"
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              onAction={() => exportToFile(t)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
