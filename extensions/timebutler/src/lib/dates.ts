export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatGerman(iso: string): string {
  const date = parseIsoDate(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatGermanShort(iso: string): string {
  const date = parseIsoDate(iso);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;
}

export function formatRangeGerman(startIso: string, endIso: string): string {
  if (startIso === endIso) {
    return formatGerman(startIso);
  }
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${pad(start.getDate())}.-${pad(end.getDate())}.${pad(start.getMonth() + 1)}.${start.getFullYear()}`;
  }
  return `${formatGerman(startIso)}-${formatGerman(endIso)}`;
}

export function daysUntil(iso: string): number {
  const target = parseIsoDate(iso);
  const today = startOfDay(new Date());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
