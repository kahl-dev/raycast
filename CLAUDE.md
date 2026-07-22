# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This repository contains Raycast extensions and custom script commands. The main components are:

- **extensions/pinboard/**: A Raycast extension for managing Pinboard bookmarks
- **extensions/audio-switcher/**: A Raycast extension for switching macOS audio output/input devices, coordinated with the Hammerspoon audio-manager daemon (`~/.dotfiles/.hammerspoon/modules/audio-manager.lua`)
- **extensions/ai-limits/**: Menu-bar extension showing Claude (session/weekly/Fable) and OpenAI/Codex usage limits with 80%/95% alerts
- **scripts/**: Custom Raycast script commands (shell scripts and AppleScripts)

## Common Development Commands

### Pinboard Extension

The Pinboard extension is located in `extensions/pinboard/`.

```bash
# Install dependencies
cd extensions/pinboard && npm install

# Build the extension
cd extensions/pinboard && npm run build

# Run in development mode
cd extensions/pinboard && npm run dev

# Publish to Raycast Store
cd extensions/pinboard && npm run publish
```

### Audio Switcher Extension

Located in `extensions/audio-switcher/`. Uses **bun** (per global preference) and Vitest for tests.

```bash
cd extensions/audio-switcher
bun install            # dependencies
bun run dev            # ray develop (live dev session)
bun run test           # vitest run
bunx tsc --noEmit      # type-check
```

Commands: Switch Audio Output, Switch Input Device, Toggle Mic Mute, Toggle Audio Automation.

**DEPLOY IS PART OF DONE.** Raycast runs the LAST IMPORTED BUILD, not the source tree — after
any extension change, run `bun run dev` once (imports the fresh build into Raycast), verify the
commands, then stop it (the build persists without the dev server). Skipping this shipped a
months-stale 2-of-4-command build while all tests were green (found in the 2026-07-06 audit).

### AI Limits Extension

Located in `extensions/ai-limits/`. ONE menu-bar command (`interval: 5m`), npm + Vitest. The command NAME is `anthropic` but its title is "AI Limits" — the name is deliberately frozen because Raycast tracks first-activation per command name (renaming deactivates it for the user); do not "fix" it. The title is pure text built by `src/lib/menu-bar-title.ts`: four fixed slots with Unicode superscript labels and U+2009 thin-space separators (`ˢ29 ᵂ36 ᶠ52 ᴳ0`) — the exact codepoints are load-bearing and byte-tested; editors/tooling silently flattening U+2009 to a regular space is a known real failure mode. No icon, no images, no severity dots in the title (user decision) — severity/pace lives only in the dropdown rows. Menu-bar item graphics were tried and removed: Raycast's icon slot is roughly square (~22pt), wide rendered strips get crushed — do not reintroduce image-based gauges. Both provider fetches sit behind 60s attempt gates (`isWithinAnthropicCooldown`/`isWithinCodexCooldown`); any new fetch path must go through `loadUsageData`, never call the APIs directly. Manual refresh uses `mutate(loadUsageData(...))` WITHOUT `shouldRevalidateAfter: false` — the default revalidate is what pushes fresh data into React state, and the second run is cheap because of the gates. Note: the user's Raycast is the Beta build (`com.raycast-x.macos`) — support/cache paths live there, not under `com.raycast.macos`.

```bash
cd extensions/ai-limits
npm install            # dependencies
npm run dev            # ray develop (imports build into Raycast — DEPLOY IS PART OF DONE)
npm run test           # vitest run
npx tsc --noEmit       # type-check
```

Gotchas:
- The Anthropic usage endpoint (`api.anthropic.com/api/oauth/usage`) allows roughly 1 request/minute per token and 429s with a useless `retry-after: 0`. The fetch layer has a persisted 60s cooldown gate and falls back to last-good data — never add burst retries, and never call the endpoint from tests.
- Buckets render generically from the API's `limits[]` array; do NOT filter by `is_active` (false on buckets the Claude app still shows).
- Notifications must go through `osascript` (`src/lib/notify.ts`) — Raycast's `showToast`/`showHUD` do not surface on background interval launches.
- The tmux status bar (`~/.dotfiles/tmux/scripts/claude-usage.sh`) polls the same endpoint with the same token; concurrent 429s between the two consumers are normal and handled.

### Script Commands

Script commands in the `scripts/` directory follow Raycast's script command format. Each script includes Raycast metadata headers that define how the script appears and behaves in Raycast.

## Architecture Overview

### Pinboard Extension

The Pinboard extension is a TypeScript React application using Raycast's API:

- **api.tsx**: Core API client for Pinboard API integration
  - Implements bookmark search with fuzzy search support via Fuse.js
  - Caches all bookmarks for 24 hours to improve fuzzy search performance
  - Handles API authentication via user's API token from preferences
  
- **Component Structure**:
  - `addBookmark.tsx`: Form for adding new bookmarks
  - `searchBookmarks.tsx`: Search interface for all bookmarks
  - `searchBookmarksWithConstantTags.tsx`: Search with predefined tags from preferences
  - `components.tsx`: Shared UI components

### Key Technical Details

- Uses Raycast's preference system for API token storage
- Implements both tag-based search (via Pinboard API) and fuzzy search (via cached data)
- Supports constant tags feature for filtering bookmarks
- Uses `he` library for HTML entity decoding
- No test framework is currently configured in the extension

### Audio Switcher Extension

TypeScript/React Raycast extension. Switches the macOS default output/input device and pushes the
chosen device to the Hammerspoon audio-manager daemon via `hs -c` so the daemon honors deliberate
picks instead of reverting them as macOS hijacks.

- **platform-macos-core.ts**: runner-injectable CoreAudio platform (bundled `audio-devices` CLI) with honest read-back on switch; **platform-macos.ts** binds it to `@raycast/api`.
- **util/hammerspoon.ts**: `hs -c` IPC — `notePick`/`clearPick` (intent) and `toggleInputMute` (mute).
- **switch-output.tsx** / **switch-input.tsx**: device-list commands; **toggle-mic-mute.tsx**: mute.
- Vitest tests live next to sources (`*.test.ts`); the subprocess boundary is faked via an injected runner.

### Script Commands

Scripts use Raycast's script command format with metadata headers. Example from jira.sh:
- Scripts can accept arguments and read from clipboard
- Use `@raycast.*` headers to configure script behavior
- Scripts run in silent mode to avoid showing terminal output