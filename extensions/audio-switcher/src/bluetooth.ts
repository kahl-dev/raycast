import type { BluetoothAdapter } from "./types";

export class BluetoothManager {
  constructor(private adapter: BluetoothAdapter) {}

  async isConnected(mac: string): Promise<boolean> {
    return this.adapter.isConnected(mac);
  }

  async connect(mac: string): Promise<boolean> {
    return this.adapter.connect(mac);
  }

  async disconnect(mac: string): Promise<boolean> {
    return this.adapter.disconnect(mac);
  }
}
