import { execFile } from "child_process";
import { promisify } from "util";
import type { BluetoothAdapter } from "./types";

const execFileAsync = promisify(execFile);
const BLUEUTIL = "/opt/homebrew/bin/blueutil";

async function blueutil(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(BLUEUTIL, args);
  return stdout.trim();
}

export const macOSBluetoothAdapter: BluetoothAdapter = {
  async isConnected(mac: string): Promise<boolean> {
    const output = await blueutil(["--is-connected", mac]);
    return output === "1";
  },

  async connect(mac: string): Promise<boolean> {
    await blueutil(["--connect", mac]);
    return true;
  },

  async disconnect(mac: string): Promise<boolean> {
    await blueutil(["--disconnect", mac]);
    return true;
  },
};
