import { deflateSync } from "node:zlib";
import { PIXEL_FONT_GLYPH_HEIGHT, PIXEL_FONT_GLYPH_WIDTH, renderGlyphRows } from "./pixel-font";
import { Severity } from "./types";

// 24x44px = retina 2x of a 12x22pt menu-bar icon — matches the verified render-pill.mjs spike
// (see scratchpad) at the size that reads as a pill against the real menu bar.
const WIDTH = 24;
const HEIGHT = 44;
const CORNER_RADIUS = 10;
const TICK_THICKNESS_PIXELS = 3;
const FILL_STEP_PERCENT = 5;
const TICK_STEP_PERCENT = 10;

// Label column mimics iStat Menus' stacked "C P U" letter column, drawn left of the pill.
const LABEL_GLYPH_SCALE = 2;
const LABEL_GLYPH_WIDTH = PIXEL_FONT_GLYPH_WIDTH * LABEL_GLYPH_SCALE; // 6
const LABEL_GLYPH_HEIGHT = PIXEL_FONT_GLYPH_HEIGHT * LABEL_GLYPH_SCALE; // 10
const LABEL_COLUMN_MARGIN = 1; // px either side of the scaled glyph, keeps letters off the canvas edge
const LABEL_COLUMN_WIDTH = LABEL_GLYPH_WIDTH + LABEL_COLUMN_MARGIN * 2; // 8
const LABEL_GLYPH_GAP = 2; // vertical gap between two stacked letters
const LABEL_TO_PILL_GAP = 3; // gap between the label column and the pill

export type PillPalette = "green" | "orange" | "red" | "neutral";
export type PillTheme = "light" | "dark";

interface RgbaColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function rgba(red: number, green: number, blue: number, alpha: number): RgbaColor {
  return { red, green, blue, alpha: Math.round(alpha * 255) };
}

function hex(value: string): RgbaColor {
  return {
    red: parseInt(value.slice(1, 3), 16),
    green: parseInt(value.slice(3, 5), 16),
    blue: parseInt(value.slice(5, 7), 16),
    alpha: 255,
  };
}

const TRANSPARENT: RgbaColor = { red: 0, green: 0, blue: 0, alpha: 0 };

// Single tunable block (per the design feedback that the first spike's track/fill/tick colors
// were too close together to tell apart at menu-bar size) — every color used by renderPillPng
// lives here so it can be retuned in one place during a live visual-verification pass.
export const PILL_STYLE = {
  outline: {
    light: rgba(0, 0, 0, 0.35),
    dark: rgba(255, 255, 255, 0.35),
  },
  track: {
    light: rgba(120, 120, 128, 0.2),
    dark: rgba(120, 120, 128, 0.36),
  },
  fill: {
    green: { light: hex("#28bd4c"), dark: hex("#30d158") },
    orange: { light: hex("#f28f06"), dark: hex("#ff9f0a") },
    red: { light: hex("#e5382e"), dark: hex("#ff453a") },
  },
  tick: {
    light: rgba(40, 40, 40, 0.9),
    dark: rgba(255, 255, 255, 0.95),
  },
  // Apple's "secondary label" grays — the label column reads as a caption next to the pill,
  // not as a competing focal point.
  label: {
    light: rgba(60, 60, 67, 0.6),
    dark: rgba(255, 255, 255, 0.55),
  },
} as const;

const SEVERITY_PALETTE: Record<Severity, PillPalette> = {
  normal: "green",
  warning: "orange",
  critical: "red",
};

