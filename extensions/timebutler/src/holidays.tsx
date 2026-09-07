import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript } from "./lib/tb-shellout";
import { HolidaysResponse } from "./lib/types";
import { daysUntil, formatGerman, parseIsoDate } from "./lib/dates";

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

async function fetchHolidays(year: number, noCache: boolean): Promise<HolidaysResponse> {
  return runTbScript<HolidaysResponse>("holidays.py", ["--year", String(year)], { noCache });
}

export default function HolidaysCommand() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [noCache, setNoCache] = useState(false);
  const { data, isLoading, revalidate } = useCachedPromise(fetchHolidays, [year, noCache], {
    keepPreviousData: true,
  });

  return (
    <List isLoading={isLoading} navigationTitle={`Feiertage ${data?.region ?? "NRW"} ${year}`}>
      <List.Section title={`${year} · ${data?.count ?? 0} Feiertage  (⌘← Vorjahr · ⌘→ Folgejahr)`}>
        {data?.holidays.map((holiday) => {
          const weekday = WEEKDAY_LABELS[parseIsoDate(holiday.date).getDay()];
          const days = daysUntil(holiday.date);
          const countdown =
            days < 0 ? "vergangen" : days === 0 ? "heute" : days === 1 ? "morgen" : `in ${days} Tagen`;
          return (
            <List.Item
              key={holiday.date}
              title={holiday.name}
              subtitle={`${weekday}, ${formatGerman(holiday.date)}`}
              accessories={[{ tag: countdown }]}
              icon={days >= 0 && days <= 30 ? Icon.Calendar : Icon.Dot}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard title="Datum kopieren" content={formatGerman(holiday.date)} />
                  <Action.CopyToClipboard title="ISO-Datum kopieren" content={holiday.date} />
                  <Action
                    title="Vorjahr"
                    icon={Icon.ArrowLeft}
                    shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
                    onAction={() => setYear((y) => y - 1)}
                  />
                  <Action
                    title="Folgejahr"
                    icon={Icon.ArrowRight}
                    shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
                    onAction={() => setYear((y) => y + 1)}
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
        })}
      </List.Section>
    </List>
  );
}
