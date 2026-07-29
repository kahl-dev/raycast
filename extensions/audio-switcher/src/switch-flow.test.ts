import { describe, it, expect } from "vitest";
import { performSwitch } from "./switch-flow";

function createFakeDeps(overrides: {
  switchToDevice: (deviceId: string) => Promise<boolean>;
}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      notePick: async (name: string) => {
        calls.push(`notePick:${name}`);
      },
      revertPick: async () => {
        calls.push("revertPick");
      },
      switchToDevice: async (deviceId: string) => {
        calls.push(`switchToDevice:${deviceId}`);
        return overrides.switchToDevice(deviceId);
      },
    },
  };
}

describe("performSwitch", () => {
  it("notes the pick before switching the device", async () => {
    const { calls, deps } = createFakeDeps({ switchToDevice: async () => true });

    await performSwitch(deps, "device-1", "Sony XM6");

    expect(calls).to.deep.equal(["notePick:Sony XM6", "switchToDevice:device-1"]);
  });

  it("reverts the pick when switchToDevice resolves false", async () => {
    const { calls, deps } = createFakeDeps({ switchToDevice: async () => false });

    const result = await performSwitch(deps, "device-1", "Sony XM6");

    expect(result).to.equal(false);
    expect(calls).to.deep.equal(["notePick:Sony XM6", "switchToDevice:device-1", "revertPick"]);
  });

  it("reverts the pick and resolves false when switchToDevice rejects", async () => {
    const { calls, deps } = createFakeDeps({
      switchToDevice: async () => {
        throw new Error("CLI failure");
      },
    });

    const result = await performSwitch(deps, "device-1", "Sony XM6");

    expect(result).to.equal(false);
    expect(calls).to.deep.equal(["notePick:Sony XM6", "switchToDevice:device-1", "revertPick"]);
  });

  it("does not revert the pick on a successful switch", async () => {
    const { calls, deps } = createFakeDeps({ switchToDevice: async () => true });

    const result = await performSwitch(deps, "device-1", "Sony XM6");

    expect(result).to.equal(true);
    expect(calls).to.deep.equal(["notePick:Sony XM6", "switchToDevice:device-1"]);
  });
});
