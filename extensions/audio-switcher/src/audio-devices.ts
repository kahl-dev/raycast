import type { AudioDevice, AudioPlatform } from "./types";

export class AudioDeviceManager {
  constructor(private platform: AudioPlatform) {}

  async getOutputDevices(): Promise<AudioDevice[]> {
    const allDevices = await this.platform.getAllDevices();
    return allDevices
      .filter((device) => device.isOutput)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getActiveDevice(): Promise<AudioDevice | null> {
    return this.platform.getDefaultOutputDevice();
  }

  async switchToDevice(deviceId: string): Promise<boolean> {
    return this.platform.setDefaultOutputDevice(deviceId);
  }
}
