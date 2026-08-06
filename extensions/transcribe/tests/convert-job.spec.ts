import { describe, it, expect } from "vitest";
import { slugify, buildConvertPlan } from "../src/lib/convert-job";

describe("slugify", () => {
  it("lowercases, keeps unicode letters, and joins words with underscores", () => {
    expect(slugify("Abstimmung Camos x Hörmann x LIA")).toEqual("abstimmung_camos_x_hörmann_x_lia");
  });

  it("collapses repeated separators into a single underscore", () => {
    expect(slugify("Foo   Bar--Baz")).toEqual("foo_bar_baz");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  Leading and Trailing  ")).toEqual("leading_and_trailing");
  });

  it("keeps digits", () => {
    expect(slugify("Meeting 42 Q3")).toEqual("meeting_42_q3");
  });

  it("keeps umlauts and ß", () => {
    expect(slugify("Straße Größe")).toEqual("straße_größe");
  });

  it("collapses mixed punctuation separators (slash, colon, space) into one underscore", () => {
    expect(slugify("Q3/Q4: Review")).toEqual("q3_q4_review");
  });

  it("treats tabs and newlines as separators", () => {
    expect(slugify("Line1\nLine2\tLine3")).toEqual("line1_line2_line3");
  });

  it("returns an empty string for an empty title", () => {
    expect(slugify("")).toEqual("");
  });

  it("returns an empty string when the title is only separators", () => {
    expect(slugify("   ---   ")).toEqual("");
  });
});

describe("buildConvertPlan", () => {
  it("builds the basename as YYYYMMDD_HHMM_<slug>_teams with matching txt/md paths", () => {
    const now = new Date(2026, 7, 6, 13, 4, 0);
    const plan = buildConvertPlan(
      "/Users/kahl/Downloads/Abstimmung Camos x Hörmann x LIA.docx",
      "/Users/kahl/Vault/Protocols",
      now
    );
    expect(plan.basename).toEqual("20260806_1304_abstimmung_camos_x_hörmann_x_lia_teams");
    expect(plan.txtPath).toEqual("/Users/kahl/Vault/Protocols/20260806_1304_abstimmung_camos_x_hörmann_x_lia_teams.txt");
    expect(plan.mdPath).toEqual("/Users/kahl/Vault/Protocols/20260806_1304_abstimmung_camos_x_hörmann_x_lia_teams.md");
  });

  it("zero-pads single-digit month, day, hour, and minute", () => {
    const now = new Date(2026, 0, 5, 9, 7, 0);
    const plan = buildConvertPlan("/tmp/Weekly Report.docx", "/tmp/out", now);
    expect(plan.basename).toEqual("20260105_0907_weekly_report_teams");
  });

  it("strips only the final extension from the source filename when slugifying", () => {
    const now = new Date(2026, 7, 6, 13, 4, 0);
    const plan = buildConvertPlan("/tmp/Weekly Report v2.final.vtt", "/tmp/out", now);
    expect(plan.basename).toEqual("20260806_1304_weekly_report_v2_final_teams");
  });

  it("includes every required anchor section in the Claude prompt", () => {
    const now = new Date(2026, 7, 6, 13, 4, 0);
    const plan = buildConvertPlan("/tmp/Weekly Sync.docx", "/tmp/out", now);
    for (const anchor of [
      "Meeting Protocol",
      "## Summary",
      "## Participants",
      "## Topics Discussed",
      "## Decisions",
      "## Tasks",
      "## Open Questions",
    ]) {
      expect(plan.claudePrompt).toContain(anchor);
    }
  });

  it("instructs the model to answer in German", () => {
    const now = new Date(2026, 7, 6, 13, 4, 0);
    const plan = buildConvertPlan("/tmp/Weekly Sync.docx", "/tmp/out", now);
    const mentionsGerman = plan.claudePrompt.includes("German") || plan.claudePrompt.includes("Deutsch");
    expect(mentionsGerman).toEqual(true);
  });

  it("produces a non-empty Claude prompt", () => {
    const now = new Date(2026, 7, 6, 13, 4, 0);
    const plan = buildConvertPlan("/tmp/Weekly Sync.docx", "/tmp/out", now);
    expect(plan.claudePrompt.length).toBeGreaterThan(0);
  });
});
