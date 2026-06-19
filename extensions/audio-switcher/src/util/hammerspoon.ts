import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Hammerspoon CLI (hs.ipc) — the same binary AeroSpace already drives.
const HS_BINARY = "/opt/homebrew/bin/hs";

type PickKind = "output" | "input";

// Quote a string as a Lua double-quoted literal. Avoids JSON's \uXXXX escapes,
// which LuaJIT does not parse; UTF-8 bytes pass through unchanged. Newlines/CRs must be
// escaped too — a raw newline in a device name would make an unterminated Lua string.
function luaQuote(value: string): string {
  return (
    '"' +
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r") +
    '"'
  );
}

// Run a Lua snippet via the Hammerspoon CLI and return its trimmed stdout.
// Best-effort by design: when the daemon is not running (undocked) or `hs` is absent there is no
// arbiter to talk to, so a failed call returns null rather than throwing.
async function runHs(lua: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(HS_BINARY, ["-c", lua], { timeout: 2000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Every daemon call first resolves the module; pcall keeps it a no-op when the daemon is absent.
const REQUIRE_DAEMON = "local ok, m = pcall(require, 'modules.audio-manager'); ";

function audioManagerCall(method: string, ...luaArgs: string[]): string {
  return REQUIRE_DAEMON + `if ok and m.${method} then m.${method}(${luaArgs.join(", ")}) end`;
}

/**
 * Tell the Hammerspoon audio daemon that THIS switch was a deliberate user choice, so its
 * arbitration honors it instead of mistaking it for a macOS hijack and reverting.
 */
export async function notePick(kind: PickKind, deviceName: string): Promise<void> {
  await runHs(audioManagerCall("noteExplicit", `'${kind}'`, luaQuote(deviceName)));
}

/**
 * Drop a previously recorded explicit pick — e.g. when the Raycast switch it was recorded for
 * turned out to fail, so the daemon should not "restore" onto a device the user never reached.
 */
export async function clearPick(kind: PickKind): Promise<void> {
  await runHs(audioManagerCall("clearExplicit", `'${kind}'`));
}

/**
 * Toggle mute on the current default input device via the daemon's per-device volume control,
 * which mutes the mic actually capturing and preserves its gain across unmute. Returns the new
 * muted state, or null when the daemon or per-device volume control is unavailable — the caller
 * then falls back to AppleScript on the current input.
 */
export async function toggleInputMute(): Promise<boolean | null> {
  const lua = REQUIRE_DAEMON + "if ok and m.toggleInputMute then return m.toggleInputMute() end; return 'NODEV'";
  const result = await runHs(lua);
  if (result === "MUTED") return true;
  if (result === "ON") return false;
  return null;
}
