import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  PILL_STYLE,
  PillPalette,
  PillTheme,
  quantizeFillPercent,
  quantizeTickPercent,
  renderPillPng,
  severityToPalette,
} from "./pill";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Test-only PNG decoder: walks the chunk stream this same encoder produces (fixed IHDR/IDAT/IEND
// order, no ancillary chunks) and inflates IDAT back to raw scanlines, so pixel-level assertions
// (e.g. "the tick row is actually the tick color") verify real behavior instead of "did not throw".
function decodePng(buffer: Buffer): { width: number; height: number; pixelAt: (x: number, y: number) => number[] } {
  let offset = 8; // skip signature
  let width = 0;
  let height = 0;
  let idat: Buffer | null = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") {
      idat = data;
    }
    offset = dataStart + length + 4; // skip CRC
  }
  if (idat === null) {
    throw new Error("PNG-Testdaten enthalten kein IDAT-Chunk");
  }
  const raw = inflateSync(idat);
  const stride = 1 + width * 4;
  return {
    width,
    height,
    pixelAt: (x, y) => {
      const pixelStart = y * stride + 1 + x * 4;
      return [raw[pixelStart], raw[pixelStart + 1], raw[pixelStart + 2], raw[pixelStart + 3]];
    },
  };
}

describe("renderPillPng", () => {
  it("starts with the PNG signature", () => {
    const buffer = renderPillPng({ fillPercent: 40, tickPercent: 60, palette: "green", theme: "dark" });
    expect(Array.from(buffer.subarray(0, 8))).to.deep.equal(PNG_SIGNATURE);
  });

  it("declares 24x44 dimensions in IHDR", () => {
    const buffer = renderPillPng({ fillPercent: 40, tickPercent: 60, palette: "orange", theme: "light" });
    expect(buffer.readUInt32BE(16)).to.equal(24);
    expect(buffer.readUInt32BE(20)).to.equal(44);
  });

  it("is byte-for-byte deterministic for identical input", () => {
    const options = { fillPercent: 55, tickPercent: 30, palette: "red" as const, theme: "dark" as const };
    const first = renderPillPng(options);
    const second = renderPillPng(options);
    expect(first.equals(second)).to.equal(true);
  });

  it("differs between two different fill percentages", () => {
    const low = renderPillPng({ fillPercent: 10, tickPercent: null, palette: "green", theme: "dark" });
    const high = renderPillPng({ fillPercent: 90, tickPercent: null, palette: "green", theme: "dark" });
    expect(low.equals(high)).to.equal(false);
  });

  const palettes: PillPalette[] = ["green", "orange", "red", "neutral"];
  const themes: PillTheme[] = ["light", "dark"];
  for (const palette of palettes) {
    for (const theme of themes) {
      it(`renders a valid PNG for palette "${palette}" and theme "${theme}"`, () => {
        const buffer = renderPillPng({ fillPercent: 50, tickPercent: 50, palette, theme });
        expect(Array.from(buffer.subarray(0, 8))).to.deep.equal(PNG_SIGNATURE);
      });
    }
  }

  it("paints the tick row with the tick color, overriding fill/track but not the outline", () => {
    const buffer = renderPillPng({ fillPercent: 0, tickPercent: 50, palette: "green", theme: "dark" });
    const decoded = decodePng(buffer);
    const tickRow = decoded.height - 1 - Math.round((50 / 100) * (decoded.height - 1));
    const centerX = Math.floor(decoded.width / 2);
    expect(decoded.pixelAt(centerX, tickRow)).to.deep.equal([
      PILL_STYLE.tick.dark.red,
      PILL_STYLE.tick.dark.green,
      PILL_STYLE.tick.dark.blue,
      PILL_STYLE.tick.dark.alpha,
    ]);
  });

  it("omits the tick row entirely when tickPercent is null", () => {
    const fillPercent = 0;
    const tickPercent = 50;
    const withTick = decodePng(renderPillPng({ fillPercent, tickPercent, palette: "green", theme: "dark" }));
    const withoutTick = decodePng(renderPillPng({ fillPercent, tickPercent: null, palette: "green", theme: "dark" }));
    const tickRow = withTick.height - 1 - Math.round((tickPercent / 100) * (withTick.height - 1));
    const centerX = Math.floor(withTick.width / 2);

    expect(withTick.pixelAt(centerX, tickRow)).to.deep.equal([
      PILL_STYLE.tick.dark.red,
      PILL_STYLE.tick.dark.green,
      PILL_STYLE.tick.dark.blue,
      PILL_STYLE.tick.dark.alpha,
    ]);
    // fillPercent 0 means every row is "track" absent a tick — confirms the tick omission falls
    // back to track color rather than leaving a stale tick-colored row.
    expect(withoutTick.pixelAt(centerX, tickRow)).to.deep.equal([
      PILL_STYLE.track.dark.red,
      PILL_STYLE.track.dark.green,
      PILL_STYLE.track.dark.blue,
      PILL_STYLE.track.dark.alpha,
    ]);
  });

  it("outer corner pixel is transparent (outside the pill shape)", () => {
    const buffer = renderPillPng({ fillPercent: 50, tickPercent: null, palette: "neutral", theme: "light" });
    const decoded = decodePng(buffer);
    expect(decoded.pixelAt(0, 0)).to.deep.equal([0, 0, 0, 0]);
  });
});

