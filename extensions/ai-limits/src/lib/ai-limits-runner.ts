import { spawn } from "node:child_process";
import { homedir } from "node:os";

// Vorbild `audio-switcher/src/util/hammerspoon.ts`: constants, not Raycast Preferences — this
// extension has exactly one deployment target (the user's own machine), so a preferences UI for
// paths nobody else would ever set is pure ceremony.
export const UV_BINARY = `${homedir()}/.local/share/mise/installs/uv/latest/uv-aarch64-apple-darwin/uv`;
export const AI_LIMITS_SCRIPT = `${homedir()}/code/src/github.com/kahl-dev/claude-config/bin/ai-limits`;

export interface AiLimitsRunnerOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  timeoutMs: number;
}

// Raycast hands the extension process only HOME and COMMAND_MODE, no PATH (measured
// 2026-09-02) — PATH is therefore set explicitly rather than inherited, and must include
// /opt/homebrew/bin for `codex app-server` to be reachable (without it ai-limits falls back to
// the slower Codex HTTP API). Timeout budget: up to 60s for a Keychain consent dialog plus ~10s
// for the Codex app-server round trip.
export const DEFAULT_AI_LIMITS_RUNNER_OPTIONS: AiLimitsRunnerOptions = {
  command: UV_BINARY,
  args: ["run", "--quiet", "--script", AI_LIMITS_SCRIPT, "--json", "--account", "all"],
  env: {
    HOME: homedir(),
    PATH: "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  },
  timeoutMs: 90_000,
};

const STDERR_EXCERPT_LENGTH = 500;

export async function runAiLimits(options: Partial<AiLimitsRunnerOptions> = {}): Promise<unknown> {
  const merged: AiLimitsRunnerOptions = { ...DEFAULT_AI_LIMITS_RUNNER_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const child = spawn(merged.command, merged.args, { env: merged.env });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ai-limits: Timeout nach ${merged.timeoutMs}ms (${merged.command} ${merged.args.join(" ")})`));
    }, merged.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(`ai-limits: Prozess "${merged.command}" konnte nicht gestartet werden: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const excerpt = stderr.trim().slice(0, STDERR_EXCERPT_LENGTH);
        reject(new Error(`ai-limits: Exit-Code ${code} (${merged.command}): ${excerpt}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(
            `ai-limits: stdout ist kein valides JSON: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
  });
}
