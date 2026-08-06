import { describe, it, expect } from "vitest";
import { routeFile, UnsupportedFileError, type Route } from "../src/lib/file-router";

const CONVERT_EXTENSIONS = [".docx", ".txt", ".vtt"];
const AUDIO_EXTENSIONS = [".wav", ".m4a", ".mp3", ".mp4", ".flac"];

function expectUnsupported(filePath: string, expectedFragment: string): void {
  expect(() => routeFile(filePath)).toThrow(UnsupportedFileError);
  try {
    routeFile(filePath);
    throw new Error(`expected routeFile(${JSON.stringify(filePath)}) to throw`);
  } catch (error) {
    if (!(error instanceof UnsupportedFileError)) throw error;
    const message = error.message.toLowerCase();
    expect(message).toContain(expectedFragment.toLowerCase());
    for (const supported of [...CONVERT_EXTENSIONS, ...AUDIO_EXTENSIONS]) {
      expect(message).toContain(supported.replace(".", "").toLowerCase());
    }
  }
}

describe("routeFile — convert extensions", () => {
  it.each(CONVERT_EXTENSIONS)("routes %s to \"convert\"", (ext) => {
    const route: Route = routeFile(`meeting${ext}`);
    expect(route).toEqual("convert");
  });

  it("routes an uppercase convert extension case-insensitively", () => {
    expect(routeFile("MEETING.DOCX")).toEqual("convert");
  });

  it("routes a convert extension inside a full path", () => {
    expect(routeFile("/Users/kahl/Downloads/Weekly Sync.docx")).toEqual("convert");
  });
});

describe("routeFile — audio extensions", () => {
  it.each(AUDIO_EXTENSIONS)("routes %s to \"audio\"", (ext) => {
    const route: Route = routeFile(`recording${ext}`);
    expect(route).toEqual("audio");
  });

  it("routes an uppercase audio extension case-insensitively", () => {
    expect(routeFile("RECORDING.WAV")).toEqual("audio");
  });
});

describe("routeFile — unsupported input", () => {
  it("throws UnsupportedFileError naming the offending extension for an unknown extension", () => {
    expectUnsupported("photo.png", "png");
  });

  it("throws UnsupportedFileError for a file with no extension", () => {
    expect(() => routeFile("README")).toThrow(UnsupportedFileError);
  });

  it("throws UnsupportedFileError for a dotfile", () => {
    expect(() => routeFile(".gitignore")).toThrow(UnsupportedFileError);
  });

  it("throws UnsupportedFileError for an empty string", () => {
    expect(() => routeFile("")).toThrow(UnsupportedFileError);
  });

  it("throws UnsupportedFileError whose message lists every supported extension", () => {
    expectUnsupported("archive.zip", "zip");
  });
});