describe("renderPillPng with a label", () => {
  it("widens the canvas by the label column plus gap, leaving height at 44", () => {
    const buffer = renderPillPng({ fillPercent: 40, tickPercent: 70, palette: "green", theme: "dark", label: "CLD" });
    expect(buffer.readUInt32BE(16)).to.equal(35); // 8px label column + 3px gap + 24px pill
    expect(buffer.readUInt32BE(20)).to.equal(44);
  });

  it("boundary: a single-letter label still produces the widened canvas", () => {
    const buffer = renderPillPng({ fillPercent: 0, tickPercent: null, palette: "neutral", theme: "light", label: "I" });
    expect(buffer.readUInt32BE(16)).to.equal(35);
  });

  it("reproduces the exact no-label pill pixels, shifted right by the label column and gap", () => {
    const withoutLabel = decodePng(
      renderPillPng({ fillPercent: 65, tickPercent: 40, palette: "orange", theme: "dark" }),
    );
    const withLabel = decodePng(
      renderPillPng({ fillPercent: 65, tickPercent: 40, palette: "orange", theme: "dark", label: "FAB" }),
    );
    const xOffset = withLabel.width - withoutLabel.width;
    for (let y = 0; y < withoutLabel.height; y++) {
      for (let x = 0; x < withoutLabel.width; x++) {
        expect(withLabel.pixelAt(x + xOffset, y)).to.deep.equal(withoutLabel.pixelAt(x, y));
      }
    }
  });

  it("paints at least one label-colored pixel in the label column", () => {
    const buffer = renderPillPng({
      fillPercent: 0,
      tickPercent: null,
      palette: "neutral",
      theme: "dark",
      label: "OAI",
    });
    const decoded = decodePng(buffer);
    const labelColor = [
      PILL_STYLE.label.dark.red,
      PILL_STYLE.label.dark.green,
      PILL_STYLE.label.dark.blue,
      PILL_STYLE.label.dark.alpha,
    ];
    let foundLabelPixel = false;
    for (let y = 0; y < decoded.height && !foundLabelPixel; y++) {
      for (let x = 0; x < 8; x++) {
        if (decoded.pixelAt(x, y).every((channel, index) => channel === labelColor[index])) {
          foundLabelPixel = true;
          break;
        }
      }
    }
    expect(foundLabelPixel).to.equal(true);
  });

  it("leaves the gap between label column and pill fully transparent", () => {
    const buffer = renderPillPng({ fillPercent: 100, tickPercent: null, palette: "red", theme: "light", label: "SES" });
    const decoded = decodePng(buffer);
    for (let y = 0; y < decoded.height; y++) {
      expect(decoded.pixelAt(9, y)).to.deep.equal([0, 0, 0, 0]);
      expect(decoded.pixelAt(10, y)).to.deep.equal([0, 0, 0, 0]);
    }
  });

  it("differs between two different label texts with otherwise identical options", () => {
    const first = renderPillPng({ fillPercent: 50, tickPercent: 50, palette: "green", theme: "dark", label: "CLD" });
    const second = renderPillPng({ fillPercent: 50, tickPercent: 50, palette: "green", theme: "dark", label: "SES" });
    expect(first.equals(second)).to.equal(false);
  });

  it("is byte-for-byte deterministic for identical input including the label", () => {
    const options = {
      fillPercent: 30,
      tickPercent: 20,
      palette: "red" as const,
      theme: "light" as const,
      label: "OAI",
    };
    expect(renderPillPng(options).equals(renderPillPng(options))).to.equal(true);
  });

  it("failure mode: propagates the pixel-font error for an unsupported label letter", () => {
    expect(() =>
      renderPillPng({ fillPercent: 0, tickPercent: null, palette: "neutral", theme: "dark", label: "ZZZ" }),
    ).to.throw(/Z/);
  });
});

describe("quantizeFillPercent", () => {
  it("boundary: 0 stays 0", () => {
    expect(quantizeFillPercent(0)).to.equal(0);
  });

  it("boundary: 100 stays 100", () => {
    expect(quantizeFillPercent(100)).to.equal(100);
  });

  it("boundary: clamps values above 100 to 100", () => {
    expect(quantizeFillPercent(104)).to.equal(100);
  });

  it("boundary: clamps negative values to 0", () => {
    expect(quantizeFillPercent(-5)).to.equal(0);
  });

  it("rounds to the nearest 5-percent step", () => {
    expect(quantizeFillPercent(42)).to.equal(40);
    expect(quantizeFillPercent(43)).to.equal(45);
  });
});

describe("quantizeTickPercent", () => {
  it("boundary: 0 stays 0", () => {
    expect(quantizeTickPercent(0)).to.equal(0);
  });

  it("boundary: 100 stays 100", () => {
    expect(quantizeTickPercent(100)).to.equal(100);
  });

  it("rounds to the nearest 10-percent step", () => {
    expect(quantizeTickPercent(44)).to.equal(40);
    expect(quantizeTickPercent(46)).to.equal(50);
  });
});

describe("severityToPalette", () => {
  it("maps normal, warning, and critical to green, orange, and red respectively", () => {
    expect(severityToPalette("normal")).to.equal("green");
    expect(severityToPalette("warning")).to.equal("orange");
    expect(severityToPalette("critical")).to.equal("red");
  });
});
