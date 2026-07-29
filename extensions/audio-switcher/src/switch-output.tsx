import { List, ActionPanel, Action, Icon, Color, Image, Keyboard, showToast, Toast, popToRoot } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AudioDeviceManager } from "./audio-devices";
import { macOSPlatform } from "./platform-macos";
import { BluetoothManager } from "./bluetooth";
import { macOSBluetoothAdapter } from "./bluetooth-macos";
import { loadConfig, type LoadedAudioManagerConfig } from "./config";
import { updateDevicePriority, toggleDeviceHidden } from "./config-actions";
import { enrichDevices } from "./enriched-devices";
import { notePick, revertPick, followOutputPriority } from "./util/hammerspoon";
import { performSwitch } from "./switch-flow";
import { useAutomationPaused, pausedNavigationTitle } from "./automation-status";
import { TRANSPORT_LABELS, TRANSPORT_ICONS } from "./transport";
import type { EnrichedDevice } from "./types";

const manager = new AudioDeviceManager(macOSPlatform);
const bluetooth = new BluetoothManager(macOSBluetoothAdapter);
const CONFIG_DIR = join(homedir(), ".config", "audio-manager");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

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

function readConfig(): LoadedAudioManagerConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return loadConfig(raw);
  } catch {
    return loadConfig(null);
  }
}

function saveConfig(updated: LoadedAudioManagerConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8");
  } catch {
    showToast({ style: Toast.Style.Failure, title: "Config save failed", message: CONFIG_PATH });
  }
}

async function applySwitch(
  deviceId: string,
  deviceName: string,
  label: string,
  stayOpen: boolean,
): Promise<boolean> {
  const success = await performSwitch(
    {
      notePick: (name) => notePick("output", name),
      revertPick: () => revertPick("output"),
      switchToDevice: (id) => manager.switchToDevice(id),
    },
    deviceId,
    deviceName,
  );
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
  const [config, setConfig] = useState<LoadedAudioManagerConfig>(readConfig);
  const paused = useAutomationPaused();

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
        let connected = false;
        try {
          connected = await bluetooth.connect(device.bluetoothMac);
        } catch {
          // blueutil threw at the subprocess boundary — connected stays false, reported below.
        }
        if (!connected) {
          await showToast({ style: Toast.Style.Failure, title: `Connection failed: ${device.label}` });
          return;
        }
        const freshDevices = await loadDevices();
        const refreshedDevice = freshDevices.find((d) => d.name === device.name);
        if (refreshedDevice?.id) {
          await applySwitch(refreshedDevice.id, refreshedDevice.name, device.label, stayOpen);
        } else {
          await showToast({ style: Toast.Style.Failure, title: `Device not found after connect: ${device.label}` });
        }
        return;
      }

      if (!device.connected) {
        await showToast({ style: Toast.Style.Failure, title: `${device.label} not connected` });
        return;
      }

      const switched = await applySwitch(device.id, device.name, device.label, stayOpen);
      if (switched && stayOpen) {
        await loadDevices();
      }
    },
    [loadDevices],
  );

  const handleBluetoothToggle = useCallback(
    async (device: EnrichedDevice) => {
      try {
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
      } catch {
        await showToast({ style: Toast.Style.Failure, title: `Bluetooth operation failed: ${device.label}` });
      }
      await loadDevices();
    },
    [loadDevices],
  );

  const applyConfigUpdate = useCallback(
    async (updated: LoadedAudioManagerConfig) => {
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

  const handleFollowPriority = useCallback(async () => {
    await followOutputPriority();
    await showToast({ style: Toast.Style.Success, title: "Auto Mode — following priority" });
    await loadDevices();
  }, [loadDevices]);

  return (
    <List isLoading={isLoading}
      searchBarPlaceholder="Search audio devices..."
      navigationTitle={pausedNavigationTitle("Switch Audio Output", paused)}
    >
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
                <ActionPanel.Section title="Mode">
                  <Action
                    title="Follow Priority (Auto Mode)"
                    icon={Icon.Repeat}
                    shortcut={{ modifiers: ["cmd"], key: "u" }}
                    onAction={handleFollowPriority}
                  />
                </ActionPanel.Section>
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
