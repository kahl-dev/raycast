# Feature: Spokenly History Raycast Extension

## Metadata
- Created: 2025-11-16 17:15
- Status: in-progress
- Phases: 2
- Estimated Timeline: 1-2 days
- Tickets: None

## Context & Questions

**Research Findings:**
- Spokenly stores transcriptions in: `~/Library/Containers/app.spokenly/Data/Library/Application Support/Spokenly/History/`
- JSON structure includes: text, creationDate, duration, modelId, audio file path
- Existing bash script provides search, date filtering, copy/export functionality
- Raycast extension pattern established in extensions/pinboard/

**Third-Party Dependencies:**
- **Existing Dependencies:**
  - @raycast/api: ^1.92.1 (already in pinboard extension)
  - TypeScript: ^4.4.3 (already configured)
  - Node.js built-in modules: fs, path (for reading JSON files)

**No New Dependencies Required** ✅

**Relevant Patterns Found:**
- File: extensions/pinboard/package.json
- Pattern: Standard Raycast extension structure with commands
- File: extensions/pinboard/src/searchBookmarks.tsx
- Pattern: List component with search, custom hooks for data loading
- File: extensions/pinboard/src/components.tsx
- Pattern: List.Item with ActionPanel, accessories for metadata

**Architectural Decisions:**
- Decision: Create new extension (extensions/spokenly/) rather than script command
- Rationale: Need rich UI (List component, ActionPanel), not just terminal output
- Alternatives Considered: Script command (rejected - poor UX for selection)
- Trade-offs: More complex setup, but significantly better user experience

**User Preferences:**
- List-only view (no detail panel) - confirmed by user
- Actions via ⌘K sufficient
- Search + keyboard navigation priority

## Applicable Skills
- None specific for TypeScript Raycast extensions; will rely on Raycast API docs and existing patterns

## Problem Statement

Current bash script (`scritps/spokenly-history.sh`) provides access to Spokenly transcription history but has poor UX:
- fullOutput mode shows terminal-like text
- Requires manual number entry for selection
- No native keyboard navigation
- No fuzzy search integration

**Goal:** Create native Raycast extension with:
1. List component for transcriptions (fuzzy search built-in)
2. Keyboard-friendly selection (arrow keys + Enter)
3. Rich ActionPanel with multiple actions
4. Date filtering (today/yesterday/week)
5. Inline metadata display (duration, date)

## Implementation Plan

### Phase 1: Extension Setup & Core Functionality
- [x] Create new extension directory structure
  - [x] `extensions/spokenly/` directory
  - [x] `package.json` with extension metadata
  - [x] `src/` directory for TypeScript files
  - [x] `tsconfig.json` for TypeScript configuration
  - [x] Copy icon files from pinboard or create new
- [x] Implement data loading logic
  - [x] Create types for Spokenly transcription data
  - [x] Implement function to read JSON files from history directory
  - [x] Parse CoreFoundation timestamps to human-readable dates
  - [x] Extract transcription text, duration, metadata
  - [x] Sort by modification time (recent first)
- [x] Create main search command
  - [x] List component with search bar
  - [x] Display transcriptions with title (preview), subtitle (date)
  - [x] Accessories for duration
  - [x] Loading states
- [x] **REVIEW GATE:** Manual testing + TypeScript compilation
- [x] Commit after approval
- [x] Update specs/index.md with timestamp

### Phase 2: Actions & Filtering
- [ ] Implement ActionPanel with all actions
  - [ ] Action.CopyToClipboard (primary - ↵)
  - [ ] Action.Paste (secondary - ⌘↵)
  - [ ] Action.ToggleQuickLook for audio preview (Space)
  - [ ] Action.Open for playing audio (⌘O)
  - [ ] Action.ShowInFinder for audio file (⌘⇧F)
  - [ ] Custom export action (⌘E)
  - [ ] Organize in ActionPanel.Section groups
- [ ] Add date filtering
  - [ ] Dropdown in search bar for filter (all/today/yesterday/week)
  - [ ] Filter logic based on timestamps
  - [ ] Update list dynamically
- [ ] Add search text filtering
  - [ ] Filter transcriptions by text content
  - [ ] Combine with date filter
- [ ] **REVIEW GATE:** Manual testing + all actions verified
- [ ] Commit after approval
- [ ] Update specs/index.md with timestamp

## Extension Structure

```
extensions/spokenly/
├── package.json          # Extension metadata, commands, dependencies
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── index.tsx        # Main command (list transcriptions)
│   ├── types.ts         # TypeScript types for Spokenly data
│   ├── utils.ts         # Helper functions (read files, parse dates)
│   └── components.tsx   # TranscriptionListItem component
└── assets/
    └── icon.png         # Extension icon
```

## Code Structure Examples

### package.json
```json
{
  "name": "spokenly",
  "title": "Spokenly History",
  "description": "Browse, search, and copy Spokenly speech-to-text transcriptions",
  "icon": "icon.png",
  "author": "kahl.dev",
  "categories": ["Productivity"],
  "commands": [
    {
      "name": "index",
      "title": "Search Transcriptions",
      "description": "Search and browse Spokenly transcription history",
      "mode": "view"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.92.1"
  }
}
```

