import { describe, it, expect } from "vitest";
import { createMacOSPlatform, type DeviceRunner, type NativeDevice } from "./platform-macos-core";

const devices: NativeDevice[] = [
  { id: 1, name: "EDIFIER M60", transportType: "usb", isOutput: true, isInput: false },
  { id: 2, name: "MacBook Pro Speakers", transportType: "builtin", isOutput: true, isInput: false },
  { id: 5, name: "WH-1000XM6", transportType: "bluetooth", isOutput: true, isInput: true },
  { id: 7, name: "Elgato Wave:3", transportType: "usb", isOutput: true, isInput: true },
];

// Stateful fake of the `audio-devices` CLI, tracking the output and input defaults separately.
// `revertTo` simulates the daemon/macOS pulling the default elsewhere after a set.
function fakeRunner(opts: {
  output?: NativeDevice | null;
  input?: NativeDevice | null;
  revertTo?: NativeDevice | null;
}): DeviceRunner {
  const current: Record<string, NativeDevice | null> = {
    output: opts.output ?? null,
    input: opts.input ?? null,
  };
  return async (args) => {
    const [verb, action, id] = args;
    if (verb === "list") return JSON.stringify(devices);
    if ((verb === "output" || verb === "input") && action === "get") {
      return current[verb] ? JSON.stringify(current[verb]) : "";
    }
    if ((verb === "output" || verb === "input") && action === "set") {
      current[verb] =
        opts.revertTo !== undefined ? opts.revertTo : (devices.find((d) => String(d.id) === id) ?? null);
      return "";
    }
    return "";
  };
}

describe("createMacOSPlatform", () => {
  describe("setDefaultOutputDevice (honest read-back)", () => {
    it("returns true when the switch actually takes effect", async () => {
      const platform = createMacOSPlatform(fakeRunner({ output: devices[1] }));
      expect(await platform.setDefaultOutputDevice("5")).to.equal(true);
    });

    it("returns false when something reverts the default after the set", async () => {
      const platform = createMacOSPlatform(fakeRunner({ output: devices[1], revertTo: devices[0] }));
      expect(await platform.setDefaultOutputDevice("5")).to.equal(false);
    });

    it("returns false when the default reads back empty", async () => {
      const platform = createMacOSPlatform(fakeRunner({ output: devices[1], revertTo: null }));
      expect(await platform.setDefaultOutputDevice("5")).to.equal(false);
    });
  });

  describe("setDefaultInputDevice (honest read-back)", () => {
    it("returns true when the input switch takes effect", async () => {
      const platform = createMacOSPlatform(fakeRunner({ input: devices[3] }));
      expect(await platform.setDefaultInputDevice("5")).to.equal(true);
    });

    it("returns false when the input default reverts after the set", async () => {
      const platform = createMacOSPlatform(fakeRunner({ input: devices[3], revertTo: devices[3] }));
      expect(await platform.setDefaultInputDevice("5")).to.equal(false);
    });

    it("does not touch the output default when switching input", async () => {
      const runner = fakeRunner({ output: devices[1], input: devices[3] });
      const platform = createMacOSPlatform(runner);
      await platform.setDefaultInputDevice("5");
      expect((await platform.getDefaultOutputDevice())?.name).to.equal("MacBook Pro Speakers");
    });
  });

  describe("getDefault{Output,Input}Device", () => {
    it("maps the current output default", async () => {
      const platform = createMacOSPlatform(fakeRunner({ output: devices[2] }));
      expect((await platform.getDefaultOutputDevice())?.name).to.equal("WH-1000XM6");
    });

    it("maps the current input default", async () => {
      const platform = createMacOSPlatform(fakeRunner({ input: devices[3] }));
      expect((await platform.getDefaultInputDevice())?.name).to.equal("Elgato Wave:3");
    });

    it("returns null when no default is set (empty output)", async () => {
      const platform = createMacOSPlatform(fakeRunner({}));
      expect(await platform.getDefaultOutputDevice()).to.equal(null);
      expect(await platform.getDefaultInputDevice()).to.equal(null);
    });
  });

  describe("getAllDevices", () => {
    it("parses and normalizes the device list", async () => {
      const platform = createMacOSPlatform(fakeRunner({}));
      const all = await platform.getAllDevices();
      expect(all.map((d) => d.id)).to.deep.equal(["1", "2", "5", "7"]);
      expect(all[2].transportType).to.equal("bluetooth");
    });
  });

  describe("subprocess failure (rejection paths)", () => {
    const rejectingRunner: DeviceRunner = async () => {
      throw new Error("audio-devices spawn ENOENT");
    };

    it("getAllDevices rejects when the runner fails", async () => {
      await expect(createMacOSPlatform(rejectingRunner).getAllDevices()).rejects.toThrow("ENOENT");
    });

    it("getDefaultOutputDevice rejects when the runner fails", async () => {
      await expect(createMacOSPlatform(rejectingRunner).getDefaultOutputDevice()).rejects.toThrow("ENOENT");
    });

    it("setDefaultOutputDevice rejects when the set call fails", async () => {
      await expect(createMacOSPlatform(rejectingRunner).setDefaultOutputDevice("5")).rejects.toThrow("ENOENT");
    });

    it("setDefaultInputDevice rejects when the set call fails", async () => {
      await expect(createMacOSPlatform(rejectingRunner).setDefaultInputDevice("5")).rejects.toThrow("ENOENT");
    });

    it("getAllDevices rejects on malformed JSON", async () => {
      await expect(createMacOSPlatform(async () => "not valid json").getAllDevices()).rejects.toThrow();
    });
  });
});
