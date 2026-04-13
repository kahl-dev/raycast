import { describe, it, expect } from "vitest";
import { AudioDeviceManager } from "./audio-devices";
import type { AudioDevice, AudioPlatform } from "./types";

function createFakePlatform(devices: AudioDevice[], defaultOutputId?: string): AudioPlatform {
  return {
    getAllDevices: async () => devices,
    getDefaultOutputDevice: async () =>
      devices.find((device) => device.id === defaultOutputId) ?? null,
    setDefaultOutputDevice: async (deviceId: string) =>
      devices.some((device) => device.id === deviceId),
  };
}

const fakeDevices: AudioDevice[] = [
  { id: "1", name: "EDIFIER M60", transportType: "usb", isOutput: true, isInput: false },
  { id: "2", name: "MacBook Pro Speakers", transportType: "builtin", isOutput: true, isInput: false },
  { id: "3", name: "Wave:3", transportType: "usb", isOutput: true, isInput: true },
  { id: "4", name: "MacBook Pro Microphone", transportType: "builtin", isOutput: false, isInput: true },
  { id: "5", name: "WH-1000XM6", transportType: "bluetooth", isOutput: true, isInput: true },
  { id: "6", name: "LG Ultra HD", transportType: "displayport", isOutput: true, isInput: false },
];

describe("AudioDeviceManager", () => {
  describe("getOutputDevices", () => {
    it("returns only output-capable devices", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices));

      const outputs = await manager.getOutputDevices();

      expect(outputs.map((device) => device.name)).to.deep.equal([
        "EDIFIER M60",
        "LG Ultra HD",
        "MacBook Pro Speakers",
        "Wave:3",
        "WH-1000XM6",
      ]);
    });

    it("excludes input-only devices", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices));

      const outputs = await manager.getOutputDevices();

      const hasMicOnly = outputs.some((device) => device.name === "MacBook Pro Microphone");
      expect(hasMicOnly).to.equal(false);
    });
  });

  describe("getActiveDevice", () => {
    it("returns the current default output device", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices, "1"));

      const active = await manager.getActiveDevice();

      expect(active?.name).to.equal("EDIFIER M60");
    });

    it("returns null when no default output is set", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices));

      const active = await manager.getActiveDevice();

      expect(active).to.equal(null);
    });
  });

  describe("switchToDevice", () => {
    it("switches to a known device and returns true", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices, "2"));

      const result = await manager.switchToDevice("1");

      expect(result).to.equal(true);
    });

    it("returns false for an unknown device id", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices));

      const result = await manager.switchToDevice("999");

      expect(result).to.equal(false);
    });
  });

  describe("transport type", () => {
    it("preserves transport type from platform for each device", async () => {
      const manager = new AudioDeviceManager(createFakePlatform(fakeDevices));

      const outputs = await manager.getOutputDevices();
      const transportByName = Object.fromEntries(
        outputs.map((device) => [device.name, device.transportType]),
      );

      expect(transportByName).to.deep.equal({
        "EDIFIER M60": "usb",
        "LG Ultra HD": "displayport",
        "MacBook Pro Speakers": "builtin",
        "Wave:3": "usb",
        "WH-1000XM6": "bluetooth",
      });
    });
  });
});