export function severityToPalette(severity: Severity): PillPalette {
  return SEVERITY_PALETTE[severity];
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

function quantize(percent: number, stepPercent: number): number {
  return clampPercent(Math.round(clampPercent(percent) / stepPercent) * stepPercent);
}

export function quantizeFillPercent(percent: number): number {
  return quantize(percent, FILL_STEP_PERCENT);
}

export function quantizeTickPercent(percent: number): number {
  return quantize(percent, TICK_STEP_PERCENT);
}

function fillColorFor(palette: PillPalette, theme: PillTheme): RgbaColor {
  if (palette === "neutral") {
    return PILL_STYLE.track[theme];
  }
  return PILL_STYLE.fill[palette][theme];
}

// Rounded-rect membership test for a width x height pill with the given corner radius, reused
// both for the outer pill outline and (via a 1px coordinate shift, see insidePillCore) for the
// inset core that the outline ring frames.
function insidePillShape(x: number, y: number, width: number, height: number, radius: number): boolean {
  if (y >= radius && y < height - radius) {
    return x >= 0 && x < width;
  }
  const centerY = y < radius ? radius : height - radius - 1;
  const centerX1 = radius;
  const centerX2 = width - radius - 1;
  const dy = y - centerY;
  if (dy * dy > radius * radius) {
    return false;
  }
  const halfChord = Math.sqrt(radius * radius - dy * dy);
  if (x < centerX1) {
    return centerX1 - x <= halfChord;
  }
  if (x > centerX2) {
    return x - centerX2 <= halfChord;
  }
  return true;
}

// The 1px outline ring is "inside the outer shape but not inside a shape inset by 1px on every
// side" — shifting by (1, 1) and shrinking width/height/radius by 1 turns that inset test back
// into the same insidePillShape check.
function insidePillCore(x: number, y: number): boolean {
  return insidePillShape(x - 1, y - 1, WIDTH - 2, HEIGHT - 2, CORNER_RADIUS - 1);
}

function isTickRow(y: number, tickRow: number | null): boolean {
  return tickRow !== null && y >= tickRow && y < tickRow + TICK_THICKNESS_PIXELS;
}

interface PixelContext {
  fillTopRow: number;
  tickRow: number | null;
  fillColor: RgbaColor;
  trackColor: RgbaColor;
  outlineColor: RgbaColor;
  tickColor: RgbaColor;
}

// The tick row overrides fill/track (it is drawn on top of whichever the fill level would have
// shown) but never overrides the outline ring, so the pill's frame stays a consistent color at
// every row, including the one the tick crosses.
function pixelColor(x: number, y: number, context: PixelContext): RgbaColor {
  if (!insidePillShape(x, y, WIDTH, HEIGHT, CORNER_RADIUS)) {
    return TRANSPARENT;
  }
  if (!insidePillCore(x, y)) {
    return context.outlineColor;
  }
  if (isTickRow(y, context.tickRow)) {
    return context.tickColor;
  }
  return y >= context.fillTopRow ? context.fillColor : context.trackColor;
}

interface LabelLayout {
  glyphs: boolean[][][]; // one PIXEL_FONT_GLYPH_HEIGHT x PIXEL_FONT_GLYPH_WIDTH matrix per letter
  topRow: number; // first glyph's starting row — centers the stacked letters vertically
}

// Stacks one glyph per letter top-to-bottom with LABEL_GLYPH_GAP between them, then centers the
// whole stack in the canvas height — mirrors iStat Menus' vertically-centered letter column.
function buildLabelLayout(label: string, canvasHeight: number): LabelLayout {
  const glyphs = Array.from(label).map((letter) => renderGlyphRows(letter));
  const stackedHeight = glyphs.length * LABEL_GLYPH_HEIGHT + (glyphs.length - 1) * LABEL_GLYPH_GAP;
  return { glyphs, topRow: Math.floor((canvasHeight - stackedHeight) / 2) };
}

function isLabelPixelLit(x: number, y: number, layout: LabelLayout): boolean {
  const relativeY = y - layout.topRow;
  if (relativeY < 0) {
    return false;
  }
  const glyphStride = LABEL_GLYPH_HEIGHT + LABEL_GLYPH_GAP;
  const glyphIndex = Math.floor(relativeY / glyphStride);
  if (glyphIndex >= layout.glyphs.length) {
    return false;
  }
  const withinGlyphY = relativeY - glyphIndex * glyphStride;
  if (withinGlyphY >= LABEL_GLYPH_HEIGHT) {
    return false; // in the vertical gap row between two stacked letters
  }
  const relativeX = x - LABEL_COLUMN_MARGIN;
  if (relativeX < 0 || relativeX >= LABEL_GLYPH_WIDTH) {
    return false;
  }
  const sourceRow = Math.floor(withinGlyphY / LABEL_GLYPH_SCALE);
  const sourceColumn = Math.floor(relativeX / LABEL_GLYPH_SCALE);
  return layout.glyphs[glyphIndex][sourceRow][sourceColumn];
}

export interface RenderPillOptions {
  fillPercent: number;
  tickPercent: number | null;
  palette: PillPalette;
  theme: PillTheme;
  label?: string;
}

// Pure PNG encoder (PNG signature + IHDR/IDAT/IEND chunks, deflate via node:zlib) — zero
// dependencies beyond node:zlib, ported from the verified render-pill.mjs spike so it stays
// testable without @raycast/api ever entering the module graph.
export function renderPillPng(options: RenderPillOptions): Buffer {
  const fillPercent = quantizeFillPercent(options.fillPercent);
  const tickPercent = options.tickPercent === null ? null : quantizeTickPercent(options.tickPercent);

  const context: PixelContext = {
    fillTopRow: HEIGHT - Math.round((fillPercent / 100) * HEIGHT),
    tickRow: tickPercent === null ? null : HEIGHT - 1 - Math.round((tickPercent / 100) * (HEIGHT - 1)),
    fillColor: fillColorFor(options.palette, options.theme),
    trackColor: PILL_STYLE.track[options.theme],
    outlineColor: PILL_STYLE.outline[options.theme],
    tickColor: PILL_STYLE.tick[options.theme],
  };

  const labelLayout = options.label === undefined ? null : buildLabelLayout(options.label, HEIGHT);
  const labelColor = PILL_STYLE.label[options.theme];
  // No label -> pillOriginX 0 and canvasWidth WIDTH reproduce the pre-label output byte-for-byte.
  const pillOriginX = labelLayout === null ? 0 : LABEL_COLUMN_WIDTH + LABEL_TO_PILL_GAP;
  const canvasWidth = pillOriginX + WIDTH;

  const rows: Buffer[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row = Buffer.alloc(1 + canvasWidth * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < canvasWidth; x++) {
      // x values in the label-to-pill gap fall through to pixelColor with a negative local x,
      // which insidePillShape already treats as outside the shape (transparent) — no extra branch.
      const color =
        labelLayout !== null && x < LABEL_COLUMN_WIDTH
          ? isLabelPixelLit(x, y, labelLayout)
            ? labelColor
            : TRANSPARENT
          : pixelColor(x - pillOriginX, y, context);
      row.set([color.red, color.green, color.blue, color.alpha], 1 + x * 4);
    }
    rows.push(row);
  }

  return encodePng(canvasWidth, HEIGHT, Buffer.concat(rows));
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): number[] {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function encodePng(width: number, height: number, rawRows: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rawRows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
