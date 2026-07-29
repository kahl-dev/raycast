import type { AudioManagerConfig } from "./types";

// The Hammerspoon daemon reads and writes the same config.json file and may store additional
// top-level fields Raycast doesn't know about. Preserving them through this type (rather than
// widening AudioManagerConfig itself) keeps the known fields strictly typed while still letting
// loadConfig round-trip whatever else is present in the file.
export type LoadedAudioManagerConfig = AudioManagerConfig & Record<string, unknown>;

export const DEFAULT_CONFIG: AudioManagerConfig = {
  devices: [],
  inputGuard: "Wave:3",
  showAllDevices: false,
};

export function loadConfig(raw: string | null): LoadedAudioManagerConfig {
  if (!raw) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(raw) as AudioManagerConfig;
    return {
      ...parsed,
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      inputGuard: parsed.inputGuard ?? DEFAULT_CONFIG.inputGuard,
      showAllDevices: parsed.showAllDevices ?? DEFAULT_CONFIG.showAllDevices,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
