import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileFunction = (file: string, args: string[]) => Promise<ExecFileResult>;

const execFileAsync = promisify(execFile);

export const defaultExecFile: ExecFileFunction = (file, args) => execFileAsync(file, args);

// osascript concatenates the escaped string back into a double-quoted AppleScript literal,
// so backslashes must be escaped first — otherwise an escaped quote's leading backslash would
// itself need escaping, breaking out of the literal.
export function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Raycast's showToast/showHUD do not surface anything on background (interval-triggered)
// launches, so alerts go through a native macOS notification via osascript instead.
export async function sendMacNotification(
  title: string,
  message: string,
  execFileImplementation: ExecFileFunction = defaultExecFile,
): Promise<void> {
  const script = `display notification "${escapeAppleScriptString(message)}" with title "${escapeAppleScriptString(title)}"`;
  await execFileImplementation("osascript", ["-e", script]);
}
