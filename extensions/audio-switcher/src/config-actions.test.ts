import { describe, it, expect } from "vitest";
import { updateDevicePriority, toggleDeviceHidden } from "./config-actions";
import type { AudioManagerConfig } from "./types";

function createConfig(): AudioManagerConfig {
  return {
    devices: [
      { name: "WH-1000XM6", label: "Sony XM6", priority: 1, icon: "sony-xm6", hidden: false },
      { name: "AirPods", label: "AirPods Pro", priority: 2, icon: "airpods", hidden: false },
      { name: "EDIFIER M60", label: "Edifier M60", priority: 3, icon: "edifier", hidden: false },
      { name: "Wave:3", label: "Wave:3 Headphones", priority: 4, icon: "wave3", hidden: false },
    ],
    inputGuard: "Wave:3",
    showAllDevices: false,
  };
}

describe("updateDevicePriority", () => {
  it("moves a device up in priority", () => {
    const config = createConfig();

    const updated = updateDevicePriority(config, "EDIFIER M60", "up");

    const priorities = updated.devices.map((d) => ({ name: d.name, priority: d.priority }));
    expect(priorities).to.deep.equal([
      { name: "WH-1000XM6", priority: 1 },
      { name: "EDIFIER M60", priority: 2 },
      { name: "AirPods", priority: 3 },
      { name: "Wave:3", priority: 4 },
    ]);
  });

  it("moves a device down in priority", () => {
    const config = createConfig();

    const updated = updateDevicePriority(config, "AirPods", "down");

    const priorities = updated.devices.map((d) => ({ name: d.name, priority: d.priority }));
    expect(priorities).to.deep.equal([
      { name: "WH-1000XM6", priority: 1 },
      { name: "EDIFIER M60", priority: 2 },
      { name: "AirPods", priority: 3 },
      { name: "Wave:3", priority: 4 },
    ]);
  });

  it("does nothing when moving the first device up", () => {
    const config = createConfig();

    const updated = updateDevicePriority(config, "WH-1000XM6", "up");

    expect(updated.devices.map((d) => d.priority)).to.deep.equal([1, 2, 3, 4]);
  });

  it("does nothing when moving the last device down", () => {
    const config = createConfig();

    const updated = updateDevicePriority(config, "Wave:3", "down");

    expect(updated.devices.map((d) => d.priority)).to.deep.equal([1, 2, 3, 4]);
  });
});

describe("toggleDeviceHidden", () => {
  it("hides a visible device", () => {
    const config = createConfig();

    const updated = toggleDeviceHidden(config, "EDIFIER M60");

    const edifier = updated.devices.find((d) => d.name === "EDIFIER M60");
    expect(edifier?.hidden).to.equal(true);
  });

  it("shows a hidden device", () => {
    const config = createConfig();
    config.devices[2].hidden = true;

    const updated = toggleDeviceHidden(config, "EDIFIER M60");

    const edifier = updated.devices.find((d) => d.name === "EDIFIER M60");
    expect(edifier?.hidden).to.equal(false);
  });
});
