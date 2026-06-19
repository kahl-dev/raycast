import { List, ActionPanel, Action, Icon, Color, showToast, Toast, popToRoot } from "@raycast/api";
import { useState, useEffect, useCallback } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AudioDeviceManager } from "./audio-devices";
import { macOSPlatform } from "./platform-macos";
import { loadConfig } from "./config";
import { notePick, clearPick } from "./util/hammerspoon";
import { findConfig } from "./enriched-devices";
import { TRANSPORT_LABELS } from "./transport";
import type { AudioDevice, AudioManagerConfig } from "./types";

const manager = new AudioDeviceManager(macOSPlatform);
const CONFIG_PATH = join(homedir(), ".config", "audio-manager", "config.json");

function loadDeviceConfig(): AudioManagerConfig {
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
  // Strict input policy: record intent BEFORE the switch so the daemon recognizes this as a
  // deliberate pick (input has no adopt fallback — anything unrecognized reverts to Wave:3).
  // Clear it again if the switch did not take, so the daemon won't restore a device never reached.
  await notePick("input", deviceName);
  let switched = false;
  try {
    switched = await manager.switchToInput(deviceId);
  } catch {
    switched = false; // CLI failure at the subprocess boundary — handled below as a failed switch
  }
  if (switched) {
    await showToast({ style: Toast.Style.Success, title: label });
    popToRoot();
  } else {
    await clearPick("input");
    await showToast({ style: Toast.Style.Failure, title: `Switch failed: ${label}` });
  }
}

export default function SwitchInput() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [config] = useState<AudioManagerConfig>(loadDeviceConfig);

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

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search input devices...">
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
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
