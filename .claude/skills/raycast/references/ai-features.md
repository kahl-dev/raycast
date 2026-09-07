# Raycast AI Features

## Contents

- [Overview](#overview)
- [AI.ask API](#aiask-api)
- [useAI Hook](#useai-hook)
- [Available Models](#available-models)
- [AI Commands](#ai-commands)
- [AI Presets](#ai-presets)
- [AI Tools](#ai-tools)
- [BYOK (Bring Your Own Key)](#byok-bring-your-own-key)
- [Custom Providers](#custom-providers)
- [Local Models](#local-models)
- [Availability Check](#availability-check)

---

## Overview

Raycast AI provides three integration surfaces:

1. **Extension API** (`AI.ask`, `useAI`) — call AI models programmatically from extension code
2. **AI Commands and Presets** — user-facing text transforms with configurable prompts
3. **AI Tools** — expose extension functions as callable tools in Raycast AI Chat

All AI API features require **Raycast Pro** subscription. Check availability with `environment.canAccess(AI)` before calling.

---

## AI.ask API

```typescript
async function AI.ask(
  prompt: string,
  options?: {
    model?: AI.Model;
    creativity?: "none" | "low" | "medium" | "high" | "maximum";
    signal?: AbortSignal;
  }
): Promise<string>;
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `string` | required | The prompt to send to the model |
| `model` | `AI.Model` | User's default | Model to use (see Available Models) |
| `creativity` | `string` | `"low"` | Temperature: `"none"` (0.0), `"low"` (0.5), `"medium"` (1.0), `"high"` (1.5), `"maximum"` (2.0) |
| `signal` | `AbortSignal` | — | Cancellation signal for aborting the request |

```typescript
import { AI } from "@raycast/api";
const answer = await AI.ask("Summarize this text: " + selectedText);
```

Returns the full response as a string. For streaming in UI, use `useAI` instead. Throws when user lacks Raycast Pro, model is unavailable, network fails, or request is aborted.

---

## useAI Hook

React hook for AI in components. From `@raycast/utils`, not `@raycast/api`.

```typescript
import { Detail, AI } from "@raycast/api";
import { useAI } from "@raycast/utils";

export default function Command() {
  const { data, isLoading } = useAI("Explain quantum computing", {
    creativity: "medium",
    model: AI.Model["Anthropic_Claude_Sonnet"],
  });
  return <Detail isLoading={isLoading} markdown={data} />;
}
```

Returns `{ data, error, isLoading, revalidate }`. Options: `model`, `creativity`, `execute` (default `true`), `stream` (default `true`). Streams by default -- `data` updates incrementally. Set `execute: false` to defer. Changing `prompt` triggers a new request.

---

## Available Models

Models accessible via `AI.Model` enum. Availability depends on Raycast's provider agreements.

| Provider | Model | Enum Value | Context |
|----------|-------|-----------|---------|
| OpenAI | GPT-4o | `AI.Model["OpenAI_GPT4o"]` | 128K |
| OpenAI | GPT-4o mini | `AI.Model["OpenAI_GPT4o-mini"]` | 128K |
| OpenAI | GPT-4 | `AI.Model["OpenAI_GPT4"]` | 8K |
| Anthropic | Claude 3.5 Sonnet | `AI.Model["Anthropic_Claude_Sonnet"]` | 200K |
| Anthropic | Claude 3 Opus | `AI.Model["Anthropic_Claude_Opus"]` | 200K |
| Anthropic | Claude 3 Haiku | `AI.Model["Anthropic_Claude_Haiku"]` | 200K |
| Google | Gemini Pro | `AI.Model["Google_Gemini_Pro"]` | 1M |
| Google | Gemini Flash | `AI.Model["Google_Gemini_Flash"]` | 1M |
| Meta | Llama 3.1 | `AI.Model["Meta_Llama3"]` | 128K |
| xAI | Grok | `AI.Model["xAI_Grok"]` | 128K |

Enum values change with Raycast releases. Query Context7 for current values when implementing.

---

## AI Commands

User-facing text transforms available in the command palette. Built-in: Fix Spelling, Improve Writing, Make Shorter/Longer, Change Tone, Explain Code.

Custom commands configured via Settings > AI > Commands with fields: Name, System Prompt, Model, Creativity, Input (selected text / clipboard / manual), Output (replace / paste / copy / chat).

Extensions register AI commands as regular commands in `package.json` with `mode: "no-view"`, calling `AI.ask()` in the implementation.

---

## AI Presets

Saved configs (system prompt + model + creativity) created in Settings > AI > Presets. Appear as selectable contexts in AI Chat. Function as reusable personas (e.g., "Code Reviewer", "Technical Writer").

---

## AI Tools

Extensions expose callable tools that Raycast AI Chat can invoke via @-mention.

### Defining Tools

Tools are defined in `package.json` under `"tools"` with JSON Schema input definitions. Each tool maps to a TypeScript file in `src/tools/`:

```typescript
// src/tools/search-issues.ts
export default async function (input: Tool.Input<"search-issues">) {
  const results = await searchIssues(input.query, input.status);
  return JSON.stringify(results);
}
```

### Evaluations

Extensions include `ai.json` or `ai.yaml` eval files to test tool routing quality:

```yaml
evals:
  - input: "Find all open bugs"
    expected_tool: "search-issues"
    expected_input: { query: "bugs", status: "open" }
```

Users @-mention the extension in AI Chat. The model calls tools based on conversation context and tool descriptions.

---

## BYOK (Bring Your Own Key)

Configure personal API keys in Settings > AI for Anthropic, Google, OpenAI, or OpenRouter. Requests go directly to the provider (not proxied). No Raycast Pro required for BYOK models. `environment.canAccess(AI)` returns `true` when configured.

---

## Custom Providers

Connect any OpenAI-compatible endpoint via `~/.config/raycast/providers.yaml`.

```yaml
providers:
  - id: local-llm
    name: Local LLM
    base_url: http://localhost:11434/v1
    api_key: ollama              # Required field, use dummy for local
    models:
      - id: llama3.1
        name: Llama 3.1 8B
        context_length: 128000
        supports_streaming: true
        supports_vision: false
```

**Provider fields**: `id`, `name`, `base_url` (required), `api_key` or `api_key_env` (one required), `description` (optional), `models` (required).

**Model fields**: `id`, `name` (required), `context_length` (default 4096), `supports_streaming` (default true), `supports_vision` (default false).

---

## Local Models

Ollama integration via Custom Providers. Requirements: Ollama running (`ollama serve`), model pulled (`ollama pull llama3.1`), provider configured with `base_url: http://localhost:11434/v1`.

Limitations: slower than cloud (hardware-dependent), no vision for most models, context window limited by RAM, tool calling depends on model.

---

## Availability Check

Always check before calling AI APIs:

```typescript
import { environment, AI } from "@raycast/api";

if (environment.canAccess(AI)) {
  const result = await AI.ask("Hello");
}
```

Returns `true` when user has Raycast Pro OR at least one BYOK provider configured.
