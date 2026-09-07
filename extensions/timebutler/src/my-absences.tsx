import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import { AbsenceEvent, AbsenceType, AbsencesResponse } from "./lib/types";
import { absenceTypeEmoji, absenceTypeLabel } from "./lib/status-codes";
import { formatRangeGerman } from "./lib/dates";

type FilterValue = "upcoming" | "all" | AbsenceType;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "all", label: "Alle" },
  { value: "urlaub", label: "Urlaub" },
  { value: "krankheit", label: "Krankheit" },
  { value: "arzt", label: "Arzttermine" },
  { value: "aussentermin", label: "Außentermine" },
  { value: "dienstreise", label: "Dienstreisen" },
  { value: "behoerde", label: "Behörde" },
  { value: "sonderurlaub", label: "Sonderurlaub" },
];

async function fetchAbsences(filter: FilterValue, year: number, noCache: boolean): Promise<AbsencesResponse> {
  const args: string[] = [];
  if (filter === "upcoming") {
    args.push("--upcoming");
  } else {
    args.push("--year", String(year));
    if (filter !== "all") {
      args.push("--type", filter);
    }
  }
  return runTbScript<AbsencesResponse>("absences.py", args, { noCache });
}

export default function MyAbsences() {
  const [filter, setFilter] = useState<FilterValue>("upcoming");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [noCache, setNoCache] = useState(false);

  const { data, isLoading, revalidate } = useCachedPromise(fetchAbsences, [filter, year, noCache], {
    keepPreviousData: true,
  });

  const totalWorkdays = data?.events.reduce((sum, event) => sum + event.workdays, 0) ?? 0;
  const showYearControls = filter !== "upcoming";
  const sectionTitle = buildSectionTitle(filter, year, data?.events.length ?? 0, totalWorkdays);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Abwesenheit suchen …"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter"
          value={filter}
          onChange={(value) => setFilter(value as FilterValue)}
        >
          {FILTERS.map((f) => (
            <List.Dropdown.Item key={f.value} title={f.label} value={f.value} />
          ))}
        </List.Dropdown>
      }
    >
      {data?.events.length === 0 ? (
        <List.EmptyView
          icon={Icon.Calendar}
          title="Keine Einträge"
          description={showYearControls ? `Für ${year} liegen keine ${labelFor(filter)} vor.` : "Nichts upcoming."}
        />
      ) : (
        <List.Section title={sectionTitle}>
          {data?.events.map((event) => (
            <AbsenceItem
              key={event.uid}
              event={event}
              onForceRefresh={() => {
                setNoCache(true);
                revalidate();
              }}
              onPrevYear={showYearControls ? () => setYear((y) => y - 1) : undefined}
              onNextYear={showYearControls ? () => setYear((y) => y + 1) : undefined}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function AbsenceItem({
  event,
  onForceRefresh,
  onPrevYear,
  onNextYear,
}: {
  event: AbsenceEvent;
  onForceRefresh: () => void;
  onPrevYear?: () => void;
  onNextYear?: () => void;
}) {
  const emoji = absenceTypeEmoji(event.type);
  const label = absenceTypeLabel(event.type);
  const range = formatRangeGerman(event.start, event.end);
  const workdaysText = event.workdays === 1 ? "1 Tag" : `${event.workdays.toFixed(0)} Tage`;

  return (
    <List.Item
      title={`${emoji}  ${range}`}
      subtitle={event.summary || label}
      accessories={[
        { tag: { value: workdaysText } },
        { tag: { value: event.status } },
      ]}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="In Time-Butler öffnen"
            url={tbWebUrl("?ha=user&ac=3")}
            icon={Icon.Globe}
          />
          <Action.CopyToClipboard title="Datum kopieren" content={range} icon={Icon.CopyClipboard} />
          {onPrevYear && (
            <Action
              title="Vorjahr"
              icon={Icon.ArrowLeft}
              shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
              onAction={onPrevYear}
            />
          )}
          {onNextYear && (
            <Action
              title="Folgejahr"
              icon={Icon.ArrowRight}
              shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
              onAction={onNextYear}
            />
          )}
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
}

function buildSectionTitle(filter: FilterValue, year: number, count: number, workdays: number): string {
  if (filter === "upcoming") {
    return `Upcoming · ${count} Eintrag${count !== 1 ? "e" : ""}`;
  }
  const filterLabel = labelFor(filter);
  return `${filterLabel} ${year} · Σ ${workdays.toFixed(0)} Tage  (⌘← Vorjahr · ⌘→ Folgejahr)`;
}

function labelFor(filter: FilterValue): string {
  return FILTERS.find((f) => f.value === filter)?.label ?? "Abwesenheiten";
}
