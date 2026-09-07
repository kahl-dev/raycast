import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import { TeamCalendar } from "./lib/types";
import { addDays, formatGerman, parseIsoDate, startOfDay, toIso } from "./lib/dates";
import { statusInfo } from "./lib/status-codes";

interface WeekData {
  weekStart: string;
  weekDays: string[];
  rows: { name: string; statuses: string[] }[];
}

function mondayOf(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDaysToDate(date, offset));
}

function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function fetchWeekData(weekStartIso: string, noCache: boolean): Promise<WeekData> {
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStartIso, i));
  const monthsNeeded = new Set<string>(weekDays.map((d) => d.slice(0, 7)));

  const monthData = await Promise.all(
    Array.from(monthsNeeded).map((ym) =>
      runTbScript<TeamCalendar>("team-calendar.py", ["--month", ym, "--only-with-entries"], { noCache }),
    ),
  );

  const personMap = new Map<string, Map<string, string>>();

  for (const month of monthData) {
    const monthIso = `${month.year}-${String(month.month).padStart(2, "0")}`;
    for (const [personName, person] of Object.entries(month.statuses)) {
      let row = personMap.get(personName);
      if (!row) {
        row = new Map<string, string>();
        personMap.set(personName, row);
      }
      for (const day of person.days) {
        const iso = `${monthIso}-${String(day.day).padStart(2, "0")}`;
        if (day.status) {
          row.set(iso, day.status);
        }
      }
    }
  }

  const rows = Array.from(personMap.entries())
    .map(([name, days]) => ({
      name,
      statuses: weekDays.map((iso) => days.get(iso) ?? ""),
    }))
    .filter((row) => row.statuses.some((s) => s !== ""))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { weekStart: weekStartIso, weekDays, rows };
}

export default function TeamWeekCommand() {
  const [weekStart, setWeekStart] = useState<string>(toIso(mondayOf(new Date())));
  const [noCache, setNoCache] = useState(false);

  const { data, isLoading, revalidate } = useCachedPromise(fetchWeekData, [weekStart, noCache], {
    keepPreviousData: true,
  });

  const markdown = data ? buildMarkdown(data) : "Lade Team-Kalender …";
  const weekLabel = data ? `Woche ${formatGerman(data.weekStart)} – ${formatGerman(data.weekDays[4])}` : "Team-Kalender";

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={weekLabel}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Team-Kalender in Time-Butler öffnen"
            url={tbWebUrl("?ha=vac&ac=11")}
            icon={Icon.Globe}
          />
          <Action
            title="Vorwoche"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
            onAction={() => setWeekStart((iso) => addDays(iso, -7))}
          />
          <Action
            title="Folgewoche"
            icon={Icon.ArrowRight}
            shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
            onAction={() => setWeekStart((iso) => addDays(iso, 7))}
          />
          <Action
            title="Diese Woche"
            icon={Icon.House}
            shortcut={{ modifiers: ["cmd"], key: "0" }}
            onAction={() => setWeekStart(toIso(mondayOf(new Date())))}
          />
          <Action
            title="Aktualisieren"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => {
              setNoCache(true);
              revalidate();
            }}
          />
        </ActionPanel>
      }
    />
  );
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr"];

function buildMarkdown(data: WeekData): string {
  const headers = data.weekDays.map((iso, i) => {
    const date = parseIsoDate(iso);
    return `${WEEKDAY_LABELS[i]} ${date.getDate()}.${date.getMonth() + 1}.`;
  });

  const lines: string[] = [];
  lines.push(`# Team Heute Weg · Woche ${formatGerman(data.weekStart)}`);
  lines.push("");

  if (data.rows.length === 0) {
    lines.push("*Niemand in dieser Woche abwesend.*");
    return lines.join("\n");
  }

  lines.push(`| Person | ${headers.join(" | ")} |`);
  lines.push(`|---|${headers.map(() => "---").join("|")}|`);

  for (const row of data.rows) {
    const cells = row.statuses.map((code) => (code ? statusInfo(code).emoji : "·"));
    lines.push(`| ${row.name} | ${cells.join(" | ")} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`*${data.rows.length} Personen abwesend · ⌘← Vorwoche · ⌘→ Folgewoche · ⌘0 Diese Woche*`);

  return lines.join("\n");
}
