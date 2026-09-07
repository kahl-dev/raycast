# MCP Integration in Raycast

## Contents

- [Raycast as MCP Client](#raycast-as-mcp-client)
- [Installation Methods](#installation-methods)
- [Server Configuration](#server-configuration)
- [Usage in AI Chat](#usage-in-ai-chat)
- [MCP Registry Extension](#mcp-registry-extension)
- [Reverse Integration: raycast-mcp-server](#reverse-integration-raycast-mcp-server)
- [Reverse Integration: raycast-bridges](#reverse-integration-raycast-bridges)
- [Troubleshooting](#troubleshooting)

---

## Raycast as MCP Client

Raycast is a native MCP client since **v1.98.0** (May 2025).

| Feature | Support |
|---------|---------|
| Transport | stdio only (no HTTP/SSE natively) |
| Tool calling | Full support |
| Resource reading | Supported |
| Prompt templates | Supported |
| Sampling | Not supported |
| Auth | None (MCP servers handle their own auth) |

MCP servers run as local child processes. Raycast spawns the server process, communicates via stdin/stdout, and terminates it when no longer needed.

---

## Installation Methods

### 1. Install Server Command

1. Open Raycast
2. Search for "Install MCP Server"
3. Paste the server configuration JSON
4. Confirm installation

### 2. Deeplink Installation

Format: `raycast://mcp/install?<url-encoded-config-json>`. The config JSON contains `name`, `command`, `args`, and `env` fields. The `install-mcp.py` script generates these deeplinks from parameters.

### 3. Manual Configuration

Access via Raycast Settings > AI > MCP Servers.

---

## Server Configuration

### Configuration Schema

```json
{
  "name": "server-display-name",
  "command": "/path/to/executable",
  "args": ["arg1", "arg2"],
  "env": {
    "API_KEY": "value"
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name in Raycast UI |
| `command` | yes | Path to the server executable or runtime (`node`, `npx`, `python`, `uvx`) |
| `args` | no | Arguments passed to the command |
| `env` | no | Environment variables set for the server process |

### Common Patterns

| Pattern | command | args example |
|---------|---------|-------------|
| npx (auto-install) | `npx` | `["-y", "@anthropic/mcp-server-github"]` |
| uvx (Python) | `uvx` | `["mcp-server-fetch"]` |
| Direct binary | `/usr/local/bin/mcp-server-sqlite` | `["--db", "/path/to/db.db"]` |
| Node.js script | `node` | `["/path/to/server/index.js"]` |

Set `env` for API keys: `{ "GITHUB_TOKEN": "ghp_..." }`.

---

## Usage in AI Chat

Once installed, MCP servers are available in:

| Surface | How to Access |
|---------|---------------|
| AI Chat | @-mention the server name, then ask questions |
| Quick AI | @-mention in the input field |
| AI Commands | Reference server tools in custom commands |
| AI Presets | Include server context in preset system prompts |

### @-mention Workflow

1. Type `@` in AI Chat
2. Select the MCP server from the list
3. The AI model sees all tools provided by that server
4. Ask a question — the model calls tools as needed
5. Tool results are shown inline in the conversation

### Multiple Servers

Multiple MCP servers can be active simultaneously. The AI model selects which server's tools to call based on the conversation context.

---

## MCP Registry Extension

Raycast has a built-in **MCP Registry** extension in the Store. It provides:

- Searchable catalog of known MCP servers
- One-click installation via deeplinks
- Server descriptions and configuration templates
- Community-contributed server listings

Search "MCP Registry" in Raycast or the Raycast Store to install.

---

## Reverse Integration: raycast-mcp-server

**Repository**: [ExpertVagabond/raycast-mcp-server](https://github.com/ExpertVagabond/raycast-mcp-server)
**Purpose**: Lets external AI tools (Claude Code, other MCP clients) control Raycast programmatically.

This flips the direction — instead of Raycast calling MCP servers, an MCP server exposes Raycast's functionality to other clients.

### Requirements

| Requirement | Detail |
|-------------|--------|
| Runtime | Node.js 18+ |
| Language | TypeScript |
| Raycast | Must be running |
| macOS | Required (Raycast is macOS-only) |
| Raycast API access | Some tools use AppleScript/accessibility APIs |

### Available Tools

| Tool | Description |
|------|-------------|
| `raycast_auth` | Authenticate with Raycast |
| `raycast_extensions` | List, enable, disable installed extensions |
| `raycast_workflows` | List and trigger Raycast workflows |
| `raycast_search` | Trigger Raycast search with a query |
| `raycast_clipboard` | Read and write clipboard history |
| `raycast_shortcut` | Trigger keyboard shortcuts |
| `raycast_window` | Window management (move, resize, arrange) |
| `raycast_system` | System commands (sleep, lock, screenshot) |

### Installation for Claude Code

```json
{ "mcpServers": { "raycast": { "command": "npx", "args": ["-y", "raycast-mcp-server"] } } }
```

Listed on [LobeHub marketplace](https://lobehub.com/plugins) (search "raycast").

### Limitations

- Raycast must be running (foreground for some operations)
- Accessibility permissions required for window management and keyboard shortcuts
- Clipboard history feature must be enabled in Raycast for clipboard tools
- AppleScript-based tools have 100-500ms latency per operation

---

## Reverse Integration: raycast-bridges

**Repository**: [pa1ar/raycast-bridges](https://github.com/pa1ar/raycast-bridges)
**Purpose**: Universal connector between Raycast and external interfaces (API, MCP, CLI).

### Architecture

raycast-bridges exposes Raycast functionality through multiple interfaces:

| Interface | Description |
|-----------|-------------|
| REST API | HTTP endpoints for Raycast operations |
| MCP Server | Standard MCP protocol for AI tool integration |
| CLI | Command-line interface for shell scripts and automation |

### Use Cases

- **API**: Build web dashboards that trigger Raycast commands
- **MCP**: Connect Raycast to any MCP client (Claude Code, Cursor, Windsurf)
- **CLI**: Chain Raycast operations in shell scripts and automation pipelines

### Comparison with raycast-mcp-server

| Feature | raycast-mcp-server | raycast-bridges |
|---------|-------------------|-----------------|
| Focus | MCP-only | Multi-interface (API + MCP + CLI) |
| Tool count | 9 specialized tools | Broader surface area |
| Installation | npm package | Self-hosted |
| Maturity | Established, LobeHub listed | Newer, actively developed |

---

## Troubleshooting

### Server Not Appearing

| Symptom | Cause | Fix |
|---------|-------|-----|
| Server not in @-mention list | Not installed | Reinstall via "Install MCP Server" command |
| Server shows but tools missing | Server crashed on start | Check server logs, verify command path |
| "Server not responding" | Process died | Restart Raycast, check server dependencies |

### Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `npx`/`uvx` not found | Raycast does not inherit shell PATH | Use absolute path (`/usr/local/bin/npx`) or set `PATH` in `env` |
| Server starts, no tools | Silent crash | Test standalone: `echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' \| npx -y server-package` |
| Env vars missing | Raycast ignores shell env | Set all required vars in the `env` field |

### Debugging Steps

1. Test server command directly in terminal
2. Use absolute paths or set PATH in config `env`
3. Restart Raycast after config changes
4. Check Raycast debug console (Raycast > Debug > Console)
