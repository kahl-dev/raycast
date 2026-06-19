import { Icon } from "@raycast/api";
import type { TransportType } from "./types";

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  bluetooth: "Bluetooth",
  builtin: "Built-in",
  usb: "USB",
  displayport: "DisplayPort",
  hdmi: "HDMI",
  airplay: "AirPlay",
  virtual: "Virtual",
  unknown: "Unknown",
};

export const TRANSPORT_ICONS: Record<TransportType, Icon> = {
  bluetooth: Icon.Signal3,
  builtin: Icon.Speaker,
  usb: Icon.SpeakerHigh,
  displayport: Icon.Monitor,
  hdmi: Icon.Monitor,
  airplay: Icon.Wifi,
  virtual: Icon.Network,
  unknown: Icon.QuestionMark,
};
