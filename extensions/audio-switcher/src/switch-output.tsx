import { List, ActionPanel, Action, Icon, Color, Image, Keyboard, showToast, Toast, popToRoot } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AudioDeviceManager } from "./audio-devices";
import { macOSPlatform } from "./platform-macos";
import { BluetoothManager } from "./bluetooth";
import { macOSBluetoothAdapter } from "./bluetooth-macos";
import { loadConfig } from "./config";
import { updateDevicePriority, toggleDeviceHidden } from "./config-actions";
import { enrichDevices } from "./enriched-devices";
import type { EnrichedDevice, TransportType, AudioManagerConfig } from "./types";

const manager = new AudioDeviceManager(macOSPlatform);
const bluetooth = new BluetoothManager(macOSBluetoothAdapter);
const CONFIG_DIR = join(homedir(), ".config", "audio-manager");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PRIVATE_PATH = join(CONFIG_DIR, "private.json");

const TRANSPORT_LABELS: Record<TransportType, string> = {
  bluetooth: "Bluetooth",
  builtin: "Built-in",
  usb: "USB",
  displayport: "DisplayPort",
  hdmi: "HDMI",
  airplay: "AirPlay",
  virtual: "Virtual",
  unknown: "Unknown",
};

const TRANSPORT_ICONS: Record<TransportType, Icon> = {
  bluetooth: Icon.Signal3,
  builtin: Icon.Speaker,
  usb: Icon.SpeakerHigh,
  displayport: Icon.Monitor,
  hdmi: Icon.Monitor,
  airplay: Icon.Wifi,
  virtual: Icon.Network,
  unknown: Icon.QuestionMark,
};

function getDeviceIcon(device: EnrichedDevice, isActive: boolean): Image.ImageLike {
  if (device.icon) {
    const suffix = isActive ? "active" : "inactive";
    return { source: `${device.icon}-${suffix}.png` };
  }

  return {
    source: TRANSPORT_ICONS[device.transportType],
    tintColor: isActive
      ? Color.Green
      : device.connected
        ? Color.SecondaryText
        : Color.Red,
  };
}

function readPrivateConfig(): Record<string, string> {
  try {
    const raw = readFileSync(PRIVATE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.bluetooth ?? {};
  } catch {
    return {};
  }
}

function readConfig(): AudioManagerConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = loadConfig(raw);
    const privateMacs = readPrivateConfig();

    config.devices = config.devices.map((device) => {
      if (device.bluetooth && privateMacs[device.name]) {
        return { ...device, bluetooth: { mac: privateMacs[device.name] } };
      }
      return device;
    });

    return config;
  } catch {
    return loadConfig(null);
  }
}

function saveConfig(updated: AudioManagerConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  } catch {
    showToast({ style: Toast.Style.Failure, title: "Config save failed", message: CONFIG_PATH });
  }
}

async function applySwitch(deviceId: string, label: string, stayOpen: boolean): Promise<boolean> {
  const success = await manager.switchToDevice(deviceId);
  if (success) {
    await showToast({ style: Toast.Style.Success, title: label });
    if (!stayOpen) {
      popToRoot();
    }
  } else {
    await showToast({ style: Toast.Style.Failure, title: `Switch failed: ${label}` });
  }
  return success;
}

