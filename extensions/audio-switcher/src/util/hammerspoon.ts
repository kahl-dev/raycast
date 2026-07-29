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

// Run a Lua snippet via the Hammerspoon CLI and return its trimmed stdout, or null on any
// failure — hs binary missing, IPC timeout, or a Lua error. That is NOT the "undocked" case:
// the daemon module loads and its Raycast-facing functions run fine while undocked; only its
// automatic arbitration is gated internally. null means Hammerspoon itself is unreachable.
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
 * Undo the last notePick because the switch it announced never landed. The daemon restores the
 * pick this attempt displaced, so a failed switch cannot demote a still-valid pick to AUTO.
 */
export async function revertPick(kind: PickKind): Promise<void> {
  await runHs(audioManagerCall("revertExplicit", `'${kind}'`));
}

/**
 * Return the output to AUTO: the daemon drops the explicit pick and immediately settles onto the
 * highest-priority available device. Clearing the pick alone would only take effect at the next
 * device event, which may be hours away.
 */
export async function followOutputPriority(): Promise<void> {
  await runHs(audioManagerCall("followPriority"));
}

/**
 * Return the input to the strict guard: the daemon drops the explicit pick and enforces the
 * guard device (Wave:3) immediately instead of waiting for the next device event.
 */
export async function resetInputToGuard(): Promise<void> {
  await runHs(audioManagerCall("resetInputToGuard"));
}

/**
 * Toggle mute on the current default input device via the daemon's per-device volume control,
 * which mutes the mic actually capturing and preserves its gain across unmute. Returns the new
 * muted state, or null when Hammerspoon is unreachable, the Wave:3 device is not found, or it has
 * no controllable input volume — the caller then falls back to AppleScript on the current input.
 */
export async function toggleInputMute(): Promise<boolean | null> {
  const lua = REQUIRE_DAEMON + "if ok and m.toggleInputMute then return m.toggleInputMute() end; return 'NODEV'";
  const result = await runHs(lua);
  if (result === "MUTED") return true;
  if (result === "ON") return false;
  return null;
}

/**
 * Toggle the daemon's automatic audio arbitration (pause/resume). The Lua side reports both the
 * new pause state and whether the daemon is currently docked — arbitration only runs docked, but
 * the toggle works either way and takes effect at the next dock. Returns null on an unreachable
 * Hammerspoon (see runHs) or an unrecognized reply.
 */
export async function toggleAutomation(): Promise<{ state: "PAUSED" | "ACTIVE"; docked: boolean } | null> {
  const lua = REQUIRE_DAEMON + "if ok and m.togglePause then return m.togglePause() end; return nil";
  const result = await runHs(lua);
  if (result === "PAUSED") return { state: "PAUSED", docked: true };
  if (result === "ACTIVE") return { state: "ACTIVE", docked: true };
  if (result === "PAUSED_UNDOCKED") return { state: "PAUSED", docked: false };
  if (result === "ACTIVE_UNDOCKED") return { state: "ACTIVE", docked: false };
  return null;
}

/**
 * Whether the daemon's audio automation is currently paused. Reports false (not paused) as the
 * safe default when Hammerspoon is unreachable (see runHs).
 */
export async function isAutomationPaused(): Promise<boolean> {
  const lua = REQUIRE_DAEMON + "if ok and m.isPaused then return m.isPaused() end; return false";
  return (await runHs(lua)) === "true";
}
