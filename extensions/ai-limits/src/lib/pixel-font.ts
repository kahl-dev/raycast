// 3x5 pixel bitmap font for the pill label column (mimics iStat Menus' stacked letter labels).
// Only the letters currently needed by pill commands are defined — CLD, FAB, OAI, SES reduce to
// C, L, D, F, A, B, O, I, S, E — kept minimal so every glyph shape stays reviewable in a diff.

export const PIXEL_FONT_GLYPH_WIDTH = 3;
export const PIXEL_FONT_GLYPH_HEIGHT = 5;

// Row strings use "#" for a lit pixel and "." for an unlit one — ASCII art keeps each glyph's
// shape visible in source instead of hidden behind bit-packed numbers.
const GLYPH_ROWS: Record<string, string[]> = {
  C: [".##", "#..", "#..", "#..", ".##"],
  L: ["#..", "#..", "#..", "#..", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  F: ["###", "#..", "##.", "#..", "#.."],
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  S: [".##", "#..", ".#.", "..#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
};

export function renderGlyphRows(letter: string): boolean[][] {
  const rows = GLYPH_ROWS[letter];
  if (rows === undefined) {
    throw new Error(`Kein Pixel-Font-Glyph für Buchstaben "${letter}" definiert`);
  }
  return rows.map((row) => row.split("").map((character) => character === "#"));
}
