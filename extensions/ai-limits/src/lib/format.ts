import { secondsUntil } from "./types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export function formatTimeShort(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Coarse "biggest unit first" duration, matching the tmux statusline countdown style: days+hours
// once at least a day remains, hours+minutes once at least an hour remains, otherwise just minutes.
export function formatDurationShort(seconds: number): string {
  if (seconds >= SECONDS_PER_DAY) {
    const days = Math.floor(seconds / SECONDS_PER_DAY);
    const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    return `${days}d ${hours}h`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${hours}h ${minutes}m`;
  }
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`;
}

export function formatWeekdayAndTime(date: Date, now: Date = new Date()): string {
  const time = formatTimeShort(date);
  const isSameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isSameDay) {
    return time;
  }

  return `${WEEKDAY_LABELS[date.getDay()]} ${time}`;
}

export function formatReset(date: Date, now: Date = new Date()): string {
  const base = formatWeekdayAndTime(date, now);
  const secondsUntilReset = secondsUntil(date, now);

  if (secondsUntilReset <= 0) {
    return base;
  }

  return `${base} (in ${formatDurationShort(secondsUntilReset)})`;
}
