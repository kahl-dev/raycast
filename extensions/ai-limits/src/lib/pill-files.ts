import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PillPalette, PillTheme } from "./pill";

// Content-addressed filename: identical rendering parameters always produce the same name, so a
// warm pills directory never needs a re-render — see ensurePillPngFile. fillPercent/tickPercent
// are expected to already be quantized (pill.ts's quantizeFillPercent/quantizeTickPercent) — this
// function only formats, it does not re-quantize. A null label omits the segment entirely rather
// than inserting a "none" placeholder, so pre-existing no-label filenames stay unchanged.
export function buildPillFileName(
  label: string | null,
  fillPercent: number,
  tickPercent: number | null,
  palette: PillPalette,
  theme: PillTheme,
): string {
  const tickSegment = tickPercent === null ? "none" : String(tickPercent);
  const labelSegment = label === null ? "" : `${label.toLowerCase()}-`;
  return `pill-${labelSegment}${fillPercent}-${tickSegment}-${palette}-${theme}.png`;
}

export function pillFilePath(pillsDirectory: string, fileName: string): string {
  return join(pillsDirectory, fileName);
}

export function pillFileExists(pillsDirectory: string, fileName: string): boolean {
  return existsSync(pillFilePath(pillsDirectory, fileName));
}

export function ensurePillsDirectory(pillsDirectory: string): void {
  mkdirSync(pillsDirectory, { recursive: true });
}

// Renders only on a cold cache: the bounded set of possible pill PNGs (fill x tick x palette x
// theme) is small and lazily built, so after warm-up this is a pure existence check — `render` is
// never invoked again for parameters already on disk. `render` is a plain injected function (not
// a Raycast API), which keeps this file free of any @raycast/api import and fully testable against
// a real temporary directory.
export function ensurePillPngFile(pillsDirectory: string, fileName: string, render: () => Buffer): string {
  ensurePillsDirectory(pillsDirectory);
  const filePath = pillFilePath(pillsDirectory, fileName);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, render());
  }
  return filePath;
}
