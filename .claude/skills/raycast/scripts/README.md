# Raycast Skill Scripts

Progressive disclosure catalog. Find your operation here, then run `--help` for full syntax.

**Execute**: `uv run ${CLAUDE_SKILL_DIR}/scripts/<script>.py [args]`

## Development

| Script | What | When |
|--------|------|------|
| `scaffold-extension.py` | Wrap `npx create-raycast-extension` + conventions | Creating a new extension |
| `scaffold-script.py` | Create script command with `@raycast.*` metadata | Creating a new script command |
| `validate-script.py` | Check script metadata headers | Validating/debugging script commands |
| `dev-server.py` | Start `npm run dev` in extension dir | Development with hot reload |
| `build-extension.py` | Run `npm run build` | Building for validation or publish |
| `setup-tests.py` | Add Vitest config to extension | Setting up logic testing |

## Store and Discovery

| Script | What | When |
|--------|------|------|
| `search-store.py` | Search Raycast Store via GitHub API | Finding existing extensions |
| `list-installed.py` | List extensions/scripts in dev repo | Checking what exists locally |
| `get-extension-info.py` | Get Store extension metadata | Evaluating an extension |
| `publish-prep.py` | Validate before publishing | Pre-publish checklist |

## Data Management

| Script | What | When |
|--------|------|------|
| `export-snippets.py` | Create snippets JSON | Sharing/backing up snippets |
| `import-snippets.py` | Validate snippets JSON | Preparing snippet import |
| `create-quicklink.py` | Create quicklink with placeholders | Adding dynamic URL shortcuts |
| `export-quicklinks.py` | Create quicklinks JSON | Sharing/backing up quicklinks |

## Configuration

| Script | What | When |
|--------|------|------|
| `export-settings.py` | Trigger settings export/import | Backing up Raycast config |
| `install-mcp.py` | Generate MCP server install deeplink | Setting up MCP in Raycast |

## Environment

All scripts that interact with your local Raycast repo require:

```bash
export RAYCAST_DEV_PATH="/path/to/your/raycast/dev/repo"
```

Scripts that interact with the Raycast Store require:
- `gh` CLI authenticated (`brew install gh && gh auth login`)

## Pattern

All scripts follow UV (PEP 723) conventions:
- `--help` for full documentation and examples
- `--json` for machine-readable output
- Human-readable output by default
- Exit code 0 on success, 1 on error (errors on stderr)