export default function SwitchOutput() {
  const [devices, setDevices] = useState<EnrichedDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<AudioManagerConfig>(readConfig);

  const loadDevices = useCallback(async (): Promise<EnrichedDevice[]> => {
    const [platformDevices, active] = await Promise.all([
      manager.getOutputDevices(),
      manager.getActiveDevice(),
    ]);
    const enriched = enrichDevices(platformDevices, config, config.showAllDevices);

    const withBluetoothStatus = await Promise.all(
      enriched.map(async (device) => {
        if (device.bluetoothMac && !device.connected) {
          return { ...device, connected: await bluetooth.isConnected(device.bluetoothMac) };
        }
        return device;
      }),
    );

    setDevices(withBluetoothStatus);
    setActiveDeviceId(active?.id ?? null);
    setIsLoading(false);
    return withBluetoothStatus;
  }, [config]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const switchDevice = useCallback(
    async (device: EnrichedDevice, stayOpen: boolean) => {
      if (!device.connected && device.bluetoothMac) {
        await showToast({ style: Toast.Style.Animated, title: `Connecting ${device.label}...` });
        const connected = await bluetooth.connect(device.bluetoothMac);
        if (!connected) {
          await showToast({ style: Toast.Style.Failure, title: `Connection failed: ${device.label}` });
          return;
        }
        const freshDevices = await loadDevices();
        const refreshedDevice = freshDevices.find((d) => d.name === device.name);
        if (refreshedDevice?.id) {
          await applySwitch(refreshedDevice.id, device.label, stayOpen);
        } else {
          await showToast({ style: Toast.Style.Failure, title: `Device not found after connect: ${device.label}` });
        }
        return;
      }

      if (!device.connected) {
        await showToast({ style: Toast.Style.Failure, title: `${device.label} not connected` });
        return;
      }

      const switched = await applySwitch(device.id, device.label, stayOpen);
      if (switched && stayOpen) {
        await loadDevices();
      }
    },
    [loadDevices],
  );

  const handleBluetoothToggle = useCallback(
    async (device: EnrichedDevice) => {
      if (device.connected) {
        await bluetooth.disconnect(device.bluetoothMac);
        await showToast({ style: Toast.Style.Success, title: `${device.label} disconnected` });
      } else {
        await showToast({ style: Toast.Style.Animated, title: `Connecting ${device.label}...` });
        const connected = await bluetooth.connect(device.bluetoothMac);
        if (connected) {
          await showToast({ style: Toast.Style.Success, title: `${device.label} connected` });
        } else {
          await showToast({ style: Toast.Style.Failure, title: `Connection failed: ${device.label}` });
        }
      }
      await loadDevices();
    },
    [loadDevices],
  );

  const applyConfigUpdate = useCallback(
    async (updated: AudioManagerConfig) => {
      saveConfig(updated);
      setConfig(updated);
      const [platformDevices, active] = await Promise.all([
        manager.getOutputDevices(),
        manager.getActiveDevice(),
      ]);
      const enriched = enrichDevices(platformDevices, updated, updated.showAllDevices);
      const withBluetoothStatus = await Promise.all(
        enriched.map(async (device) => {
          if (device.bluetoothMac && !device.connected) {
            return { ...device, connected: await bluetooth.isConnected(device.bluetoothMac) };
          }
          return device;
        }),
      );
      setDevices(withBluetoothStatus);
      setActiveDeviceId(active?.id ?? null);
    },
    [],
  );

  const handlePriorityChange = useCallback(
    async (device: EnrichedDevice, direction: "up" | "down") => {
      const updated = updateDevicePriority(config, device.name, direction);
      await applyConfigUpdate(updated);
    },
    [config, applyConfigUpdate],
  );

  const handleToggleHidden = useCallback(
    async (device: EnrichedDevice) => {
      const updated = toggleDeviceHidden(config, device.name);
      await applyConfigUpdate(updated);
    },
    [config, applyConfigUpdate],
  );

  const handleToggleShowAll = useCallback(async () => {
    const updated = { ...config, showAllDevices: !config.showAllDevices };
    await applyConfigUpdate(updated);
  }, [config, applyConfigUpdate]);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search audio devices...">
      {devices.map((device) => {
        const isActive = device.id === activeDeviceId;
        const hasBluetooth = Boolean(device.bluetoothMac);

        const accessories = [];
        if (isActive) {
          accessories.push({ tag: { value: "Active", color: Color.Green } });
        }
        if (device.hidden) {
          accessories.push({ tag: { value: "Hidden", color: Color.SecondaryText } });
        }
        if (!device.connected && hasBluetooth) {
          accessories.push({ tag: { value: "Disconnected", color: Color.Orange } });
        } else if (!device.connected) {
          accessories.push({ tag: { value: "Disconnected", color: Color.Red } });
        }
        if (hasBluetooth && device.connected) {
          accessories.push({ tag: { value: "Connected", color: Color.Blue } });
        }
        accessories.push({ text: TRANSPORT_LABELS[device.transportType] });

        return (
          <List.Item
            key={device.id || device.name}
            icon={getDeviceIcon(device, isActive)}
            title={device.label}
            subtitle={device.configured ? undefined : device.name}
            accessories={accessories}
            actions={
              <ActionPanel>
                {(device.connected || hasBluetooth) && (
                  <Action
                    title={device.connected ? "Switch Output" : "Connect & Switch"}
                    icon={device.connected ? Icon.Speaker : Icon.Signal3}
                    onAction={() => switchDevice(device, false)}
                  />
                )}
                {device.connected && (
                  <Action
                    title="Switch and Stay"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "return" }}
                    onAction={() => switchDevice(device, true)}
                  />
                )}
                {hasBluetooth && (
                  <Action
                    title={device.connected ? "Disconnect Bluetooth" : "Connect Bluetooth"}
                    icon={device.connected ? Icon.WifiDisabled : Icon.Wifi}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                    onAction={() => handleBluetoothToggle(device)}
                  />
                )}
                <ActionPanel.Section title="Configure">
                  {device.configured && (
                    <>
                      <Action
                        title="Move Up"
                        icon={Icon.ArrowUp}
                        shortcut={Keyboard.Shortcut.Common.MoveUp}
                        onAction={() => handlePriorityChange(device, "up")}
                      />
                      <Action
                        title="Move Up (Vim)"
                        icon={Icon.ArrowUp}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "k" }}
                        onAction={() => handlePriorityChange(device, "up")}
                      />
                      <Action
                        title="Move Down"
                        icon={Icon.ArrowDown}
                        shortcut={Keyboard.Shortcut.Common.MoveDown}
                        onAction={() => handlePriorityChange(device, "down")}
                      />
                      <Action
                        title="Move Down (Vim)"
                        icon={Icon.ArrowDown}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
                        onAction={() => handlePriorityChange(device, "down")}
                      />
                      <Action
                        title={device.hidden ? "Unhide Device" : "Hide Device"}
                        icon={device.hidden ? Icon.Eye : Icon.EyeDisabled}
                        shortcut={{ modifiers: ["cmd"], key: "h" }}
                        onAction={() => handleToggleHidden(device)}
                      />
                    </>
                  )}
                  <Action
                    title={config.showAllDevices ? "Hide Unknown Devices" : "Show All Devices"}
                    icon={config.showAllDevices ? Icon.EyeDisabled : Icon.Eye}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                    onAction={handleToggleShowAll}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
