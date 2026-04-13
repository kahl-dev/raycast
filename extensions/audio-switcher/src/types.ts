export type TransportType =
  | "bluetooth"
  | "builtin"
  | "usb"
  | "displayport"
  | "hdmi"
  | "airplay"
  | "virtual"
  | "unknown";

export interface AudioDevice {
  id: string;
  name: string;
  transportType: TransportType;
  isOutput: boolean;
  isInput: boolean;
}

export interface AudioPlatform {
  getAllDevices(): Promise<AudioDevice[]>;
  getDefaultOutputDevice(): Promise<AudioDevice | null>;
  setDefaultOutputDevice(deviceId: string): Promise<boolean>;
}

export interface DeviceConfig {
  name: string;
  label: string;
  priority: number;
  icon: string;
  hidden: boolean;
  bluetooth?: { mac: string };
}

export interface AudioManagerConfig {
  devices: DeviceConfig[];
  inputGuard: string;
  showAllDevices: boolean;
}

export interface BluetoothAdapter {
  isConnected(mac: string): Promise<boolean>;
  connect(mac: string): Promise<boolean>;
  disconnect(mac: string): Promise<boolean>;
}

export interface EnrichedDevice extends AudioDevice {
  label: string;
  priority: number;
  connected: boolean;
  configured: boolean;
  hidden: boolean;
  icon: string;
  bluetoothMac: string;
}
