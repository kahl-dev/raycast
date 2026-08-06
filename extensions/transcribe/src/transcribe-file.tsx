import { Action, ActionPanel, Form, getPreferenceValues, getSelectedFinderItems, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runConvertJob } from "./lib/convert-job";
import { UnsupportedFileError, routeFile } from "./lib/file-router";
import { enqueueAudioJob, MTApiAuthError, MTApiUnreachableError, readToken, TokenMissingError } from "./lib/mt-api";

interface Preferences {
  protocolsDir: string;
  claudeBin: string;
  mtBaseUrl: string;
  mtTokenPath: string;
}

export default function Command() {
  const [files, setFiles] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    getSelectedFinderItems()
      .then((items) => {
        if (items.length > 0) setFiles([items[0].path]);
      })
      .catch(() => {
        // Finder not frontmost, or nothing selected — expected, leave the picker empty.
      });
  }, []);

  async function handleSubmit(values: { files: string[] }) {
    const filePath = values.files[0];
    if (!filePath) {
      await showToast({ style: Toast.Style.Failure, title: "Keine Datei ausgewählt" });
      return;
    }

    const preferences = getPreferenceValues<Preferences>();
    setIsSubmitting(true);

    try {
      const route = routeFile(filePath);

      if (route === "convert") {
        runConvertJob({ sourcePath: filePath, outputDir: preferences.protocolsDir, claudeBin: preferences.claudeBin });
        await showToast({ style: Toast.Style.Success, title: "Konvertierung gestartet — Notification folgt" });
        return;
      }

      const token = readToken(preferences.mtTokenPath);
      const { jobId } = await enqueueAudioJob(preferences.mtBaseUrl, token, filePath);
      await showToast({ style: Toast.Style.Success, title: "Audio-Job eingereiht", message: `Job ${jobId}` });
    } catch (error) {
      if (
        error instanceof UnsupportedFileError ||
        error instanceof TokenMissingError ||
        error instanceof MTApiUnreachableError ||
        error instanceof MTApiAuthError
      ) {
        await showToast({ style: Toast.Style.Failure, title: "Fehlgeschlagen", message: error.message });
        return;
      }
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehlgeschlagen",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Verarbeiten" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="Datei"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles
        value={files}
        onChange={setFiles}
      />
    </Form>
  );
}
