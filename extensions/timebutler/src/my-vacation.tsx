import { Action, ActionPanel, Detail, Icon } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import { AbsencesResponse, Vacation } from "./lib/types";
import { daysUntil, formatGerman } from "./lib/dates";

interface VacationData {
  vacation: Vacation;
  nextVacation: { start: string; end: string; summary: string } | null;
}

async function fetchVacationData(noCache: boolean): Promise<VacationData> {
  const [vacation, upcoming] = await Promise.all([
    runTbScript<Vacation>("vacation.py", [], { noCache }),
    runTbScript<AbsencesResponse>("absences.py", ["--upcoming", "--type", "urlaub"], { noCache }),
  ]);
  const next = upcoming.events[0];
  return {
    vacation,
    nextVacation: next ? { start: next.start, end: next.end, summary: next.summary } : null,
  };
}

export default function MyVacation() {
  const [noCache, setNoCache] = useState(false);
  const { data, isLoading, revalidate } = useCachedPromise(fetchVacationData, [noCache], {
    keepPreviousData: true,
  });

  const markdown = data ? buildMarkdown(data) : "Lade Urlaubsstand …";

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Time-Butler öffnen" url={tbWebUrl()} icon={Icon.Globe} />
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
      metadata={data ? <Metadata data={data} /> : undefined}
    />
  );
}

function Metadata({ data }: { data: VacationData }) {
  const { vacation, nextVacation } = data;
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Resturlaub" text={`${vacation.remaining.toFixed(1)} Tage`} icon={Icon.Sun} />
      <Detail.Metadata.Label title="Geplant" text={`${vacation.planned.toFixed(1)} Tage`} />
      <Detail.Metadata.Label title="Anspruch" text={`${vacation.entitled.toFixed(1)} Tage`} />
      {vacation.carryover > 0 && (
        <Detail.Metadata.Label title="Übertrag" text={`${vacation.carryover.toFixed(1)} Tage`} />
      )}
      {vacation.special_leave > 0 && (
        <Detail.Metadata.Label title="Sonderurlaub" text={`${vacation.special_leave.toFixed(1)} Tage`} />
      )}
      <Detail.Metadata.Separator />
      {nextVacation ? (
        <>
          <Detail.Metadata.Label title="Nächster Urlaub" text={formatGerman(nextVacation.start)} icon={Icon.Calendar} />
          <Detail.Metadata.Label title="Tage bis Start" text={`${daysUntil(nextVacation.start)} Tage`} />
          <Detail.Metadata.Label title="Bis" text={formatGerman(nextVacation.end)} />
        </>
      ) : (
        <Detail.Metadata.Label title="Nächster Urlaub" text="Nicht geplant" />
      )}
    </Detail.Metadata>
  );
}

function buildMarkdown(data: VacationData): string {
  const { vacation, nextVacation } = data;
  const bigNumber = vacation.remaining.toFixed(1);
  const lines: string[] = [`# 🏖 ${bigNumber} Tage Rest`, ""];

  if (nextVacation) {
    const days = daysUntil(nextVacation.start);
    const startFmt = formatGerman(nextVacation.start);
    if (days < 0) {
      lines.push(`*Aktueller Urlaub: ${nextVacation.summary} (seit ${startFmt})*`);
    } else if (days === 0) {
      lines.push(`*Heute startet: ${nextVacation.summary}*`);
    } else {
      lines.push(`*Nächster Urlaub in ${days} Tagen — ${startFmt} (${nextVacation.summary})*`);
    }
  } else {
    lines.push("*Kein Urlaub geplant.*");
  }

  return lines.join("\n");
}
