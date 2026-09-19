#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Transcribe YouTube Playlist
# @raycast.mode compact
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon ./assets/transcribe-youtube-icon.svg

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Fetch new videos from the intake playlist now and write transcripts and overviews to ~/intake/youtube. Triggers the hourly launchd job once; its schedule stays unchanged.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

set -euo pipefail

service="gui/$(/usr/bin/id -u)/com.kahl-dev.intake-youtube"

# Without -k, kickstart silently does nothing for a running job; say so instead.
if /bin/launchctl print "$service" | /usr/bin/grep -q "state = running"; then
  echo "YouTube transcription is already running"
  exit 0
fi

/bin/launchctl kickstart "$service"
echo "YouTube transcription started, results in ~/intake/youtube"
