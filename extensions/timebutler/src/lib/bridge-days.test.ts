import { describe, expect, it } from "vitest";
import { computeBridges } from "./bridge-days";
import { Holiday } from "./types";

const NRW_2026: Holiday[] = [
  { date: "2026-01-01", name: "Neujahr", full_day: true, recurring: true, fixed: true },
  { date: "2026-04-03", name: "Karfreitag", full_day: true, recurring: true, fixed: false },
  { date: "2026-04-06", name: "Ostermontag", full_day: true, recurring: true, fixed: false },
  { date: "2026-05-01", name: "Tag der Arbeit", full_day: true, recurring: true, fixed: true },
  { date: "2026-05-14", name: "Christi Himmelfahrt", full_day: true, recurring: true, fixed: false },
  { date: "2026-05-25", name: "Pfingstmontag", full_day: true, recurring: true, fixed: false },
  { date: "2026-06-04", name: "Fronleichnam", full_day: true, recurring: true, fixed: false },
  { date: "2026-10-03", name: "Tag der Deutschen Einheit", full_day: true, recurring: true, fixed: true },
  { date: "2026-11-01", name: "Allerheiligen", full_day: true, recurring: true, fixed: true },
  { date: "2026-12-25", name: "1. Weihnachtsfeiertag", full_day: true, recurring: true, fixed: true },
  { date: "2026-12-26", name: "2. Weihnachtsfeiertag", full_day: true, recurring: true, fixed: true },
];

describe("computeBridges (NRW 2026)", () => {
  const bridges = computeBridges(NRW_2026);

  it("skips weekend holidays as single entries", () => {
    const taggerEinheit = bridges.filter((b) => b.type === "single" && b.holidayName === "Tag der Deutschen Einheit");
    expect(taggerEinheit).toEqual([]);
  });

  it("Fronleichnam single yields 4-day option with 1 vacation day", () => {
    const fronleichnam = bridges.find((b) => b.type === "single" && b.holidayName === "Fronleichnam");
    expect(fronleichnam).toBeDefined();
    const opt = fronleichnam!.options[0];
    expect(opt.vacationDays).toEqual(["2026-06-05"]);
    expect(opt.freeDays.length).toBe(4);
    expect(opt.highlight).toBe(2);
  });

  it("Christi Himmelfahrt single yields Thursday-bridge", () => {
    const ch = bridges.find((b) => b.type === "single" && b.holidayName === "Christi Himmelfahrt");
    expect(ch).toBeDefined();
    expect(ch!.options[0].vacationDays).toEqual(["2026-05-15"]);
  });

  it("emits cluster Christi Himmelfahrt + Pfingstmontag", () => {
    const cluster = bridges.find(
      (b) => b.type === "cluster" && b.holidayName === "Christi Himmelfahrt + Pfingstmontag",
    );
    expect(cluster).toBeDefined();
    expect(cluster!.options[0].vacationDays.length).toBe(6);
    expect(cluster!.options[0].freeDays.length).toBe(12);
    expect(cluster!.options[0].leverage).toBe(2);
  });

  it("emits cluster Pfingstmontag + Fronleichnam", () => {
    const cluster = bridges.find(
      (b) => b.type === "cluster" && b.holidayName === "Pfingstmontag + Fronleichnam",
    );
    expect(cluster).toBeDefined();
  });

  it("does not emit cluster for Karfreitag + Ostermontag (no workdays between)", () => {
    const cluster = bridges.find((b) => b.type === "cluster" && b.holidayName.includes("Karfreitag"));
    expect(cluster).toBeUndefined();
  });

  it("does not emit cluster for 1. + 2. Weihnachtsfeiertag (consecutive)", () => {
    const cluster = bridges.find((b) => b.type === "cluster" && b.holidayName.includes("Weihnachtsfeiertag"));
    expect(cluster).toBeUndefined();
  });

  it("options per entry sorted by leverage descending", () => {
    for (const bridge of bridges) {
      for (let i = 0; i < bridge.options.length - 1; i += 1) {
        expect(bridge.options[i].leverage).toBeGreaterThanOrEqual(bridge.options[i + 1].leverage);
      }
    }
  });

  it("Fronleichnam has highlight 2 (leverage ≥ 3)", () => {
    const opt = bridges.find((b) => b.holidayName === "Fronleichnam")?.options[0];
    expect(opt?.highlight).toBe(2);
  });
});

describe("computeBridges edge cases", () => {
  it("returns empty for empty holidays", () => {
    expect(computeBridges([])).toEqual([]);
  });

  it("returns empty for a single Monday holiday (no bridge needed, no cluster)", () => {
    const mondayOnly: Holiday[] = [
      { date: "2026-01-05", name: "Test-Montag", full_day: true, recurring: false, fixed: true },
    ];
    expect(computeBridges(mondayOnly)).toEqual([]);
  });

  it("entries are sorted by date", () => {
    const result = computeBridges(NRW_2026);
    for (let i = 0; i < result.length - 1; i += 1) {
      expect(result[i].holidayDate <= result[i + 1].holidayDate).toBe(true);
    }
  });
});
