import { homedir } from "os";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { SpokenlyTranscription, DateFilter } from "./types";

const HISTORY_DIR = join(
  homedir(),
  "Library/Containers/app.spokenly/Data/Library/Application Support/Spokenly/History"
);

const CF_TO_UNIX_OFFSET = 978307200; // Seconds between 1970-01-01 and 2001-01-01

function cfTimestampToUnix(cfTimestamp: number): number {
  return Math.floor(cfTimestamp) + CF_TO_UNIX_OFFSET;
}

function formatDate(cfTimestamp: number): string {
  const unixTimestamp = cfTimestampToUnix(cfTimestamp);
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m${secs.toString().padStart(2, "0")}s`;
}

function getAllJsonFiles(): string[] {
  const files: Array<{ path: string; mtime: number }> = [];

  try {
    const dateDirs = readdirSync(HISTORY_DIR);

    for (const dateDir of dateDirs) {
      const datePath = join(HISTORY_DIR, dateDir);
      const stat = statSync(datePath);

      if (stat.isDirectory()) {
        const jsonFiles = readdirSync(datePath).filter((file) => file.endsWith(".json"));

        for (const jsonFile of jsonFiles) {
          const fullPath = join(datePath, jsonFile);
          const fileStat = statSync(fullPath);
          files.push({ path: fullPath, mtime: fileStat.mtimeMs });
        }
      }
    }
  } catch (error) {
    console.error("Error reading Spokenly history directory:", error);
    return [];
  }

  // Sort by modification time (most recent first)
  files.sort((a, b) => b.mtime - a.mtime);

  return files.map((f) => f.path);
}

function parseJsonFile(filePath: string): SpokenlyTranscription | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    // Extract transcription text
    const segments = data.content?.dictation?._0?.success?._0?.result?.transcriptionData?.segments;
    if (!segments || !Array.isArray(segments)) {
      return null;
    }

    const text = segments.map((seg: { text?: string }) => seg.text || "").join("");
    if (!text) {
      return null;
    }

    // Extract metadata
    const creationDate = data.creationDate || 0;
    const duration = data.content?.dictation?._0?.success?._0?.result?.audioFile?.duration || 0;
    const modelId = data.content?.dictation?._0?.success?._0?.result?.modelId || "";
    const audioPath = data.content?.dictation?._0?.success?._0?.result?.audioFile?.path || "";
    const audioSize = data.content?.dictation?._0?.success?._0?.result?.audioFile?.size || 0;

    // Use file path as ID
    const id = filePath;

    return {
      id,
      text,
      creationDate,
      duration,
      modelId,
      audioPath,
      audioSize,
    };
  } catch (error) {
    console.error(`Error parsing JSON file ${filePath}:`, error);
    return null;
  }
}

function filterByDate(transcriptions: SpokenlyTranscription[], filter: DateFilter): SpokenlyTranscription[] {
  if (filter === DateFilter.All) {
    return transcriptions;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
  const yesterdayStart = todayStart - 86400; // 24 hours in seconds
  const weekStart = Math.floor(Date.now() / 1000) - 7 * 86400;

  return transcriptions.filter((t) => {
    const unixTimestamp = cfTimestampToUnix(t.creationDate);

    switch (filter) {
      case DateFilter.Today:
        return unixTimestamp >= todayStart;
      case DateFilter.Yesterday:
        return unixTimestamp >= yesterdayStart && unixTimestamp < todayStart;
      case DateFilter.Week:
        return unixTimestamp >= weekStart;
      default:
        return true;
    }
  });
}

export async function loadTranscriptions(dateFilter: DateFilter = DateFilter.All): Promise<SpokenlyTranscription[]> {
  const jsonFiles = getAllJsonFiles();
  const transcriptions: SpokenlyTranscription[] = [];

  for (const filePath of jsonFiles) {
    const transcription = parseJsonFile(filePath);
    if (transcription) {
      transcriptions.push(transcription);
    }
  }

  return filterByDate(transcriptions, dateFilter);
}

export function exportToFile(transcription: SpokenlyTranscription): void {
  const { writeFileSync } = require("fs");
  const { homedir } = require("os");
  const { join } = require("path");

  const desktopDir = join(homedir(), "Desktop");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
  const filename = `spokenly-${timestamp}-${Date.now()}.txt`;
  const filepath = join(desktopDir, filename);

  const content = [
    "Spokenly Transcription",
    `Date: ${formatDate(transcription.creationDate)}`,
    transcription.duration ? `Duration: ${formatDuration(transcription.duration)}` : "",
    "",
    transcription.text,
  ]
    .filter(Boolean)
    .join("\n");

  writeFileSync(filepath, content, "utf-8");
}

export { formatDate };
