---
name: raycast
description: |
  This skill should be used when the user asks to "create raycast extension",
  "raycast script", "raycast store", "raycast AI", "raycast MCP", "ray develop",
  "ray build", "ray publish", "raycast quicklink", or "raycast snippet",
  or reports "missing executable", an extension not showing up in Raycast,
  or an extension stuck in development mode.
  Raycast extensions, script commands, quicklinks, snippets, AI commands,
  local deployment, configuration management.
license: MIT
compatibility: macOS only, Claude Code only, requires Python 3.11+ and uv
metadata:
  author: Patrick Kahl <patrick@kahl.dev>
  version: 1.1.0
  created: 2026-04-09
  updated: 2026-08-03
  lastReviewed: 2026-08-03
  lastReviewedBy: meta-skill@3.1.0
effort: high
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
argument-hint: "[extension-name or operation]"
---

# Raycast

Raycast expert for building extensions, script commands, quicklinks, snippets, AI commands, and managing Raycast configuration. Covers the full lifecycle: discover → decide → build → test → publish → manage.

## Scope

**Covers**: Extension development (React/TypeScript), script command creation (any language), quicklinks, snippets, AI commands/presets, AI tools, MCP server configuration, Store publishing, extension management, Raycast settings export/import

**Does NOT cover**: Raycast internal app development (→ Raycast team), general TypeScript/React patterns (use standard tools), TYPO3 integration (→ lia-t3-* skills)

## Research Protocol

Before building anything, follow this sequence. Steps 2-3 prevent reinventing what exists. Steps 4-6 ensure building with current API knowledge.

1. **CLASSIFY** — Determine artifact type: extension | script command | quicklink | snippet | AI command | config | manage
2. **SEARCH** — Run `search-store.py` to check for existing solutions in the Raycast Store
3. **ADVISE** — Recommend existing extension or confirm custom build with clear reasoning
4. **APIS** — Determine required Raycast APIs (List, Form, Grid, Detail, ActionPanel, AI, OAuth, etc.)
5. **LOOKUP** — Query Context7: `resolve-library-id` for "Raycast" → `query-docs` with `/websites/developers_raycast` for current API details
6. **PATTERNS** — Run `list-installed.py` to read user's existing extensions in `$RAYCAST_DEV_PATH` for consistency
7. **PROPOSE** — Present approach with component choices to user before writing code
8. **BUILD** — Scaffold via `scaffold-extension.py` or `scaffold-script.py`, then implement
9. **DEPLOY** — Run `ray develop` once against the intended flavor and verify it landed; deploying is what installs an extension, and an unverified deploy is the most common cause of "my change did nothing"

## Decision Framework

### What to Build

| Need | Artifact | Reasoning |
|------|----------|-----------|
| Rich UI (lists, forms, grids) | Extension | Only way to get native Raycast UI components |
| Background refresh / menu bar | Extension | Requires Raycast lifecycle (`interval`, `MenuBarExtra`) |
| OAuth-protected API | Extension | Built-in OAuth provider support (GitHub, Linear, Slack, Jira, etc.) |
| Quick automation, no UI | Script Command | Zero setup, any language with shebang, 4 output modes |
| Dashboard widget (inline result) | Script (`inline` mode) | `refreshTime` for auto-refresh in Root Search |
| Open URL with dynamic parameters | Quicklink | Native, no code, dynamic placeholders (`{query}`, `{clipboard}`, `{date}`) |
| Text expansion trigger | Snippet | System-wide, instant, supports modifiers (`uppercase`, `trim`) |
| AI-powered text transform | AI Command | Built-in, configurable model and creativity level |
| Tool for Raycast AI Chat | AI Tool (in extension) | Define tools in `package.json` for @-mention in AI Chat |

### Extension Command Modes

