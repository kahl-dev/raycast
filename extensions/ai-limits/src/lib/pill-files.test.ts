import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPillFileName, ensurePillPngFile, ensurePillsDirectory, pillFileExists, pillFilePath } from "./pill-files";

let pillsDirectory: string;

beforeEach(() => {
  pillsDirectory = join(mkdtempSync(join(tmpdir(), "ai-limits-pill-files-")), "pills");
});

afterEach(() => {
  rmSync(pillsDirectory, { recursive: true, force: true });
});

describe("buildPillFileName", () => {
  it("formats fill, tick, palette, and theme into the content-addressed name when there is no label", () => {
    expect(buildPillFileName(null, 45, 70, "green", "dark")).to.equal("pill-45-70-green-dark.png");
  });

  it("uses 'none' as the tick segment when tickPercent is null", () => {
    expect(buildPillFileName(null, 0, null, "neutral", "light")).to.equal("pill-0-none-neutral-light.png");
  });

  it("boundary: formats the 0 and 100 percent extremes", () => {
    expect(buildPillFileName(null, 0, 0, "red", "light")).to.equal("pill-0-0-red-light.png");
    expect(buildPillFileName(null, 100, 100, "red", "dark")).to.equal("pill-100-100-red-dark.png");
  });

  it("inserts the lowercased label as a segment right after the 'pill-' prefix", () => {
    expect(buildPillFileName("CLD", 40, 70, "green", "dark")).to.equal("pill-cld-40-70-green-dark.png");
  });

  it("boundary: lowercases a single-letter label", () => {
    expect(buildPillFileName("I", 0, null, "neutral", "light")).to.equal("pill-i-0-none-neutral-light.png");
  });
});

describe("ensurePillsDirectory", () => {
  it("creates the directory recursively when it does not exist yet", () => {
    expect(existsSync(pillsDirectory)).to.equal(false);
    ensurePillsDirectory(pillsDirectory);
    expect(existsSync(pillsDirectory)).to.equal(true);
  });

  it("boundary: does not throw when the directory already exists", () => {
    ensurePillsDirectory(pillsDirectory);
    expect(() => ensurePillsDirectory(pillsDirectory)).to.not.throw();
    expect(existsSync(pillsDirectory)).to.equal(true);
  });
});

describe("pillFileExists", () => {
  it("returns false before the file has been written", () => {
    expect(pillFileExists(pillsDirectory, "pill-0-none-neutral-light.png")).to.equal(false);
  });

  it("returns true after ensurePillPngFile has written it", () => {
    const fileName = "pill-0-none-neutral-light.png";
    ensurePillPngFile(pillsDirectory, fileName, () => Buffer.from([1, 2, 3]));
    expect(pillFileExists(pillsDirectory, fileName)).to.equal(true);
  });
});

describe("ensurePillPngFile", () => {
  it("creates the pills directory and writes the rendered buffer on a cold cache", () => {
    const fileName = "pill-50-none-green-dark.png";
    const filePath = ensurePillPngFile(pillsDirectory, fileName, () => Buffer.from([9, 9, 9]));
    expect(filePath).to.equal(pillFilePath(pillsDirectory, fileName));
    expect(Array.from(readFileSync(filePath))).to.deep.equal([9, 9, 9]);
  });

  it("does not call render again once the file already exists on disk", () => {
    const fileName = "pill-50-none-green-dark.png";
    let renderCallCount = 0;
    const render = (): Buffer => {
      renderCallCount += 1;
      return Buffer.from([renderCallCount]);
    };

    ensurePillPngFile(pillsDirectory, fileName, render);
    ensurePillPngFile(pillsDirectory, fileName, render);

    expect(renderCallCount).to.equal(1);
  });

  it("keeps the first render's bytes on disk when called again for the same name", () => {
    const fileName = "pill-50-none-green-dark.png";
    ensurePillPngFile(pillsDirectory, fileName, () => Buffer.from([1]));
    const filePath = ensurePillPngFile(pillsDirectory, fileName, () => Buffer.from([2]));

    expect(Array.from(readFileSync(filePath))).to.deep.equal([1]);
  });
});
