import { getPreferenceValues } from "@raycast/api";
import fs from "fs/promises";
import path from "path";

interface Preferences {
  vaultTranscriptsDir: string;
}

interface SearchTranscriptsInput {
  query: string;
}

interface Match {
  file: string;
  line: number;
  excerpt: string;
}

const MAX_MATCHES = 10;
const MAX_EXCERPT_LENGTH = 300;

function buildExcerpt(lines: string[], matchIndex: number): string {
  const start = Math.max(0, matchIndex - 1);
  const end = Math.min(lines.length, matchIndex + 2);
  const excerpt = lines.slice(start, end).join(" ").trim();
  return excerpt.length > MAX_EXCERPT_LENGTH ? `${excerpt.slice(0, MAX_EXCERPT_LENGTH)}...` : excerpt;
}

function isSearchable(name: string): boolean {
  const extension = path.extname(name).toLowerCase();
  return extension === ".md" || extension === ".txt";
}

export default async function tool(input: SearchTranscriptsInput): Promise<Match[]> {
  const preferences = getPreferenceValues<Preferences>();
  const query = input.query.trim().toLowerCase();
  if (query === "") return [];

  const dir = preferences.vaultTranscriptsDir;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const matches: Match[] = [];

  for (const name of entries) {
    if (!isSearchable(name)) continue;
    if (matches.length >= MAX_MATCHES) break;

    const filePath = path.join(dir, name);
    const content = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (content === null) continue;

    const lines = content.split(/\r\n|\r|\n/);

    for (let index = 0; index < lines.length; index++) {
      if (matches.length >= MAX_MATCHES) break;
      if (!lines[index].toLowerCase().includes(query)) continue;

      matches.push({ file: filePath, line: index + 1, excerpt: buildExcerpt(lines, index) });
    }
  }

  return matches;
}