| Mode | Use When |
|------|----------|
| `view` | Full UI needed — renders List, Detail, Form, or Grid |
| `no-view` | Logic only — open URL, copy text, show HUD, no visible UI |
| `menu-bar` | Persistent menu bar item with `MenuBarExtra` (macOS only) |

### Script Command Output Modes

| Mode | Use When |
|------|----------|
| `silent` | No output needed, just execute |
| `compact` | Short result shown in notification-style bar |
| `fullOutput` | Long result in scrollable view |
| `inline` | Live result displayed in Root Search, supports `refreshTime` auto-refresh |

## Local Extension Development

`ray develop` is the install. It compiles the extension and writes one `.js` per command into the
target app's extension directory, and the extension keeps working once the dev server stops — the
running process only adds hot reload. `ray build` compiles and validates for the Store and installs
nothing, so an extension that has never been through `ray develop` reports `Missing executable` no
matter how often it builds successfully. No local build escapes development status either; only a
Store install does that, which means a permanently running dev server is never required.

Which app receives the deploy is decided by `RAY_Target`, resolved as environment variable →
`"Target"` in `~/.config/raycast/config.json` → `release`. Config directory, extension directory,
bundle ID and deeplink scheme all follow from it. With more than one Raycast flavor installed,
deploying to the wrong one is indistinguishable from success — the CLI prints `built extension
successfully` and the app the user opens never changes. Report the resolved destination before
deploying, and confirm it before concluding that a code change had no effect:

```bash
node -e 'console.log(require("./node_modules/@raycast/api/dist/config.js").extensionBuildDirectory())'
```

Verify by listing that directory: one `.js` per entry in the manifest's `commands` array. A
directory holding only `package.json` and `assets/` is registered but not deployed.

Flavor table, manifest-change re-import, and the troubleshooting matrix → `references/local-development.md`

## Script Catalog

All scripts use UV (PEP 723) with click CLI. Run `--help` for full syntax.

**Execute**: `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>.py [args]`

### Development

| Script | Purpose |
|--------|---------|
| `scaffold-extension.py` | Create an extension via `npx create-raycast-extension`, pinning the deploy target into its dev script |
| `scaffold-script.py` | Create Raycast script command with metadata headers |
| `validate-script.py` | Validate script command `@raycast.*` metadata |
| `dev-server.py` | Deploy an extension into a Raycast flavor via `ray develop` — reports the resolved target, verifies bundles landed |
| `build-extension.py` | Run `npm run build` — compiles and validates for the Store, installs nothing |
| `setup-tests.py` | Add Vitest configuration to extension for logic testing |

### Store and Discovery

| Script | Purpose |
|--------|---------|
| `search-store.py` | Search Raycast Store for extensions via GitHub API |
| `list-installed.py` | List extensions and scripts in `$RAYCAST_DEV_PATH` |
| `get-extension-info.py` | Get detailed Store extension metadata |
| `publish-prep.py` | Validate extension before publishing (icon, screenshots, README, package.json) |

### Data Management

| Script | Purpose |
|--------|---------|
| `export-snippets.py` | Export Raycast snippets to JSON |
| `import-snippets.py` | Import snippets from JSON file |
| `create-quicklink.py` | Create quicklink with dynamic placeholders |
| `export-quicklinks.py` | Export quicklinks to JSON |

### Configuration

| Script | Purpose |
|--------|---------|
| `export-settings.py` | Trigger Raycast settings export via deeplink |
| `install-mcp.py` | Generate MCP server install deeplink for Raycast |

## API Reference Strategy

Raycast API details change with releases. Do not rely on training data for component props or behavior.

**Primary**: Context7 — `query-docs` with library ID `/websites/developers_raycast` and specific question (e.g., "List.Item props and accessories", "Form.TagPicker usage")

**Fallback** when Context7 returns insufficient results:
- EXA: `get_code_context_exa` with "Raycast [specific topic]"
- Official docs: https://developers.raycast.com
- LLM-optimized: https://raw.githubusercontent.com/raycast/extensions/refs/heads/gh-pages/llms-full.txt

