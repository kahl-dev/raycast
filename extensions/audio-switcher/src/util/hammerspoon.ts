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

/**
 * Tell the Hammerspoon audio daemon that THIS switch was a deliberate user choice,
 * so its arbitration honors it instead of mistaking it for a macOS hijack and reverting.
 *
 * Best-effort by design: when the daemon is not running (undocked) or `hs` is absent,
 * there is no arbiter to fight, so a failed call is the expected no-op — not an error.
 */
export async function notePick(kind: PickKind, deviceName: string): Promise<void> {
  const lua =
    "local ok, m = pcall(require, 'modules.audio-manager'); " +
    `if ok and m.noteExplicit then m.noteExplicit('${kind}', ${luaQuote(deviceName)}) end`;
  try {
    await execFileAsync(HS_BINARY, ["-c", lua], { timeout: 2000 });
  } catch {
    // Daemon absent (undocked) or hs not installed — intentional no-op boundary.
  }
}
