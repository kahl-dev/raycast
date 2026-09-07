/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Time-Butler Email - Login-Email für Time-Butler */
  "tbUser": string,
  /** Time-Butler Password - Login-Passwort */
  "tbPassword": string,
  /** Time-Butler User-ID - Numerische User-ID aus Time-Butler Profile-URL (?id=...) */
  "tbUserId": string,
  /** Time-Butler iCal URL - Aus Einstellungen → Integration → Mit Kalender synchronisieren → Abonnement-Link */
  "tbIcalUrl": string,
  /** Time-Butler Instance - Base-URL der Time-Butler-Webapp */
  "tbInstance": string,
  /** Skill Scripts Path - Pfad zu den Time-Butler Python-Scripts (claude-config skill) */
  "skillPath": string,
  /** uv Binary Path - Absoluter Pfad zur uv-CLI */
  "uvBinary": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `team-today` command */
  export type TeamToday = ExtensionPreferences & {}
  /** Preferences accessible in the `my-vacation` command */
  export type MyVacation = ExtensionPreferences & {}
  /** Preferences accessible in the `menu-bar` command */
  export type MenuBar = ExtensionPreferences & {}
  /** Preferences accessible in the `bridge-days` command */
  export type BridgeDays = ExtensionPreferences & {}
  /** Preferences accessible in the `my-absences` command */
  export type MyAbsences = ExtensionPreferences & {}
  /** Preferences accessible in the `team-week` command */
  export type TeamWeek = ExtensionPreferences & {}
  /** Preferences accessible in the `holidays` command */
  export type Holidays = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `team-today` command */
  export type TeamToday = {}
  /** Arguments passed to the `my-vacation` command */
  export type MyVacation = {}
  /** Arguments passed to the `menu-bar` command */
  export type MenuBar = {}
  /** Arguments passed to the `bridge-days` command */
  export type BridgeDays = {}
  /** Arguments passed to the `my-absences` command */
  export type MyAbsences = {}
  /** Arguments passed to the `team-week` command */
  export type TeamWeek = {}
  /** Arguments passed to the `holidays` command */
  export type Holidays = {}
}

