import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { runTbScript, tbWebUrl } from "./lib/tb-shellout";
import { TeamResponse, TeamToday, TeamTodayEntry } from "./lib/types";
import { statusInfo } from "./lib/status-codes";

interface TeamTodayData {
  today: TeamToday;
  emailByName: Map<string, string>;
}

async function fetchTeamToday(noCache: boolean): Promise<TeamTodayData> {
  const [today, team] = await Promise.all([
    runTbScript<TeamToday>("team-today.py", [], { noCache }),
    runTbScript<TeamResponse>("team.py", [], { noCache }),
  ]);
  const emailByName = new Map<string, string>();
  for (const member of team.members) {
    emailByName.set(member.name, member.email);
  }
  return { today, emailByName };
}

export default function TeamTodayCommand() {
  const [noCache, setNoCache] = useState(false);
  const { data, isLoading, revalidate } = useCachedPromise(fetchTeamToday, [noCache], {
    keepPreviousData: true,
  });

  const awayCount = data?.today.away_count ?? 0;
  const totalTeam = data?.today.total_team ?? 0;
  const subtitle = `${awayCount} weg · ${totalTeam - awayCount} da`;

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Team Heute · ${subtitle}`}
      searchBarPlaceholder="Name suchen …"
    >
      {data?.today.away.length === 0 ? (
        <List.EmptyView icon={Icon.PersonCircle} title="Niemand weg" description="Alle Kollegen sind heute da." />
      ) : (
        <List.Section title={`Heute weg (${awayCount})`}>
          {data?.today.away.map((entry) => (
            <TeamItem
              key={entry.name}
              entry={entry}
              email={data.emailByName.get(entry.name)}
              onForceRefresh={() => {
                setNoCache(true);
                revalidate();
              }}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function TeamItem({
  entry,
  email,
  onForceRefresh,
}: {
  entry: TeamTodayEntry;
  email: string | undefined;
  onForceRefresh: () => void;
}) {
  const info = statusInfo(entry.status);
  const accessoryParts: { tag: { value: string; color?: undefined } }[] = [{ tag: { value: info.label } }];

  return (
    <List.Item
      title={`${info.emoji}  ${entry.name}`}
      subtitle={info.label}
      accessories={accessoryParts}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Team-Kalender in Time-Butler öffnen"
            url={tbWebUrl("?ha=vac&ac=11")}
            icon={Icon.Globe}
          />
          {email && <Action.CopyToClipboard title="Email kopieren" content={email} icon={Icon.Envelope} />}
          <Action.CopyToClipboard title="Name kopieren" content={entry.name} icon={Icon.Person} />
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
