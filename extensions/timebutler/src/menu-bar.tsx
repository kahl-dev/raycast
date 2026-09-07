import { Icon, MenuBarExtra, launchCommand, LaunchType, open } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import {
  AbsencesResponse,
  HolidaysResponse,
  TeamMember,
  TeamResponse,
  TeamToday,
  Vacation,
} from "./lib/types";
import { statusInfo } from "./lib/status-codes";
import { daysUntil, formatGermanShort, parseIsoDate } from "./lib/dates";
import { computeBridges, highlightBolt } from "./lib/bridge-days";

interface MenuBarData {
  vacation: Vacation;
  nextVacation: { start: string; summary: string } | null;
  today: TeamToday;
  emailByName: Map<string, string>;
  nextHoliday: { date: string; name: string; bridgeHint: string | null } | null;
}

const MAX_TEAM_AWAY_VISIBLE = 10;

async function fetchMenuBarData(): Promise<MenuBarData> {
  const currentYear = new Date().getFullYear();
  const [vacation, upcoming, today, team, holidays] = await Promise.all([
    runTbScript<Vacation>("vacation.py", []),
    runTbScript<AbsencesResponse>("absences.py", ["--upcoming", "--type", "urlaub"]),
    runTbScript<TeamToday>("team-today.py", []),
    runTbScript<TeamResponse>("team.py", []),
    runTbScript<HolidaysResponse>("holidays.py", ["--year", String(currentYear), "--upcoming"]),
  ]);

  const emailByName = new Map<string, string>();
  for (const member of team.members as TeamMember[]) {
    emailByName.set(member.name, member.email);
  }

  const nextVacEvent = upcoming.events[0];
  const nextVacation = nextVacEvent ? { start: nextVacEvent.start, summary: nextVacEvent.summary } : null;

  const upcomingHolidays = holidays.holidays.filter((h) => daysUntil(h.date) >= 0).slice(0, 1);
  const nextHoliday =
    upcomingHolidays.length > 0 ? buildHolidayHint(upcomingHolidays[0], holidays.holidays) : null;

  return { vacation, nextVacation, today, emailByName, nextHoliday };
}

function buildHolidayHint(
  next: HolidaysResponse["holidays"][number],
  allHolidays: HolidaysResponse["holidays"],
): { date: string; name: string; bridgeHint: string | null } {
  const opportunities = computeBridges(allHolidays);
  const oppForHoliday = opportunities.find((o) => o.holidayDate === next.date);
  const topOption = oppForHoliday?.options[0];
  const bridgeHint = topOption
    ? `Brückentag-Hebel: ${topOption.description} ${highlightBolt(topOption.highlight)}`.trim()
    : null;
  return { date: next.date, name: next.name, bridgeHint };
}

export default function MenuBar() {
  const { data, isLoading } = useCachedPromise(fetchMenuBarData, []);

  const title = data ? `👤 ${data.today.away_count} · 🏖 ${data.vacation.remaining.toFixed(1)}d` : "🏖 …";

  return (
    <MenuBarExtra icon={Icon.Sun} title={title} isLoading={isLoading} tooltip="Time-Butler">
      {data && (
        <>
          <MenuBarExtra.Section title="Mein Stand">
            <MenuBarExtra.Item title={`${data.vacation.remaining.toFixed(1)} Tage Resturlaub`} />
            <MenuBarExtra.Item title={`${data.vacation.planned.toFixed(1)} Tage geplant`} />
            {data.nextVacation ? (
              <MenuBarExtra.Item
                title={`Nächster Urlaub: ${formatGermanShort(data.nextVacation.start)} (in ${daysUntil(
                  data.nextVacation.start,
                )}d)`}
                subtitle={data.nextVacation.summary}
              />
            ) : (
              <MenuBarExtra.Item title="Kein Urlaub geplant" />
            )}
          </MenuBarExtra.Section>

          <MenuBarExtra.Section title={`Team Heute Weg (${data.today.away_count})`}>
            {data.today.away.length === 0 ? (
              <MenuBarExtra.Item title="Alle da" />
            ) : (
              data.today.away.slice(0, MAX_TEAM_AWAY_VISIBLE).map((entry) => {
                const info = statusInfo(entry.status);
                return (
                  <MenuBarExtra.Item
                    key={entry.name}
                    title={`${info.emoji}  ${entry.name}`}
                    subtitle={info.label}
                    onAction={() => {
                      const email = data.emailByName.get(entry.name);
                      if (email) {
                        open(`mailto:${email}`);
                      }
                    }}
                  />
                );
              })
            )}
            {data.today.away.length > MAX_TEAM_AWAY_VISIBLE && (
              <MenuBarExtra.Item title={`… und ${data.today.away.length - MAX_TEAM_AWAY_VISIBLE} weitere`} />
            )}
          </MenuBarExtra.Section>

          {data.nextHoliday && (
            <MenuBarExtra.Section title="Nächster Feiertag">
              <MenuBarExtra.Item
                title={`${data.nextHoliday.name} · ${formatGermanShort(data.nextHoliday.date)} (${weekdayShort(
                  data.nextHoliday.date,
                )})`}
                subtitle={`in ${daysUntil(data.nextHoliday.date)} Tagen`}
              />
              {data.nextHoliday.bridgeHint && <MenuBarExtra.Item title={data.nextHoliday.bridgeHint} />}
            </MenuBarExtra.Section>
          )}

          <MenuBarExtra.Section title="Actions">
            <MenuBarExtra.Item
              title="Time-Butler öffnen"
              icon={Icon.Globe}
              onAction={() => open(tbWebUrl())}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
            <MenuBarExtra.Item
              title="Team Heute (vollständig)"
              icon={Icon.PersonCircle}
              onAction={() => launchCommand({ name: "team-today", type: LaunchType.UserInitiated })}
              shortcut={{ modifiers: ["cmd"], key: "t" }}
            />
            <MenuBarExtra.Item
              title="Mein Urlaubsstand"
              icon={Icon.Sun}
              onAction={() => launchCommand({ name: "my-vacation", type: LaunchType.UserInitiated })}
              shortcut={{ modifiers: ["cmd"], key: "u" }}
            />
            <MenuBarExtra.Item
              title="Brückentage"
              icon={Icon.Bolt}
              onAction={() => launchCommand({ name: "bridge-days", type: LaunchType.UserInitiated })}
              shortcut={{ modifiers: ["cmd"], key: "b" }}
            />
          </MenuBarExtra.Section>
        </>
      )}
    </MenuBarExtra>
  );
}

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function weekdayShort(iso: string): string {
  return WEEKDAY_LABELS[parseIsoDate(iso).getDay()];
}
