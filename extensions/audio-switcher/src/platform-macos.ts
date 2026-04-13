import { environment } from "@raycast/api";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import type { AudioDevice, AudioPlatform, TransportType } from "./types";

const execFileAsync = promisify(execFile);

const binaryPath = join(environment.assetsPath, "audio-devices");

interface NativeDevice {
  id: number;
  name: string;
  transportType: string;
  isOutput: boolean;
  isInput: boolean;
}

const KNOWN_TRANSPORT_TYPES = new Set<TransportType>([
  "bluetooth",
  "builtin",
  "usb",
  "displayport",
  "hdmi",
  "airplay",
  "virtual",
]);

function isKnownTransportType(value: string): value is TransportType {
  return KNOWN_TRANSPORT_TYPES.has(value as TransportType);
}

function normalizeTransportType(raw: string): TransportType {
  const lower = raw.toLowerCase();
  return isKnownTransportType(lower) ? lower : "unknown";
}

function toAudioDevice(native: NativeDevice): AudioDevice {
  return {
    id: String(native.id),
    name: native.name,
    transportType: normalizeTransportType(native.transportType),
    isOutput: native.isOutput,
    isInput: native.isInput,
  };
}

async function run(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(binaryPath, args);
  return stdout;
}

export const macOSPlatform: AudioPlatform = {
  async getAllDevices(): Promise<AudioDevice[]> {
    const output = await run(["list", "--json"]);
    const devices: NativeDevice[] = JSON.parse(output);
    return devices.map(toAudioDevice);
  },

  async getDefaultOutputDevice(): Promise<AudioDevice | null> {
    const output = await run(["output", "get", "--json"]);
    if (!output.trim()) {
      return null;
    }
    const device: NativeDevice | null = JSON.parse(output);
    return device ? toAudioDevice(device) : null;
  },

  async setDefaultOutputDevice(deviceId: string): Promise<boolean> {
    await run(["output", "set", deviceId]);
    return true;
  },
};
