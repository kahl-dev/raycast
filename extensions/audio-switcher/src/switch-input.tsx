import { List, ActionPanel, Action, Icon, Color, showToast, Toast, popToRoot } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AudioDeviceManager } from "./audio-devices";
import { macOSPlatform } from "./platform-macos";
import { loadConfig, type LoadedAudioManagerConfig } from "./config";
import { notePick, revertPick, resetInputToGuard } from "./util/hammerspoon";
import { performSwitch } from "./switch-flow";
import { useAutomationPaused, pausedNavigationTitle } from "./automation-status";
import { findConfig } from "./enriched-devices";
import { TRANSPORT_LABELS } from "./transport";
import type { AudioDevice, AudioManagerConfig } from "./types";

const manager = new AudioDeviceManager(macOSPlatform);
const CONFIG_PATH = join(homedir(), ".config", "audio-manager", "config.json");

function loadDeviceConfig(): LoadedAudioManagerConfig {
  try {
    return loadConfig(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return loadConfig(null);
  }
}

function labelFor(device: AudioDevice, config: AudioManagerConfig): string {
  return findConfig(device, config.devices)?.label ?? device.name;
}

async function applyInputSwitch(deviceId: string, deviceName: string, label: string): Promise<void> {
  // Same intent-before-switch / clear-on-fail contract as the output command (see switch-flow.ts).
  const switched = await performSwitch(
    {
      notePick: (name) => notePick("input", name),
      revertPick: () => revertPick("input"),
      switchToDevice: (id) => manager.switchToInput(id),
    },
    deviceId,
    deviceName,
  );
  if (switched) {
    await showToast({ style: Toast.Style.Success, title: label });
    popToRoot();
  } else {
    await showToast({ style: Toast.Style.Failure, title: `Switch failed: ${label}` });
  }
}

export default function SwitchInput() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [config] = useState<LoadedAudioManagerConfig>(loadDeviceConfig);
  const paused = useAutomationPaused();

  const loadDevices = useCallback(async () => {
    try {
      const [inputs, active] = await Promise.all([
        manager.getInputDevices(),
        manager.getActiveInput(),
      ]);
      setDevices(inputs);
      setActiveId(active?.id ?? null);
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Could not list input devices" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Reload after the reset: the daemon switches the input back to the guard device, so without
  // this the list keeps flagging the old device as Active until the command is reopened.
  const resetInputGuard = useCallback(async () => {
    await resetInputToGuard();
    await showToast({ style: Toast.Style.Success, title: "Strict Wave:3 guard active" });
    await loadDevices();
  }, [loadDevices]);

  return (
    <List isLoading={isLoading}
      searchBarPlaceholder="Search input devices..."
      navigationTitle={pausedNavigationTitle("Switch Input Device", paused)}
    >
      {devices.map((device) => {
        const isActive = device.id === activeId;
        const label = labelFor(device, config);

        const accessories = [];
        if (isActive) {
          accessories.push({ tag: { value: "Active", color: Color.Green } });
        }
        accessories.push({ text: TRANSPORT_LABELS[device.transportType] });

        return (
          <List.Item
            key={device.id || device.name}
            icon={{
              source: Icon.Microphone,
              tintColor: isActive ? Color.Green : Color.SecondaryText,
            }}
            title={label}
            subtitle={label === device.name ? undefined : device.name}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action
                  title="Switch Input"
                  icon={Icon.Microphone}
                  onAction={() => applyInputSwitch(device.id, device.name, label)}
                />
                <ActionPanel.Section title="Mode">
                  <Action
                    title="Reset to Wave:3 Guard"
                    icon={Icon.Shield}
                    shortcut={{ modifiers: ["cmd"], key: "u" }}
                    onAction={resetInputGuard}
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
