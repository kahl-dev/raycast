import { describe, it, expect } from "vitest";
import { BluetoothManager } from "./bluetooth";
import type { BluetoothAdapter } from "./types";

function createFakeAdapter(connectedMacs: string[]): BluetoothAdapter {
  const connected = new Set(connectedMacs);
  return {
    isConnected: async (mac: string) => connected.has(mac),
    connect: async (mac: string) => {
      connected.add(mac);
      return true;
    },
    disconnect: async (mac: string) => {
      connected.delete(mac);
      return true;
    },
  };
}

describe("BluetoothManager", () => {
  it("reports connected status for a connected device", async () => {
    const manager = new BluetoothManager(createFakeAdapter(["AA:BB:CC"]));

    const status = await manager.isConnected("AA:BB:CC");

    expect(status).to.equal(true);
  });

  it("reports disconnected status for an unknown device", async () => {
    const manager = new BluetoothManager(createFakeAdapter([]));

    const status = await manager.isConnected("AA:BB:CC");

    expect(status).to.equal(false);
  });

  it("connects a disconnected device", async () => {
    const manager = new BluetoothManager(createFakeAdapter([]));

    const result = await manager.connect("AA:BB:CC");

    expect(result).to.equal(true);
    expect(await manager.isConnected("AA:BB:CC")).to.equal(true);
  });

  it("disconnects a connected device", async () => {
    const manager = new BluetoothManager(createFakeAdapter(["AA:BB:CC"]));

    const result = await manager.disconnect("AA:BB:CC");

    expect(result).to.equal(true);
    expect(await manager.isConnected("AA:BB:CC")).to.equal(false);
  });
});