## Raycast AI Features

Raycast has deep AI integration. Know these when advising or building:

| Feature | API/Config | Use Case |
|---------|-----------|----------|
| `AI.ask(prompt, options)` | Extension API | Call any AI model from extension code, supports streaming |
| `useAI` hook | React hook | AI responses in UI components |
| AI Commands | Custom prompts | Text transforms on selected text (built-in + custom) |
| AI Presets | Saved configs | Reusable system prompt + model + creativity combos |
| AI Tools | `tools` in package.json | Extensions expose callable tools for AI Chat @-mention |
| MCP Client | Settings > MCP | Run stdio MCP servers, @-mention in AI Chat |
| BYOK | Settings > AI | Own API keys for Anthropic, OpenAI, Google, OpenRouter |
| Custom Providers | `providers.yaml` | Any OpenAI-compatible endpoint |
| Local Models | Ollama integration | On-device LLMs |

For implementation details and code examples → `references/ai-features.md`

## Store Publishing

1. Validate: `uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py --path <extension>`
2. Build: `cd <extension> && npm run build`
3. Publish: `cd <extension> && npm run publish` (opens PR to `raycast/extensions` repo)
4. Review: Raycast team responds within 3-7 business days

Full requirements and common rejection reasons → `references/store-requirements.md`

## MCP Integration

Raycast is a native MCP client since v1.98.0. Supports `stdio` transport, @-mention in AI Chat, deeplink installation. For reverse integration (Claude Code controlling Raycast via MCP server) → `references/mcp-integration.md`

## Testing Extensions

Raycast has no official test framework. For extension logic testing:

1. Run `setup-tests.py` on extension → adds Vitest configuration
2. Test API clients, data transformers, utilities (pure logic in separate files)
3. Raycast UI components (List, Form, etc.) cannot render outside Raycast — skip these
4. Manual UI verification: `npm run dev` in extension directory

Keeping logic in separate `.ts` files (not `.tsx` with Raycast imports) makes it testable.

## Environment

```bash
# Add to ~/.zshenv — required for all scripts
export RAYCAST_DEV_PATH="/path/to/your/raycast/dev/repo"
```

Scripts use `$RAYCAST_DEV_PATH` for listing extensions, running dev/build commands, and scaffolding new artifacts to the correct location.

## References

| When | Read | Content |
|------|------|---------|
| Deploying or debugging a local extension | `references/local-development.md` | Deploy model, `RAY_Target` flavor table, what lands where, verification, troubleshooting |
| Publishing to Store | `references/store-requirements.md` | Review checklist, icon/screenshot specs, common rejections |
| Building AI features | `references/ai-features.md` | AI.ask() API, AI Commands, AI Tools, BYOK, MCP, providers.yaml |
| Setting up MCP | `references/mcp-integration.md` | Raycast MCP client config, raycast-mcp-server reverse integration |

## Constraints

- **Search Store before building**: Run `search-store.py` before scaffolding any new extension
  **Why**: 2000+ extensions exist — reinventing wastes effort and misses community patterns

- **Query Context7 for API details before implementing**: Do not code Raycast components from memory
  **Why**: Raycast API evolves with every release — stale knowledge causes prop mismatches and missing features

- **Use `$RAYCAST_DEV_PATH` for all repo references**: Scripts read from environment, never hardcoded paths
  **Why**: Single source of truth, portable across setups

- **Name the deploy target before deploying, verify bundles after**: Report the resolved extension
  directory, then check one `.js` per manifest command
  **Why**: A deploy to the wrong Raycast flavor reports success and changes nothing in the app the
  user actually opens — verification is the only thing that distinguishes the two outcomes

- **Separate extension logic from UI**: Keep API clients and transformers in plain `.ts` files without Raycast imports
  **Why**: Only non-Raycast code is testable with Vitest — mixing logic into `.tsx` commands makes it untestable
