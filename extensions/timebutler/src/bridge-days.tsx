import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import { HolidaysResponse } from "./lib/types";
import { BridgeDayOpportunity, computeBridges, formatRangeShort, highlightBolt } from "./lib/bridge-days";
import { daysUntil, formatGerman } from "./lib/dates";

interface BridgeData {
  opportunities: BridgeDayOpportunity[];
  years: number[];
}

async function fetchBridges(noCache: boolean): Promise<BridgeData> {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const [current, next] = await Promise.all([
    runTbScript<HolidaysResponse>("holidays.py", ["--year", String(currentYear)], { noCache }),
    runTbScript<HolidaysResponse>("holidays.py", ["--year", String(nextYear)], { noCache }),
  ]);
  const merged = [...current.holidays, ...next.holidays];
  const opportunities = computeBridges(merged).filter((opp) => daysUntil(opp.holidayDate) >= -1);
  return { opportunities, years: [currentYear, nextYear] };
}

export default function BridgeDaysCommand() {
  const [noCache, setNoCache] = useState(false);
  const { data, isLoading, revalidate } = useCachedPromise(fetchBridges, [noCache], {
    keepPreviousData: true,
  });

  return (
    <List
      isLoading={isLoading}
      navigationTitle={data ? `Brückentage ${data.years.join(" + ")}` : "Brückentage"}
      searchBarPlaceholder="Feiertag suchen …"
    >
      {data?.opportunities.length === 0 ? (
        <List.EmptyView icon={Icon.Calendar} title="Keine Brückentag-Optionen" />
      ) : (
        data?.opportunities.map((opp) => (
          <BridgeSection
            key={opp.holidayDate}
            opp={opp}
            onForceRefresh={() => {
              setNoCache(true);
              revalidate();
            }}
          />
        ))
      )}
    </List>
  );
}

function BridgeSection({ opp, onForceRefresh }: { opp: BridgeDayOpportunity; onForceRefresh: () => void }) {
  const days = daysUntil(opp.holidayDate);
  const countdown = days < 0 ? "vergangen" : days === 0 ? "heute" : `in ${days} Tagen`;
  return (
    <List.Section title={`${opp.holidayName} · ${formatGerman(opp.holidayDate)} · ${countdown}`}>
      {opp.options.map((option) => {
        const range = formatRangeShort(option.vacationDays);
        const bolt = highlightBolt(option.highlight);
        return (
          <List.Item
            key={range + option.vacationDays.length}
            title={`${option.description} ${bolt}`.trim()}
            subtitle={`Urlaubstage: ${range}`}
            accessories={[{ tag: { value: `Hebel ×${option.leverage.toFixed(1)}` } }]}
            icon={option.highlight === 2 ? Icon.Star : option.highlight === 1 ? Icon.Bolt : Icon.Calendar}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Urlaubstage-Range kopieren"
                  content={range}
                  icon={Icon.CopyClipboard}
                />
                <Action.CopyToClipboard
                  title="Alle Urlaubstage (kommagetrennt) kopieren"
                  content={option.vacationDays.map((d) => formatGerman(d)).join(", ")}
                  icon={Icon.CopyClipboard}
                />
                <Action.OpenInBrowser
                  title="Time-Butler Urlaubsantrag öffnen"
                  url={tbWebUrl("?ha=user&ac=3")}
                  icon={Icon.Globe}
                />
                <Action
                  title="Aktualisieren"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={onForceRefresh}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List.Section>
  );
}
