import { describe, expect, it } from "vitest";
import { PIXEL_FONT_GLYPH_HEIGHT, PIXEL_FONT_GLYPH_WIDTH, renderGlyphRows } from "./pixel-font";

const DEFINED_LETTERS = ["C", "L", "D", "F", "A", "B", "O", "I", "S", "E"];

describe("renderGlyphRows", () => {
  it("declares a 3x5 glyph size", () => {
    expect(PIXEL_FONT_GLYPH_WIDTH).to.equal(3);
    expect(PIXEL_FONT_GLYPH_HEIGHT).to.equal(5);
  });

  for (const letter of DEFINED_LETTERS) {
    it(`renders "${letter}" as a ${PIXEL_FONT_GLYPH_WIDTH}x${PIXEL_FONT_GLYPH_HEIGHT} boolean matrix`, () => {
      const rows = renderGlyphRows(letter);
      expect(rows.length).to.equal(PIXEL_FONT_GLYPH_HEIGHT);
      for (const row of rows) {
        expect(row.length).to.equal(PIXEL_FONT_GLYPH_WIDTH);
      }
    });
  }

  it("every defined glyph is distinct from every other defined glyph", () => {
    const rendered = DEFINED_LETTERS.map((letter) => JSON.stringify(renderGlyphRows(letter)));
    const unique = new Set(rendered);
    expect(unique.size).to.equal(DEFINED_LETTERS.length);
  });

  it("boundary: throws a specific error for an unsupported letter", () => {
    expect(() => renderGlyphRows("Z")).to.throw(/Z/);
  });

  it("boundary: throws for an empty string", () => {
    expect(() => renderGlyphRows("")).to.throw();
  });
});
