import { describe, it, expect } from "vitest";
import { createMacOSPlatform, type DeviceRunner, type NativeDevice } from "./platform-macos-core";

const devices: NativeDevice[] = [
  { id: 1, name: "EDIFIER M60", transportType: "usb", isOutput: true, isInput: false },
  { id: 2, name: "MacBook Pro Speakers", transportType: "builtin", isOutput: true, isInput: false },
  { id: 5, name: "WH-1000XM6", transportType: "bluetooth", isOutput: true, isInput: true },
];

// Stateful fake of the `audio-devices` CLI.
// `revertTo` simulates the daemon/macOS pulling the default elsewhere after a set.
function fakeRunner(opts: { current: NativeDevice | null; revertTo?: NativeDevice | null }): DeviceRunner {
  let current = opts.current;
  return async (args) => {
    const [verb, action, id] = args;
    if (verb === "list") return JSON.stringify(devices);
    if (verb === "output" && action === "get") return current ? JSON.stringify(current) : "";
    if (verb === "output" && action === "set") {
      current = opts.revertTo !== undefined ? opts.revertTo : (devices.find((d) => String(d.id) === id) ?? null);
      return "";
    }
    return "";
  };
}

describe("createMacOSPlatform", () => {
  describe("setDefaultOutputDevice (honest read-back)", () => {
    it("returns true when the switch actually takes effect", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: devices[1] }));

      const result = await platform.setDefaultOutputDevice("5");

      expect(result).to.equal(true);
    });

    it("returns false when something reverts the default after the set", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: devices[1], revertTo: devices[0] }));

      const result = await platform.setDefaultOutputDevice("5");

      expect(result).to.equal(false);
    });

    it("returns false when the default reads back empty", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: devices[1], revertTo: null }));

      const result = await platform.setDefaultOutputDevice("5");

      expect(result).to.equal(false);
    });
  });

  describe("getDefaultOutputDevice", () => {
    it("maps the current default device", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: devices[2] }));

      const active = await platform.getDefaultOutputDevice();

      expect(active?.name).to.equal("WH-1000XM6");
    });

    it("returns null when no default is set (empty output)", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: null }));

      const active = await platform.getDefaultOutputDevice();

      expect(active).to.equal(null);
    });
  });

  describe("getAllDevices", () => {
    it("parses and normalizes the device list", async () => {
      const platform = createMacOSPlatform(fakeRunner({ current: null }));

      const all = await platform.getAllDevices();

      expect(all.map((d) => d.id)).to.deep.equal(["1", "2", "5"]);
      expect(all[2].transportType).to.equal("bluetooth");
    });
  });

  describe("subprocess failure (rejection paths)", () => {
    const rejectingRunner: DeviceRunner = async () => {
      throw new Error("audio-devices spawn ENOENT");
    };

    it("getAllDevices rejects when the runner fails", async () => {
      const platform = createMacOSPlatform(rejectingRunner);

      await expect(platform.getAllDevices()).rejects.toThrow("ENOENT");
    });

    it("getDefaultOutputDevice rejects when the runner fails", async () => {
      const platform = createMacOSPlatform(rejectingRunner);

      await expect(platform.getDefaultOutputDevice()).rejects.toThrow("ENOENT");
    });

    it("setDefaultOutputDevice rejects when the set call fails", async () => {
      const platform = createMacOSPlatform(rejectingRunner);

      await expect(platform.setDefaultOutputDevice("5")).rejects.toThrow("ENOENT");
    });

    it("getAllDevices rejects on malformed JSON", async () => {
      const platform = createMacOSPlatform(async () => "not valid json");

      await expect(platform.getAllDevices()).rejects.toThrow();
    });
  });
});
