# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This repository contains Raycast extensions and custom script commands. The main components are:

- **extensions/pinboard/**: A Raycast extension for managing Pinboard bookmarks
- **extensions/audio-switcher/**: A Raycast extension for switching macOS audio output/input devices, coordinated with the Hammerspoon audio-manager daemon (`~/.dotfiles/.hammerspoon/modules/audio-manager.lua`)
- **extensions/ai-limits/**: Menu-bar extension showing per-account Claude limits and Codex usage from claude-config's `bin/ai-limits --json`, with 80%/95% and reset alerts
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
bun run dev            # deploys into Raycast Beta, then watches for changes
bun run test           # vitest run
bunx tsc --noEmit      # type-check
```

Commands: Switch Audio Output, Switch Input Device, Toggle Mic Mute, Toggle Audio Automation.

**Deploy is part of done.** Raycast runs the last deployed build, not the source tree — after any
extension change run `bun run dev` once, verify the commands in Raycast, then stop it. The deploy
persists without the dev server. Skipping this shipped a months-stale 2-of-4-command build while all
tests were green (2026-07-06 audit).

**The deploy target is pinned per extension.** Every extension here uses
`"dev": "RAY_Target=x ray develop"`, which deploys into Raycast Beta (`com.raycast-x.macos`,
`~/.config/raycast-x/extensions/`) — the app in daily use. Without that pin the CLI defaults to
Stable, which is installed but never opened, and the deploy reports success while nothing visible
changes. New extensions need the same pin.

**After a re-import, deploy again.** Removing and re-importing an extension in Raycast can leave its
directory holding only `package.json` and `assets/`: every command listed, none runnable, each
failing with `Missing executable`. Run `bun run dev` afterwards and confirm one `.js` per command
landed in the extension directory.

Flavor mechanism, full target table and troubleshooting live in `Skill(raycast)` →
`references/local-development.md`. Keep them there rather than restating them here.

### AI Limits Extension

Located in `extensions/ai-limits/`. ONE menu-bar command (`interval: 150s`), npm + Vitest. The extension fetches nothing itself: every load spawns `~/code/src/github.com/kahl-dev/claude-config/bin/ai-limits --json --account all` and renders that report. Accounts, labels, quota caching, 429 backoff and the weighted pace (`elapsed_percent`) all live in `bin/ai-limits`; spec and history in `claude-config/.brain/work/ai-limits-menubar/`.

```bash
cd extensions/ai-limits
npm install            # dependencies
npm run dev            # ray develop (imports build into Raycast — DEPLOY IS PART OF DONE)
npm run test           # vitest run
npx tsc --noEmit       # type-check
npm run lint           # ray lint (ESLint + Prettier 3.9.6; `npm run fix-lint` formats)
```

Layout: `src/lib/ai-limits-runner.ts` (spawn), `report.ts` (JSON parser, the trust boundary), `load.ts` (history, alerts, resets), `menu-bar-title.ts`, `dropdown-model.ts` (pure dropdown model), `thresholds.ts`, `projection.ts`; `src/dropdown.tsx`/`src/anthropic.tsx` only render. `src/lib/cache.ts` is the only lib file importing `@raycast/api` — vitest cannot resolve it, so testable logic stays in pure lib files.

Gotchas:
- Raycast gives the extension process only `HOME` and `COMMAND_MODE`, no PATH. The runner calls uv by absolute path (`~/.local/share/mise/installs/uv/latest/uv-aarch64-apple-darwin/uv run --quiet --script <ai-limits>`) with an explicit `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin` — `/opt/homebrew/bin` is what lets ai-limits reach `codex app-server`. A bare command name or the script's own shebang fails.
- Accounts are dynamic: title slots and dropdown sections come from the report's `accounts[]` (registry `claude-config/accounts.json`, field `label`). Never hardcode an account name. Title: one slot per account with the `anthropic.weekly_all` percent, then Codex: `ʷ92 ᵖ3 ²8 ᴳ100`.
- The title is pure text with Unicode superscript labels (table covers `[a-pr-z0-9]`; `q` has no superscript) and U+2009 THIN SPACE separators; en dash `–` marks a missing value. The codepoints are load-bearing and byte-tested — editors and tooling silently flattening U+2009 to a regular space is a real failure mode (it happened in a test file on 2026-09-16). Tests spell them as `\u2009`/`\u2013` escapes. No icon, no images, no severity in the title (user decision); Raycast's ~22pt icon slot crushes image gauges.
- The command NAME is `anthropic` but its title is "AI Limits": Raycast tracks first-activation per command name, renaming deactivates it for the user. Do not "fix" it.
- Never call the Anthropic or ChatGPT usage endpoints from the extension and never add a force refresh: the Anthropic endpoint throttles hard and a 429 arms a 15-minute backoff in ai-limits that also blinds the Herdr supervision monitor. "Aktualisieren" just re-runs the load; ai-limits' own cooldown decides whether it fetches.
- `parseAiLimitsReport` validates everything once; downstream code trusts the types. `plans[].plan`/`source` are `null` when the plan is unknown (e.g. statusline snapshot without cache) — rejecting null freezes every account, not just one.
- Degradation contract in `load.ts`: (a) a runner or parser failure returns the last good report (Raycast Cache, stored as raw ai-limits JSON and re-parsed) plus `runError`, with no history, alerts or resets; (b) history gets a point only when a bucket's `observedAt` advanced for its key `<provider>:<account>:<id>`, so a report served twice adds nothing; (c) right after parsing, each incoming bucket is merged against the baseline by key and the strictly newer `observedAt` wins — after a 429 backoff ai-limits can fall back from a newer statusline snapshot to an older (even pre-reset) cache entry, which would otherwise be displayed, become the next baseline and fire a second reset; the merged report feeds display, history, alerts and resets, and baseline-only buckets are not resurrected; (d) the reset baseline (last good report) is read AFTER the runner await, so concurrent loads cannot both announce the same reset.
- Alert keys (`<bucket key>:<threshold>`) are removed only when a fresh observation sits below `threshold - REARM_HYSTERESIS`; a bucket missing from one report keeps its keys, or 80/95 would re-fire on recovery. When several thresholds cross in one run only the highest is notified (the message carries no threshold), all are marked fired.
- Anthropic windows are ANCHORED: percent only accumulates inside a window, so a reset is a drop of >= `RESET_DROP_POINTS` between two fresh observations, with no dedup state. Never put `resets_at` in a dedup key (its sub-second part drifts per request).
- **Changing the shape of `UsageSnapshot` requires bumping `SNAPSHOT_VERSION` in `anthropic.tsx`** (currently 3). `useCachedPromise` keys its persisted value on `objecthash(args)`; without the bump an old-shaped snapshot is handed to new code, the render throws before the fresh load can overwrite it, and every tick repeats that (crash loop observed 2026-07-28). Dates survive the persistence (`@raycast/utils` revives them).
- Manual refresh raises its own `isRefreshing` into `MenuBarExtra`'s `isLoading`: Raycast unloads a menu-bar command when the menu closes and `mutate` does not raise `isLoading` itself, so without it the load is killed mid-flight.
- Notifications go through `osascript` (`src/lib/notify.ts`) — `showToast`/`showHUD` do not surface on background interval launches.
- `ray lint` parses every file under `src/`, including shell scripts. Test fixtures that must be executables are written to a tmpdir at test runtime (see `ai-limits-runner.test.ts`), never committed under `src/`.
- `interval` must match Raycast's manifest regex `^(\d+)(s|m|h|d)$` (integers only: `150s`, not `2.5m`).
- Deploy target: this extension uses plain `ray develop` (no `RAY_Target=x`). Verified 2026-09-16: the running app is `/Applications/Raycast.app` (`com.raycast.macos`, extensions under `~/.config/raycast/extensions/`); with `RAY_Target=x` the build landed in `~/.config/raycast-x/extensions/` and never ran. The repo-wide `RAY_Target=x` convention described above was not re-verified for the other extensions. `ray build -e dist` also writes into `~/.config/raycast/extensions/<name>/`, but the running command keeps the old code until the next `ray develop` import.

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