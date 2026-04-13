import type { AudioDevice, AudioManagerConfig, DeviceConfig, EnrichedDevice } from "./types";

function findConfig(device: AudioDevice, configs: DeviceConfig[]): DeviceConfig | undefined {
  return configs.find((config) => device.name.includes(config.name));
}

function toEnrichedDevice(
  device: AudioDevice,
  deviceConfig: DeviceConfig | undefined,
): EnrichedDevice {
  return {
    ...device,
    label: deviceConfig?.label ?? device.name,
    priority: deviceConfig?.priority ?? Number.MAX_SAFE_INTEGER,
    connected: true,
    configured: deviceConfig !== undefined,
    hidden: deviceConfig?.hidden ?? false,
    icon: deviceConfig?.icon ?? "",
    bluetoothMac: extractMac(deviceConfig?.bluetooth),
  };
}

function extractMac(bluetooth: boolean | { mac: string } | undefined): string {
  if (typeof bluetooth === "object" && bluetooth !== null) {
    return bluetooth.mac;
  }
  return "";
}

function createDisconnectedDevice(deviceConfig: DeviceConfig): EnrichedDevice {
  return {
    id: "",
    name: deviceConfig.name,
    transportType: "unknown",
    isOutput: true,
    isInput: false,
    label: deviceConfig.label,
    priority: deviceConfig.priority,
    connected: false,
    configured: true,
    hidden: deviceConfig.hidden,
    icon: deviceConfig.icon,
    bluetoothMac: extractMac(deviceConfig.bluetooth),
  };
}

export function enrichDevices(
  platformDevices: AudioDevice[],
  config: AudioManagerConfig,
  showAll: boolean,
): EnrichedDevice[] {
  const outputDevices = platformDevices.filter((device) => device.isOutput);

  const configuredDevices: EnrichedDevice[] = [];
  const unconfiguredDevices: EnrichedDevice[] = [];
  const matchedConfigNames = new Set<string>();

  for (const device of outputDevices) {
    const deviceConfig = findConfig(device, config.devices);
    if (deviceConfig) {
      matchedConfigNames.add(deviceConfig.name);
      configuredDevices.push(toEnrichedDevice(device, deviceConfig));
    } else {
      unconfiguredDevices.push(toEnrichedDevice(device, undefined));
    }
  }

  for (const deviceConfig of config.devices) {
    if (!matchedConfigNames.has(deviceConfig.name)) {
      configuredDevices.push(createDisconnectedDevice(deviceConfig));
    }
  }

  configuredDevices.sort((a, b) => a.priority - b.priority);
  unconfiguredDevices.sort((a, b) => a.name.localeCompare(b.name));

  const visibleConfigured = showAll
    ? configuredDevices
    : configuredDevices.filter((device) => !device.hidden);

  if (showAll) {
    return [...visibleConfigured, ...unconfiguredDevices];
  }

  return visibleConfigured;
}
