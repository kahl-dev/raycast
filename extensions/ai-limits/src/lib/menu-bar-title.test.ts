import { describe, expect, it } from "vitest";
import { bucket } from "./__fixtures__/bucket";
import { buildMenuBarTitle } from "./menu-bar-title";

// Every fixed character asserted via explicit \u escape (not the literal glyph) so a test failure
// or a diff never hides an accidental substitution of a visually similar character for the wrong
// codepoint.
const THIN_SPACE = " "; // U+2009 THIN SPACE — the slot separator
const DASH = "–"; // U+2013 EN DASH — missing-bucket placeholder
const SESSION_LABEL = "ˢ"; // U+02E2 MODIFIER LETTER SMALL S
const WEEKLY_ALL_LABEL = "ᵂ"; // U+1D42 MODIFIER LETTER CAPITAL W
const WEEKLY_SCOPED_LABEL = "ᶠ"; // U+1DA0 MODIFIER LETTER SMALL F WITH HOOK
const OPENAI_PRIMARY_LABEL = "ᴳ"; // U+1D33 MODIFIER LETTER CAPITAL G

function expectedTitle(session: string, weeklyAll: string, weeklyScoped: string, openAiPrimary: string): string {
  return [session, weeklyAll, weeklyScoped, openAiPrimary].join(THIN_SPACE);
}

function normalBucket(id: string, percent: number, overrides: Partial<Parameters<typeof bucket>[0]> = {}) {
  return bucket({ id, percent, ...overrides });
}

describe("buildMenuBarTitle", () => {
  it("full-string example: all four slots present", () => {
    const buckets = [
      normalBucket("anthropic:session", 29),
      normalBucket("anthropic:weekly_all", 36),
      normalBucket("anthropic:weekly_scoped:fable", 20),
      normalBucket("openai:primary", 0, { provider: "openai" }),
    ];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}29`,
        `${WEEKLY_ALL_LABEL}36`,
        `${WEEKLY_SCOPED_LABEL}20`,
        `${OPENAI_PRIMARY_LABEL}0`,
      ),
    );
  });

  it("uses the exact superscript codepoints for each of the four slot labels", () => {
    const buckets = [
      normalBucket("anthropic:session", 1),
      normalBucket("anthropic:weekly_all", 2),
      normalBucket("anthropic:weekly_scoped:fable", 3),
      normalBucket("openai:primary", 4, { provider: "openai" }),
    ];
    const title = buildMenuBarTitle(buckets);
    expect(title).to.include(`${SESSION_LABEL}1`);
    expect(title).to.include(`${WEEKLY_ALL_LABEL}2`);
    expect(title).to.include(`${WEEKLY_SCOPED_LABEL}3`);
    expect(title).to.include(`${OPENAI_PRIMARY_LABEL}4`);
  });

  it("joins the four slots with exactly one THIN SPACE (U+2009) each", () => {
    const buckets = [normalBucket("anthropic:session", 1)];
    const title = buildMenuBarTitle(buckets);
    expect(title.split(THIN_SPACE).length - 1).to.equal(3);
    expect(title.includes(" ")).to.equal(false); // no regular ASCII space (U+0020) anywhere
  });

  it("boundary: every slot shows the dash placeholder for an empty bucket list", () => {
    expect(buildMenuBarTitle([])).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("missing-slot combination: only the session bucket present", () => {
    const buckets = [normalBucket("anthropic:session", 29)];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}29`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("missing-slot combination: only the weekly_all bucket present", () => {
    const buckets = [normalBucket("anthropic:weekly_all", 36)];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}36`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("missing-slot combination: only a weekly_scoped bucket present", () => {
    const buckets = [normalBucket("anthropic:weekly_scoped:opus", 52)];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}52`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("missing-slot combination: only openai:primary present", () => {
    const buckets = [normalBucket("openai:primary", 4, { provider: "openai" })];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}4`,
      ),
    );
  });

  it("picks the highest-percent weekly_scoped bucket for the F slot, not the first one found", () => {
    const buckets = [
      normalBucket("anthropic:weekly_scoped:fable", 20),
      normalBucket("anthropic:weekly_scoped:opus", 52),
    ];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}52`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("rounds each slot's percent (Math.round), no percent sign", () => {
    const buckets = [normalBucket("anthropic:session", 28.5)];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}29`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("rounds down below .5", () => {
    const buckets = [normalBucket("anthropic:session", 28.4)];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}28`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });

  it("ignores openai:secondary — only openai:primary feeds the G slot", () => {
    const buckets = [normalBucket("openai:secondary", 90, { provider: "openai" })];
    expect(buildMenuBarTitle(buckets)).to.equal(
      expectedTitle(
        `${SESSION_LABEL}${DASH}`,
        `${WEEKLY_ALL_LABEL}${DASH}`,
        `${WEEKLY_SCOPED_LABEL}${DASH}`,
        `${OPENAI_PRIMARY_LABEL}${DASH}`,
      ),
    );
  });
});
