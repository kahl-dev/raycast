import { spawn } from "node:child_process";
import { getPrefs, tbEnv } from "./preferences";

export interface ShelloutOptions {
  noCache?: boolean;
  timeoutMs?: number;
}

export async function runTbScript<T>(script: string, args: string[] = [], opts: ShelloutOptions = {}): Promise<T> {
  const prefs = getPrefs();
  const allArgs = ["run", `${prefs.skillPath}/${script}`, "--json", ...args];
  if (opts.noCache) {
    allArgs.push("--no-cache");
  }

  return new Promise<T>((resolve, reject) => {
    const child = spawn(prefs.uvBinary, allArgs, {
      env: tbEnv(prefs),
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = opts.timeoutMs ?? 30000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Time-Butler script ${script} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${prefs.uvBinary}: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Time-Butler script ${script} exited ${code}: ${stderr.trim() || "no stderr"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        reject(new Error(`Failed to parse JSON from ${script}: ${detail}. First 200 chars: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

export function tbWebUrl(path: string = ""): string {
  const prefs = getPrefs();
  const base = prefs.tbInstance.replace(/\/$/, "");
  return path ? `${base}/${path.replace(/^\//, "")}` : base;
}
