/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Protocols Directory - Directory where MeetingTranscriber writes generated meeting protocols */
  "protocolsDir": string,
  /** Vault Transcripts Directory - Obsidian vault directory containing transcripts and protocols */
  "vaultTranscriptsDir": string,
  /** Claude Binary Path - Path to the claude CLI binary used to generate meeting protocols */
  "claudeBin": string,
  /** MeetingTranscriber API Base URL - Base URL of the MeetingTranscriber Local Automation API */
  "mtBaseUrl": string,
  /** MeetingTranscriber Token Path - Path to the MeetingTranscriber Local Automation API token file */
  "mtTokenPath": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `transcribe-file` command */
  export type TranscribeFile = ExtensionPreferences & {}
  /** Preferences accessible in the `recording-status` command */
  export type RecordingStatus = ExtensionPreferences & {}
  /** Preferences accessible in the `open-latest-protocol` command */
  export type OpenLatestProtocol = ExtensionPreferences & {}
  /** Preferences accessible in the `list-transcripts` command */
  export type ListTranscripts = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `transcribe-file` command */
  export type TranscribeFile = {}
  /** Arguments passed to the `recording-status` command */
  export type RecordingStatus = {}
  /** Arguments passed to the `open-latest-protocol` command */
  export type OpenLatestProtocol = {}
  /** Arguments passed to the `list-transcripts` command */
  export type ListTranscripts = {}
}

