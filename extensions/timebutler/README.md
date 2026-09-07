# Time-Butler

LIA Time-Butler Awareness-Hub für Raycast. 7 Commands + Menu Bar, alle read-only, alle shellen zu den existierenden Python-Scripts des `timebutler` Claude-Skills.

## Commands

- **Team Heute** — Wer ist heute weg und warum (Status-Codes: Urlaub, Krankheit, Arzt, Außentermin, …)
- **Mein Urlaubsstand** — Resturlaub + nächster geplanter Urlaub
- **Time-Butler Menu Bar** — Always-on macOS Menubar mit Team-Count + Urlaubsstand + nächstem Feiertag
- **Brückentage Optimizer** — Klassische Brückentage + Brückenwochen mit Hebel-Anzeige (1d → 4d, 5d → 11d ⚡)
- **Meine Abwesenheiten** — Eigene Abwesenheiten mit Filter (Upcoming/Krankheit/Urlaub/Termine) + Jahres-Switch
- **Team-Kalender Woche** — Wochenansicht aller Kollegen
- **Feiertage NRW** — NRW-Feiertage mit Countdown

## Setup

1. Time-Butler Login-Daten in Raycast Preferences eintragen (Email, Password, User-ID, iCal-URL).
2. Sicherstellen dass `~/code/src/github.com/kahl-dev/claude-config/skills/timebutler/scripts/*.py` existieren (Python-Skill).
3. uv-Binary muss installiert sein (Default-Path: `~/.local/bin/uv`).

## Architektur

Reads-only. Extension shellt zu den existierenden Python-Scripts mit `--json` Flag, parsed Output in TypeScript-Interfaces. Skill-Cache (1h-24h TTL pro Endpoint) plus Raycast `useCachedPromise` on top.

## Phase 2 (deferred)

- Urlaub eintragen, Krankheit eintragen (Form-POST-Scraping)
- Detail-Panel rechts in List-Commands
- Brückentag → Deep-Link in TB Vacation-Request mit pre-filled Range
- AI-Summary via Raycast AI ("Plan deine Sommerurlaube optimal")
