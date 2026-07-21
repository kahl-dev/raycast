import { describe, expect, it } from "vitest";
import { bucket } from "./__fixtures__/bucket";
import { PILL_COMMAND_KINDS, pillCommandName, pillLabelForKind, selectPillBucket } from "./pill-selection";

const session = bucket({ id: "anthropic:session", label: "Session", percent: 30 });
const weeklyAll = bucket({ id: "anthropic:weekly_all", label: "Woche", percent: 12 });
const fableLow = bucket({ id: "anthropic:weekly_scoped:fable", label: "Fable", percent: 8 });
const fableHigh = bucket({ id: "anthropic:weekly_scoped:opus", label: "Opus", percent: 40 });
const openaiPrimary = bucket({ id: "openai:primary", provider: "openai", label: "OpenAI", percent: 55 });
const openaiSecondary = bucket({
  id: "openai:secondary",
  provider: "openai",
  label: "OpenAI (sekundär)",
  percent: 90,
});

describe("selectPillBucket", () => {
  it("claude-week finds the anthropic:weekly_all bucket", () => {
    expect(selectPillBucket("claude-week", [session, weeklyAll])).to.deep.equal(weeklyAll);
  });

  it("boundary: claude-week returns null when weekly_all is missing", () => {
    expect(selectPillBucket("claude-week", [session])).to.equal(null);
  });

  it("session finds the anthropic:session bucket", () => {
    expect(selectPillBucket("session", [session, weeklyAll])).to.deep.equal(session);
  });

  it("boundary: session returns null when the bucket list is empty", () => {
    expect(selectPillBucket("session", [])).to.equal(null);
  });

  it("openai finds openai:primary specifically, ignoring a higher-percent secondary bucket", () => {
    expect(selectPillBucket("openai", [openaiSecondary, openaiPrimary])).to.deep.equal(openaiPrimary);
  });

  it("boundary: openai returns null when only a secondary bucket exists", () => {
    expect(selectPillBucket("openai", [openaiSecondary])).to.equal(null);
  });

  it("fable picks the highest-percent weekly_scoped bucket", () => {
    expect(selectPillBucket("fable", [fableLow, fableHigh])).to.deep.equal(fableHigh);
  });

  it("boundary: fable returns null when no weekly_scoped bucket exists", () => {
    expect(selectPillBucket("fable", [weeklyAll, session])).to.equal(null);
  });

  it("boundary: every selector returns null for an empty bucket list", () => {
    for (const kind of PILL_COMMAND_KINDS) {
      expect(selectPillBucket(kind, [])).to.equal(null);
    }
  });
});

describe("PILL_COMMAND_KINDS", () => {
  it("contains exactly the four pill kinds in a stable order", () => {
    expect(PILL_COMMAND_KINDS).to.deep.equal(["claude-week", "fable", "openai", "session"]);
  });
});

describe("pillCommandName", () => {
  it("prefixes every kind with 'pill-' to form its package.json command name", () => {
    expect(pillCommandName("claude-week")).to.equal("pill-claude-week");
    expect(pillCommandName("fable")).to.equal("pill-fable");
    expect(pillCommandName("openai")).to.equal("pill-openai");
    expect(pillCommandName("session")).to.equal("pill-session");
  });
});

describe("pillLabelForKind", () => {
  it("maps every pill kind to its fixed 3-letter label", () => {
    expect(pillLabelForKind("claude-week")).to.equal("CLD");
    expect(pillLabelForKind("fable")).to.equal("FAB");
    expect(pillLabelForKind("openai")).to.equal("OAI");
    expect(pillLabelForKind("session")).to.equal("SES");
  });

  it("invariant: every kind in PILL_COMMAND_KINDS resolves to a defined label", () => {
    for (const kind of PILL_COMMAND_KINDS) {
      expect(pillLabelForKind(kind)).to.be.a("string").with.length.greaterThan(0);
    }
  });
});
