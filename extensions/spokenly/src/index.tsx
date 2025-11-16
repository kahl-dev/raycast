import { List } from "@raycast/api";
import { useState, useEffect } from "react";
import { loadTranscriptions } from "./utils";
import { TranscriptionListItem } from "./components";
import { DateFilter, SpokenlyTranscription } from "./types";

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [transcriptions, setTranscriptions] = useState<SpokenlyTranscription[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>(DateFilter.All);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const data = await loadTranscriptions(dateFilter);
      setTranscriptions(data);
      setIsLoading(false);
    }
    load();
  }, [dateFilter]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search transcriptions..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by date"
          value={dateFilter}
          onChange={(value) => setDateFilter(value as DateFilter)}
        >
          <List.Dropdown.Item title="All" value={DateFilter.All} />
          <List.Dropdown.Item title="Today" value={DateFilter.Today} />
          <List.Dropdown.Item title="Yesterday" value={DateFilter.Yesterday} />
          <List.Dropdown.Item title="Last 7 days" value={DateFilter.Week} />
        </List.Dropdown>
      }
    >
      {transcriptions.map((t) => (
        <TranscriptionListItem key={t.id} transcription={t} />
      ))}
    </List>
  );
}
