export interface TranscriptLine {
  seconds: number;
  speaker: string;
  text: string;
}

const MARKER_LINE_PATTERN = /started transcription|stopped transcription/i;

// U+2028 LINE SEPARATOR is what Teams' own `textutil -convert txt` export inserts between the
// timestamp and the dialogue text in the common case; a single space is the fallback format. A
// raw U+2028 cannot appear inside a regex literal (it is a JS line terminator), so it is escaped.
// The character class matches only the FIRST separator after the timestamp; any further U+2028
// inside the utterance itself belongs to the captured text, not the separator. The dotAll "s"
// flag is required for that trailing "(.*)$" to reach the real end of the line even when the
// utterance embeds one of those additional U+2028s -- without it "." cannot cross a line
// terminator, so such lines silently failed to match at all.
const DIALOGUE_LINE_PATTERN = /^\s*(.+?)(?: {2,}|\t+)(\d{1,2}:\d{2}(?::\d{2})?)[\u2028 ](.*)$/s;

export function normalizeSpeakerName(raw: string): string {
  let name = raw.trim();

  const employerSeparatorIndex = name.indexOf(" - ");
  if (employerSeparatorIndex !== -1) {
    name = name.slice(0, employerSeparatorIndex).trim();
  }

  const commaIndex = name.indexOf(",");
  if (commaIndex !== -1 && name.indexOf(",", commaIndex + 1) === -1) {
    const last = name.slice(0, commaIndex).trim();
    const first = name.slice(commaIndex + 1).trim();
    name = `${first} ${last}`;
  }

  return name;
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseTeamsTranscript(rawText: string): TranscriptLine[] {
  const allLines = rawText.split(/\r\n|\r|\n/);

  // Header: line 1 `-Meeting Transcript`, line 2 date, line 3 duration — skip structurally.
  let bodyLines = allLines;
  if (bodyLines.length > 0 && bodyLines[0].includes("-Meeting Transcript")) {
    bodyLines = bodyLines.slice(3);
  }

  const result: TranscriptLine[] = [];

  for (const line of bodyLines) {
    if (MARKER_LINE_PATTERN.test(line)) continue;

    const match = DIALOGUE_LINE_PATTERN.exec(line);
    if (!match) continue;

    const [, speakerRaw, timestamp, text] = match;
    result.push({
      seconds: parseTimestampToSeconds(timestamp),
      speaker: normalizeSpeakerName(speakerRaw),
      text: text.trim(),
    });
  }

  return result;
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds >= 3600) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatAppTranscript(lines: TranscriptLine[]): string {
  if (lines.length === 0) return "";
  return lines.map((line) => `[${formatTimestamp(line.seconds)}] ${line.speaker}: ${line.text}`).join("\n") + "\n";
}
