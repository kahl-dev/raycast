import { execFileSync, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { formatAppTranscript, parseTeamsTranscript } from "./teams-parser";

export interface ConvertPlan {
  basename: string;
  txtPath: string;
  mdPath: string;
  claudePrompt: string;
}

const CLAUDE_PROMPT = `You are a professional meeting minute taker.
Create a structured meeting protocol in German (Deutsch) from the following transcript.
Return ONLY the finished Markdown document - no explanations.
Use exactly this structure:
# Meeting Protocol - [Meeting Title]
**Date:** [Date from context or today]
---
## Summary
## Participants
## Topics Discussed
## Decisions
## Tasks
| Task | Responsible | Deadline | Priority |
## Open Questions
Do NOT include the full transcript in the output - it will be appended automatically.
`;

export function slugify(title: string): string {
  return title
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildConvertPlan(sourcePath: string, outputDir: string, now: Date): ConvertPlan {
  const datePrefix = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  const sourceName = path.basename(sourcePath, path.extname(sourcePath));
  const basename = `${datePrefix}_${slugify(sourceName)}_teams`;

  return {
    basename,
    txtPath: path.join(outputDir, `${basename}.txt`),
    mdPath: path.join(outputDir, `${basename}.md`),
    claudePrompt: CLAUDE_PROMPT,
  };
}

function extractRawText(sourcePath: string): string {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === ".docx") {
    return execFileSync("textutil", ["-convert", "txt", "-stdout", sourcePath], { encoding: "utf-8" });
  }
  return fs.readFileSync(sourcePath, "utf-8");
}

// Single-quote a value for zsh, escaping embedded single quotes via the standard '\'' trick.
function zshQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// buildConvertPlan is pure and does not know about the filesystem, so its basename can collide
// with a prior run's output (e.g. two conversions of the same source file within the same
// minute). Find the first basename (optionally suffixed _2, _3, ...) for which NEITHER the .txt
// nor the .md path already exists, so this run never clobbers a previous one.
function resolveUnusedPaths(outputDir: string, basename: string): { basename: string; txtPath: string; mdPath: string } {
  for (let suffix = 1; ; suffix++) {
    const candidateBasename = suffix === 1 ? basename : `${basename}_${suffix}`;
    const txtPath = path.join(outputDir, `${candidateBasename}.txt`);
    const mdPath = path.join(outputDir, `${candidateBasename}.md`);
    if (!fs.existsSync(txtPath) && !fs.existsSync(mdPath)) {
      return { basename: candidateBasename, txtPath, mdPath };
    }
  }
}

export function runConvertJob(opts: { sourcePath: string; outputDir: string; claudeBin: string }): void {
  const { sourcePath, outputDir, claudeBin } = opts;
  const plan = buildConvertPlan(sourcePath, outputDir, new Date());

  const rawText = extractRawText(sourcePath);
  const transcriptLines = parseTeamsTranscript(rawText);
  if (transcriptLines.length === 0) {
    throw new Error(
      `No dialogue lines found in "${sourcePath}". Expected a Teams transcript export (the "textutil -convert txt" output of a Teams meeting transcript .docx) with lines shaped "Speaker<2+ spaces or tab>M:SS<space or line separator>text".`,
    );
  }
  const transcript = formatAppTranscript(transcriptLines);

  const { basename, txtPath, mdPath } = resolveUnusedPaths(outputDir, plan.basename);
  fs.writeFileSync(txtPath, transcript);

  const promptPath = path.join(os.tmpdir(), `transcribe-prompt-${Date.now()}.txt`);
  const protocolTmpPath = path.join(os.tmpdir(), `transcribe-protocol-${Date.now()}.txt`);
  fs.writeFileSync(promptPath, plan.claudePrompt);

  const successNotification = `display notification "Protokoll erstellt: ${basename}.md" with title "Transcribe"`;
  const failureNotification = `display notification "Protokoll-Erstellung fehlgeschlagen: ${basename}" with title "Transcribe" subtitle "Fehler"`;

  const scriptPath = path.join(os.tmpdir(), `transcribe-convert-${Date.now()}.sh`);

  const script = `#!/bin/zsh
if cat ${zshQuote(promptPath)} ${zshQuote(txtPath)} | ${zshQuote(claudeBin)} -p --output-format text --model sonnet > ${zshQuote(protocolTmpPath)}; then
  {
    cat ${zshQuote(protocolTmpPath)}
    printf '\\n\\n---\\n\\n## Full Transcript\\n\\n'
    cat ${zshQuote(txtPath)}
  } > ${zshQuote(mdPath)}
  osascript -e ${zshQuote(successNotification)}
else
  osascript -e ${zshQuote(failureNotification)}
fi
rm -f ${zshQuote(promptPath)} ${zshQuote(protocolTmpPath)} ${zshQuote(scriptPath)}
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const child = spawn("zsh", [scriptPath], { detached: true, stdio: "ignore" });
  child.on("exit", () => {});
  child.unref();
}
