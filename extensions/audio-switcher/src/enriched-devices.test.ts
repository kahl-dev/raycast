import { describe, it, expect } from "vitest";
import { enrichDevices } from "./enriched-devices";
import type { AudioDevice, AudioManagerConfig } from "./types";

const platformDevices: AudioDevice[] = [
  { id: "1", name: "EDIFIER M60", transportType: "usb", isOutput: true, isInput: false },
  { id: "2", name: "MacBook Pro Speakers", transportType: "builtin", isOutput: true, isInput: false },
  { id: "3", name: "WH-1000XM6", transportType: "bluetooth", isOutput: true, isInput: true },
  { id: "4", name: "LG Ultra HD", transportType: "displayport", isOutput: true, isInput: false },
  { id: "5", name: "Microsoft Teams Audio", transportType: "virtual", isOutput: true, isInput: false },
];

const config: AudioManagerConfig = {
  devices: [
    { name: "WH-1000XM6", label: "Sony XM6", priority: 1, icon: "sony-xm6", hidden: false },
    { name: "EDIFIER M60", label: "Edifier M60", priority: 3, icon: "edifier", hidden: false },
    { name: "MacBook Pro Speakers", label: "MacBook Speakers", priority: 5, icon: "macbook", hidden: false },
    { name: "Wave:3", label: "Wave:3 Headphones", priority: 4, icon: "wave3", hidden: false },
  ],
  inputGuard: "Wave:3",
  showAllDevices: false,
};

describe("enrichDevices", () => {
  it("sorts configured devices by priority", () => {
    const result = enrichDevices(platformDevices, config, false);

    const names = result.map((device) => device.label);
    expect(names).to.deep.equal([
      "Sony XM6",
      "Edifier M60",
      "Wave:3 Headphones",
      "MacBook Speakers",
    ]);
  });

  it("uses config label instead of raw device name", () => {
    const result = enrichDevices(platformDevices, config, false);

    const edifier = result.find((device) => device.name === "EDIFIER M60");
    expect(edifier?.label).to.equal("Edifier M60");
  });

  it("hides unconfigured devices by default", () => {
    const result = enrichDevices(platformDevices, config, false);

    const hasLG = result.some((device) => device.name === "LG Ultra HD");
    const hasTeams = result.some((device) => device.name === "Microsoft Teams Audio");
    expect(hasLG).to.equal(false);
    expect(hasTeams).to.equal(false);
  });

  it("shows unconfigured devices when showAll is true", () => {
    const result = enrichDevices(platformDevices, config, true);

    const names = result.map((device) => device.label);
    expect(names).to.deep.equal([
      "Sony XM6",
      "Edifier M60",
      "Wave:3 Headphones",
      "MacBook Speakers",
      "LG Ultra HD",
      "Microsoft Teams Audio",
    ]);
  });

  it("marks unconfigured devices as not configured", () => {
    const result = enrichDevices(platformDevices, config, true);

    const lg = result.find((device) => device.name === "LG Ultra HD");
    expect(lg?.configured).to.equal(false);
    expect(lg?.label).to.equal("LG Ultra HD");
  });

  it("shows disconnected known devices as not connected", () => {
    const result = enrichDevices(platformDevices, config, false);

    const wave3 = result.find((device) => device.name === "Wave:3");
    expect(wave3).to.not.equal(undefined);
    expect(wave3?.connected).to.equal(false);
  });

  it("marks connected known devices as connected", () => {
    const result = enrichDevices(platformDevices, config, false);

    const edifier = result.find((device) => device.name === "EDIFIER M60");
    expect(edifier?.connected).to.equal(true);
  });

  it("hides hidden configured devices by default", () => {
    const hiddenConfig = {
      ...config,
      devices: config.devices.map((d) =>
        d.name === "EDIFIER M60" ? { ...d, hidden: true } : d,
      ),
    };
    const result = enrichDevices(platformDevices, hiddenConfig, false);

    const hasEdifier = result.some((device) => device.name === "EDIFIER M60");
    expect(hasEdifier).to.equal(false);
  });

  it("shows hidden configured devices in showAll with hidden flag", () => {
    const hiddenConfig = {
      ...config,
      devices: config.devices.map((d) =>
        d.name === "EDIFIER M60" ? { ...d, hidden: true } : d,
      ),
    };
    const result = enrichDevices(platformDevices, hiddenConfig, true);

    const edifier = result.find((device) => device.name === "EDIFIER M60");
    expect(edifier).to.not.equal(undefined);
    expect(edifier?.hidden).to.equal(true);
  });

  it("unconfigured devices in showAll are sorted after configured ones by name", () => {
    const result = enrichDevices(platformDevices, config, true);

    const unconfigured = result.filter((device) => !device.configured);
    const names = unconfigured.map((device) => device.name);
    expect(names).to.deep.equal(["LG Ultra HD", "Microsoft Teams Audio"]);
  });
});
