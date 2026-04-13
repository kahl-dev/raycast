import type { AudioManagerConfig } from "./types";

export const DEFAULT_CONFIG: AudioManagerConfig = {
  devices: [],
  inputGuard: "Wave:3",
  showAllDevices: false,
};

export function loadConfig(raw: string | null): AudioManagerConfig {
  if (!raw) {
    return DEFAULT_CONFIG;
  }

  try {
    const parsed = JSON.parse(raw) as AudioManagerConfig;
    return {
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      inputGuard: parsed.inputGuard ?? DEFAULT_CONFIG.inputGuard,
      showAllDevices: parsed.showAllDevices ?? DEFAULT_CONFIG.showAllDevices,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