### types.ts
```typescript
export interface SpokenlyTranscription {
  id: string;
  text: string;
  creationDate: number; // CoreFoundation timestamp
  duration: number; // seconds
  modelId: string;
  audioPath: string;
  audioSize: number;
}

export enum DateFilter {
  All = "all",
  Today = "today",
  Yesterday = "yesterday",
  Week = "week",
}
```

### index.tsx (main command)
```typescript
import { List, ActionPanel, Action } from "@raycast/api";
import { useState, useEffect } from "react";
import { loadTranscriptions } from "./utils";
import { TranscriptionListItem } from "./components";
import { DateFilter } from "./types";

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [transcriptions, setTranscriptions] = useState([]);
  const [dateFilter, setDateFilter] = useState(DateFilter.All);

  useEffect(() => {
    async function load() {
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
```

### components.tsx
```typescript
import { List, ActionPanel, Action } from "@raycast/api";
import { SpokenlyTranscription } from "./types";
import { formatDate, formatDuration, exportToFile } from "./utils";

export function TranscriptionListItem(props: { transcription: SpokenlyTranscription }) {
  const t = props.transcription;
  const preview = t.text.substring(0, 100) + (t.text.length > 100 ? "..." : "");

  return (
    <List.Item
      title={preview}
      subtitle={formatDate(t.creationDate)}
      accessories={[{ text: `⏱️ ${formatDuration(t.duration)}` }]}
      quickLook={{ path: t.audioPath }}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Main">
            <Action.CopyToClipboard content={t.text} />
            <Action.Paste content={t.text} />
          </ActionPanel.Section>

          <ActionPanel.Section title="Audio">
            <Action.ToggleQuickLook />
            <Action.Open target={t.audioPath} title="Play Audio" />
            <Action.ShowInFinder path={t.audioPath} />
          </ActionPanel.Section>

          <ActionPanel.Section title="Export">
            <Action
              title="Export to File"
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              onAction={() => exportToFile(t)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
```

## Validation Pipeline

### After Phase 1:
- [ ] Run TypeScript compiler
  ```bash
  cd extensions/spokenly && npm run build
  ```
- [ ] Manual testing in Raycast:
  - [ ] Extension appears in Raycast
  - [ ] Lists transcriptions correctly
  - [ ] Search filters results
  - [ ] Loading states work
  - [ ] No TypeScript errors
- [ ] Test with Raycast dev mode
  ```bash
  cd extensions/spokenly && npm run dev
  ```

### After Phase 2:
- [ ] Test all actions:
  - [ ] Copy to clipboard works
  - [ ] Paste to frontmost app works
  - [ ] Quick Look preview shows audio
  - [ ] Play audio opens in default player
  - [ ] Show in Finder reveals file
  - [ ] Export creates file with metadata
- [ ] Test date filtering:
  - [ ] "Today" shows only today's entries
  - [ ] "Yesterday" shows only yesterday
  - [ ] "Week" shows last 7 days
  - [ ] "All" shows everything
- [ ] Test search + filter combinations
- [ ] Verify keyboard shortcuts work
- [ ] No console errors in Raycast logs

## Success Criteria

**Phase 1:**
- ✅ Extension builds without TypeScript errors
- ✅ Lists Spokenly transcriptions with correct data
- ✅ Search filters transcriptions by text
- ✅ Displays date and duration correctly
- ✅ Loading states display appropriately
- ✅ Extension runs in Raycast dev mode

**Phase 2:**
- ✅ All 6 actions work correctly
- ✅ Actions organized in logical sections
- ✅ Keyboard shortcuts assigned properly
- ✅ Date filtering produces expected results
- ✅ Quick Look shows audio waveform
- ✅ Export creates properly formatted files
- ✅ All Phase 1 functionality still works

## Progress Log
- [2025-11-16 17:15] Plan created
- [2025-11-16 18:45] Phase 1 completed - Extension setup with List component, date filtering, and TypeScript build successful

## How to Implement

1. **Start with Phase 1**: Set up extension structure and core List functionality
2. **Run Validation Pipeline**: Build TypeScript, test in Raycast dev mode
3. **Present for Review**:
   - Show extension running in Raycast
   - Demonstrate search and list functionality
   - Report TypeScript compilation results
   - Wait for human approval
4. **Commit via Skill**: Use git-commit-formatter skill after approval
5. **Update Progress**:
   - Mark Phase 1 complete in checklist
   - Add timestamp to Progress Log (ISO 8601: YYYY-MM-DD HH:MM)
   - Update specs/index.md with current status
6. **Ask Before Phase 2**: "Phase 1 complete. Proceed with actions and filtering?"
7. **Phase 2 Implementation**: Add ActionPanel and date filtering
8. **Final Review**: Test all actions, commit, update plan to completed

## Notes

- Extension will coexist with bash script (no removal needed)
- Bash script can remain as fallback or alternative
- Follow Raycast naming conventions (camelCase for files)
- Use existing Pinboard extension as reference
- Ensure proper error handling for missing/corrupted JSON files
- Consider caching transcriptions for performance (future enhancement)
- Audio preview via Quick Look is macOS native feature (no extra setup)
