import type { AudioManagerConfig } from "./types";

// Generic over the concrete config shape so the daemon's own top-level fields (which
// loadConfig preserves) stay part of the type all the way to the save. It is also the
// enforcement: rebuilding the result from known fields is not assignable to T, so a future
// edit that drops the spread fails to compile instead of silently deleting daemon data.
export function updateDevicePriority<T extends AudioManagerConfig>(
  config: T,
  deviceName: string,
  direction: "up" | "down",
): T {
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

export function toggleDeviceHidden<T extends AudioManagerConfig>(
  config: T,
  deviceName: string,
): T {
  const devices = config.devices.map((device) =>
    device.name === deviceName ? { ...device, hidden: !device.hidden } : device,
  );
  return { ...config, devices };
}
