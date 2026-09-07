import { Holiday } from "./types";
import { addDays, isWeekend, parseIsoDate, toIso } from "./dates";

export interface BridgeDayOption {
  vacationDays: string[];
  freeDays: string[];
  leverage: number;
  highlight: 0 | 1 | 2;
  description: string;
}

export type BridgeEntryType = "single" | "cluster";

export interface BridgeDayOpportunity {
  type: BridgeEntryType;
  holidayName: string;
  holidayDate: string;
  weekday: number;
  options: BridgeDayOption[];
}

const CLUSTER_WINDOW_DAYS = 14;
const MAX_OPTIONS_PER_HOLIDAY = 3;

export function computeBridges(holidays: Holiday[]): BridgeDayOpportunity[] {
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const holidaySet = new Set(sorted.map((h) => h.date));
  const result: BridgeDayOpportunity[] = [];

  for (const holiday of sorted) {
    const weekday = parseIsoDate(holiday.date).getDay();
    const options: BridgeDayOption[] = [];
    addSingleHolidayOptions(holiday.date, weekday, options);
    if (options.length > 0) {
      result.push({
        type: "single",
        holidayName: holiday.name,
        holidayDate: holiday.date,
        weekday,
        options: rankAndCap(options),
      });
    }
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (daysBetween(a.date, b.date) > CLUSTER_WINDOW_DAYS) {
      continue;
    }
    const option = buildClusterOption(a.date, b.date, holidaySet);
    if (!option) {
      continue;
    }
    result.push({
      type: "cluster",
      holidayName: `${a.name} + ${b.name}`,
      holidayDate: a.date,
      weekday: parseIsoDate(a.date).getDay(),
      options: [option],
    });
  }

  result.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  return result;
}

function addSingleHolidayOptions(holidayIso: string, weekday: number, out: BridgeDayOption[]): void {
  if (weekday === 2) {
    out.push(
      makeOption({
        vacationDays: [addDays(holidayIso, -1)],
        freeDays: [addDays(holidayIso, -3), addDays(holidayIso, -2), addDays(holidayIso, -1), holidayIso],
      }),
    );
  } else if (weekday === 4) {
    out.push(
      makeOption({
        vacationDays: [addDays(holidayIso, 1)],
        freeDays: [holidayIso, addDays(holidayIso, 1), addDays(holidayIso, 2), addDays(holidayIso, 3)],
      }),
    );
  } else if (weekday === 3) {
    out.push(
      makeOption({
        vacationDays: [addDays(holidayIso, -2), addDays(holidayIso, -1)],
        freeDays: [
          addDays(holidayIso, -4),
          addDays(holidayIso, -3),
          addDays(holidayIso, -2),
          addDays(holidayIso, -1),
          holidayIso,
        ],
      }),
    );
    out.push(
      makeOption({
        vacationDays: [addDays(holidayIso, 1), addDays(holidayIso, 2)],
        freeDays: [
          holidayIso,
          addDays(holidayIso, 1),
          addDays(holidayIso, 2),
          addDays(holidayIso, 3),
          addDays(holidayIso, 4),
        ],
      }),
    );
  }
}

function buildClusterOption(startIso: string, endIso: string, holidaySet: Set<string>): BridgeDayOption | null {
  const vacationDays: string[] = [];
  const freeDays: string[] = [startIso];

  let cursor = addDays(startIso, 1);
  while (cursor < endIso) {
    const date = parseIsoDate(cursor);
    if (isWeekend(date) || holidaySet.has(cursor)) {
      freeDays.push(cursor);
    } else {
      vacationDays.push(cursor);
      freeDays.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  freeDays.push(endIso);

  if (vacationDays.length === 0) {
    return null;
  }

  return makeOption({ vacationDays, freeDays });
}

function makeOption(p: { vacationDays: string[]; freeDays: string[] }): BridgeDayOption {
  const leverage = p.freeDays.length / p.vacationDays.length;
  const highlight: 0 | 1 | 2 = leverage >= 3 ? 2 : leverage >= 2 ? 1 : 0;
  const vacWord = p.vacationDays.length === 1 ? "Urlaubstag" : "Urlaubstage";
  const description = `${p.vacationDays.length} ${vacWord} → ${p.freeDays.length} Tage frei`;
  return { ...p, leverage, highlight, description };
}

function rankAndCap(options: BridgeDayOption[]): BridgeDayOption[] {
  return [...options].sort((a, b) => b.leverage - a.leverage).slice(0, MAX_OPTIONS_PER_HOLIDAY);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatRangeShort(isoDates: string[]): string {
  if (isoDates.length === 0) {
    return "";
  }
  const sorted = [...isoDates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) {
    return germanShort(first);
  }
  return `${germanShort(first)}–${germanShort(last)}`;
}

function germanShort(iso: string): string {
  const date = parseIsoDate(iso);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  return `${day < 10 ? `0${day}` : day}.${month < 10 ? `0${month}` : month}.`;
}

export function highlightBolt(highlight: 0 | 1 | 2): string {
  if (highlight === 2) return "⚡⚡";
  if (highlight === 1) return "⚡";
  return "";
}

export { toIso };
