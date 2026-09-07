/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `switch-output` command */
  export type SwitchOutput = ExtensionPreferences & {}
  /** Preferences accessible in the `switch-input` command */
  export type SwitchInput = ExtensionPreferences & {}
  /** Preferences accessible in the `toggle-mic-mute` command */
  export type ToggleMicMute = ExtensionPreferences & {}
  /** Preferences accessible in the `toggle-automation` command */
  export type ToggleAutomation = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `switch-output` command */
  export type SwitchOutput = {}
  /** Arguments passed to the `switch-input` command */
  export type SwitchInput = {}
  /** Arguments passed to the `toggle-mic-mute` command */
  export type ToggleMicMute = {}
  /** Arguments passed to the `toggle-automation` command */
  export type ToggleAutomation = {}
}

