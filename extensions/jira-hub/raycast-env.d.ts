/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Jira Instance URL - Base URL of your Atlassian Cloud instance (no trailing slash) */
  "instanceUrl": string,
  /** Atlassian Email - Email of your Atlassian account */
  "email": string,
  /** Atlassian API Token - Create at https://id.atlassian.com/manage-profile/security/api-tokens */
  "apiToken": string,
  /** Internal Project Keys - Comma-separated project keys NOT counted as customer (e.g. internal/dev projects) */
  "internalProjectKeys": string,
  /** Backlog/Dev Project Keys (dimmed, excluded from Needs-Action) - Comma-separated project keys for low-priority backlog projects. Tickets here are dimmed at the bottom and never bubble into Needs-Action, even if stale or overbooked. */
  "devProjectKeys": string,
  /** Internal Core Project Keys - Comma-separated project keys in the 'Intern' section (e.g. LIA,LIAKI,LIAC) */
  "internalCoreProjectKeys": string,
  /** Overbook Threshold (%) - Ticket flagged as overbooked when spent/estimate >= this percentage */
  "overbookThresholdPct": string,
  /** Reply-Needed Threshold (workdays) - Ticket flagged when last comment is from someone else and older than N workdays */
  "replyThresholdWorkdays": string,
  /** Stale Threshold (workdays) - In-Progress ticket flagged when no update for N workdays */
  "staleThresholdWorkdays": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `dashboard` command */
  export type Dashboard = ExtensionPreferences & {}
  /** Preferences accessible in the `menubar` command */
  export type Menubar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `dashboard` command */
  export type Dashboard = {}
  /** Arguments passed to the `menubar` command */
  export type Menubar = {}
}

