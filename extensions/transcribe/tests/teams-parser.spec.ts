import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeSpeakerName,
  parseTeamsTranscript,
  formatAppTranscript,
  type TranscriptLine,
} from "../src/lib/teams-parser";

const FIXTURE_PATH = join(__dirname, "fixtures/teams-export.txt");
const fixtureText = readFileSync(FIXTURE_PATH, "utf8");

describe("normalizeSpeakerName", () => {
  it("strips an employer suffix introduced by ' - '", () => {
    expect(normalizeSpeakerName("Vanessa Jung - LOUIS INTERNET")).toEqual("Vanessa Jung");
  });

  it("converts 'Last, First' with a multi-word last name to 'First Last'", () => {
    expect(normalizeSpeakerName("de Hair, Patric")).toEqual("Patric de Hair");
  });

  it("converts a simple 'Last, First' to 'First Last'", () => {
    expect(normalizeSpeakerName("Biegert, Ralf")).toEqual("Ralf Biegert");
  });

  it("leaves a plain 'First Last' name unchanged", () => {
    expect(normalizeSpeakerName("Marcel Kopilas")).toEqual("Marcel Kopilas");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSpeakerName("  Marcel Kopilas  ")).toEqual("Marcel Kopilas");
  });

  it("strips everything from the first ' - ' onward, even with repeated ' - '", () => {
    expect(normalizeSpeakerName("Employee Name - Team A - EMEA")).toEqual("Employee Name");
  });

  it("returns an empty string unchanged for an empty input", () => {
    expect(normalizeSpeakerName("")).toEqual("");
  });
});

describe("parseTeamsTranscript", () => {
  const parsed = () => parseTeamsTranscript(fixtureText);

  it("returns an empty array for empty input", () => {
    expect(parseTeamsTranscript("")).toEqual([]);
  });

  it("extracts exactly the dialogue lines from the fixture, skipping headers, markers, blanks and garbage", () => {
    expect(parsed()).toHaveLength(10);
  });

  it("parses the first dialogue line with normalized speaker and integer seconds", () => {
    const [first] = parsed();
    expect(first).toEqual({
      seconds: 5,
      speaker: "Anna Beispiel",
      text: "Hallo zusammen, können wir loslegen?",
    });
  });

  it("normalizes a 'Last, First' speaker encountered in the transcript body", () => {
    const line = parsed().find((entry) => entry.text.startsWith("Grüß euch"));
    expect(line?.speaker).toEqual("Petra Vogel");
  });

  it("normalizes a speaker with an employer suffix encountered in the transcript body", () => {
    const line = parsed().find((entry) => entry.text.startsWith("Wir haben das Angebot"));
    expect(line?.speaker).toEqual("Anna Beispiel");
  });

  it("accepts a plain single-space separator between timestamp and text", () => {
    const line = parsed().find((entry) => entry.text.startsWith("Können wir das nochmal"));
    expect(line).toEqual({
      seconds: 45,
      speaker: "Max Mustermann",
      text: "Können wir das nochmal zusammenfassen?",
    });
  });

  it("parses an H:MM:SS timestamp past the one-hour mark into total seconds", () => {
    const line = parsed().find((entry) => entry.text.startsWith("Ich habe hier ein Update"));
    expect(line?.seconds).toEqual(3792);
  });

  it("preserves umlauts and emoji in the utterance text", () => {
    const line = parsed().find((entry) => entry.text.includes("👋"));
    expect(line?.text).toEqual("Grüß euch! 👋 Lasst uns mit der Übersicht starten.");
  });

  it("does not surface header, marker, blank, or garbage lines as dialogue entries", () => {
    const speakers = parsed().map((entry) => entry.speaker);
    expect(speakers).not.toContain("Projekt Sync");
    const texts = parsed().map((entry) => entry.text);
    expect(texts.some((text) => text.includes("started transcription"))).toEqual(false);
    expect(texts.some((text) => text.includes("garbage"))).toEqual(false);
  });
});

describe("formatAppTranscript", () => {
  it("formats a sub-minute entry as [MM:SS] Speaker: text", () => {
    const lines: TranscriptLine[] = [{ seconds: 5, speaker: "Anna", text: "Hi" }];
    expect(formatAppTranscript(lines)).toEqual("[00:05] Anna: Hi\n");
  });

  it("zero-pads minutes and seconds under an hour", () => {
    const lines: TranscriptLine[] = [{ seconds: 65, speaker: "Anna", text: "Hi" }];
    expect(formatAppTranscript(lines)).toEqual("[01:05] Anna: Hi\n");
  });

  it("switches to [H:MM:SS] at and past the one-hour mark", () => {
    const lines: TranscriptLine[] = [{ seconds: 3792, speaker: "Petra", text: "Update" }];
    expect(formatAppTranscript(lines)).toEqual("[1:03:12] Petra: Update\n");
  });

  it("does not zero-pad the hour digit beyond what the value needs", () => {
    const lines: TranscriptLine[] = [{ seconds: 36065, speaker: "Petra", text: "Long call" }];
    expect(formatAppTranscript(lines)).toEqual("[10:01:05] Petra: Long call\n");
  });

  it("joins multiple entries with newlines and ends with a trailing newline", () => {
    const lines: TranscriptLine[] = [
      { seconds: 5, speaker: "Anna", text: "Hi" },
      { seconds: 65, speaker: "Max", text: "Hello" },
    ];
    expect(formatAppTranscript(lines)).toEqual("[00:05] Anna: Hi\n[01:05] Max: Hello\n");
  });

  // Spec pins "trailing newline at end" for the general case; for zero entries the natural
  // reading is no content, hence no newline to trail.
  it("returns an empty string for an empty entry list", () => {
    expect(formatAppTranscript([])).toEqual("");
  });
});

describe("round-trip invariant", () => {
  it("produces exactly as many formatted lines as dialogue entries in the fixture", () => {
    const entries = parseTeamsTranscript(fixtureText);
    const formatted = formatAppTranscript(entries);
    const lineCount = formatted.split("\n").filter((line) => line.length > 0).length;
    expect(lineCount).toEqual(entries.length);
  });
});
