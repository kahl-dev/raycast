import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface ExecFileResult {
  stdout: string;
  stderr: string;
}

export type ExecFileFunction = (file: string, args: string[]) => Promise<ExecFileResult>;

const execFileAsync = promisify(execFile);

export const defaultExecFile: ExecFileFunction = (file, args) => execFileAsync(file, args);
