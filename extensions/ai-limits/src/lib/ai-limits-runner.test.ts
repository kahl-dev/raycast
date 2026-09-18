import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AI_LIMITS_SCRIPT, DEFAULT_AI_LIMITS_RUNNER_OPTIONS, runAiLimits, UV_BINARY } from "./ai-limits-runner";

// Written at runtime instead of living under src/: `ray lint` parses every file below src and
// fails on shell scripts.
const EMPTY_REPORT_JSON =
  '{"fetched_at":"2026-09-16T11:20:00.000Z","stale":false,"accounts":[],"buckets":[],"errors":[],"skipped":[],"reset_credits":null,"plans":[],"sources":[]}';

const REPORT_WITH_ERRORS_JSON =
  '{"fetched_at":"2026-09-16T11:20:00.000Z","stale":false,"accounts":[],"buckets":[],"errors":[{"provider":"anthropic","account":"work","message":"429 Too Many Requests"}],"skipped":[],"reset_credits":null,"plans":[],"sources":[]}';

const SCRIPT_BODIES: Record<string, string> = {
  "echo-valid-json.sh": `echo '${EMPTY_REPORT_JSON}'`,
  "echo-non-json.sh": "echo 'this is not json at all {'",
  "exit-1-with-stderr.sh": `echo 'ai-limits: fatal registry error, account "work" has no label' >&2\nexit 1`,
  "sleep-then-exit.sh": `sleep 5\necho '${EMPTY_REPORT_JSON}'`,
  "exit-1-with-report-json.sh": `echo '${REPORT_WITH_ERRORS_JSON}'\nexit 1`,
  "exit-1-non-json-with-stderr.sh": `echo 'this is not json at all {'\necho 'ai-limits: no account returned data' >&2\nexit 1`,
  "exit-2-with-stderr.sh": `echo 'ai-limits: unknown provider "bogus" in registry' >&2\nexit 2`,
};

let scriptDirectory = "";

beforeAll(() => {
  scriptDirectory = mkdtempSync(join(tmpdir(), "ai-limits-runner-"));
  for (const [name, body] of Object.entries(SCRIPT_BODIES)) {
    const path = join(scriptDirectory, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  }
});

afterAll(() => {
  rmSync(scriptDirectory, { recursive: true, force: true });
});

function fixtureScript(name: string): string {
  return join(scriptDirectory, name);
}

describe("DEFAULT_AI_LIMITS_RUNNER_OPTIONS", () => {
  it("points at the mise uv binary and the ai-limits script with a 90s timeout", () => {
    expect(DEFAULT_AI_LIMITS_RUNNER_OPTIONS.command).to.equal(UV_BINARY);
    expect(UV_BINARY).to.include(".local/share/mise/installs/uv/latest/uv-aarch64-apple-darwin/uv");
    expect(AI_LIMITS_SCRIPT).to.include("code/src/github.com/kahl-dev/claude-config/bin/ai-limits");
    expect(DEFAULT_AI_LIMITS_RUNNER_OPTIONS.args).to.deep.equal([
      "run",
      "--quiet",
      "--script",
      AI_LIMITS_SCRIPT,
      "--json",
      "--account",
      "all",
    ]);
    expect(DEFAULT_AI_LIMITS_RUNNER_OPTIONS.env.PATH).to.equal("/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    expect(typeof DEFAULT_AI_LIMITS_RUNNER_OPTIONS.env.HOME).to.equal("string");
    expect(DEFAULT_AI_LIMITS_RUNNER_OPTIONS.timeoutMs).to.equal(90_000);
  });
});

describe("runAiLimits", () => {
  it("resolves with the parsed JSON for valid stdout output", async () => {
    const result = await runAiLimits({
      command: "/bin/sh",
      args: [fixtureScript("echo-valid-json.sh")],
      env: { PATH: "/usr/bin:/bin" },
      timeoutMs: 5000,
    });
    expect(result).to.deep.equal({
      fetched_at: "2026-09-16T11:20:00.000Z",
      stale: false,
      accounts: [],
      buckets: [],
      errors: [],
      skipped: [],
      reset_credits: null,
      plans: [],
      sources: [],
    });
  });

  it("rejects naming the path when the binary does not exist", async () => {
    const missingPath = "/nonexistent/path/to/ai-limits-runner-binary-xyz";
    await expect(
      runAiLimits({
        command: missingPath,
        args: [],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(new RegExp(missingPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("rejects naming the exit code and a stderr excerpt when the script exits non-zero", async () => {
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-1-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exit code 1\b/);
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-1-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/fatal registry error/);
  });

  it("rejects when the process runs past the injected timeout", async () => {
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("sleep-then-exit.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 200,
      }),
    ).rejects.toThrow(/timeout|timed out/i);
  });

  it("rejects when stdout is not valid JSON", async () => {
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("echo-non-json.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("resolves with the parsed report on exit 1 when stdout is a valid report (ai-limits' no-data exit code)", async () => {
    const result = await runAiLimits({
      command: "/bin/sh",
      args: [fixtureScript("exit-1-with-report-json.sh")],
      env: { PATH: "/usr/bin:/bin" },
      timeoutMs: 5000,
    });
    expect(result).to.deep.equal({
      fetched_at: "2026-09-16T11:20:00.000Z",
      stale: false,
      accounts: [],
      buckets: [],
      errors: [{ provider: "anthropic", account: "work", message: "429 Too Many Requests" }],
      skipped: [],
      reset_credits: null,
      plans: [],
      sources: [],
    });
  });

  it("rejects naming the exit code and stderr when exit 1 has non-JSON stdout", async () => {
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-1-non-json-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exit code 1\b/);
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-1-non-json-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/no account returned data/);
  });

  it("rejects naming the exit code and stderr on exit 2 (usage/registry error)", async () => {
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-2-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/exit code 2\b/);
    await expect(
      runAiLimits({
        command: "/bin/sh",
        args: [fixtureScript("exit-2-with-stderr.sh")],
        env: { PATH: "/usr/bin:/bin" },
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(/unknown provider "bogus" in registry/);
  });
});
