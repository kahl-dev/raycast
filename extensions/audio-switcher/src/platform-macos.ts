import { environment } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import type { AudioPlatform } from "./types";
import { createMacOSPlatform, type DeviceRunner } from "./platform-macos-core";

const execFileAsync = promisify(execFile);

const defaultRun: DeviceRunner = async (args) => {
  const binaryPath = join(environment.assetsPath, "audio-devices");
  const { stdout } = await execFileAsync(binaryPath, args);
  return stdout;
};

export const macOSPlatform: AudioPlatform = createMacOSPlatform(defaultRun);
