import type { AudioDevice, AudioPlatform, TransportType } from "./types";

export interface NativeDevice {
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

export type DeviceRunner = (args: string[]) => Promise<string>;

// The macOS audio platform, parameterized over a subprocess runner so the boundary
// (the bundled `audio-devices` CLI) can be faked in tests.
export function createMacOSPlatform(run: DeviceRunner): AudioPlatform {
  return {
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

    // Honest result: read the default back and confirm the switch actually took effect,
    // instead of assuming success the instant the CLI exits. CoreAudio can commit a default
    // change slightly after the CLI returns (notably for Bluetooth/aggregate devices), so
    // confirm with one short retry before reporting failure.
    async setDefaultOutputDevice(deviceId: string): Promise<boolean> {
      await run(["output", "set", deviceId]);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        const output = await run(["output", "get", "--json"]);
        if (output.trim()) {
          const current: NativeDevice | null = JSON.parse(output);
          if (current && String(current.id) === deviceId) {
            return true;
          }
        }
      }
      return false;
    },
  };
}
