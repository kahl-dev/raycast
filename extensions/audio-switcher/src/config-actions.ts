import type { AudioManagerConfig } from "./types";

export function updateDevicePriority(
  config: AudioManagerConfig,
  deviceName: string,
  direction: "up" | "down",
): AudioManagerConfig {
  const sorted = [...config.devices].sort((a, b) => a.priority - b.priority);
  const index = sorted.findIndex((d) => d.name === deviceName);
  if (index === -1) {
    return config;
  }

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= sorted.length) {
    return config;
  }

  const temp = sorted[index].priority;
  sorted[index] = { ...sorted[index], priority: sorted[swapIndex].priority };
  sorted[swapIndex] = { ...sorted[swapIndex], priority: temp };
  sorted.sort((a, b) => a.priority - b.priority);

  return { ...config, devices: sorted };
}

export function toggleDeviceHidden(
  config: AudioManagerConfig,
  deviceName: string,
): AudioManagerConfig {
  const devices = config.devices.map((device) =>
    device.name === deviceName ? { ...device, hidden: !device.hidden } : device,
  );
  return { ...config, devices };
}
