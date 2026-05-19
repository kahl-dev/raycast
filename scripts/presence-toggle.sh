#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title toggle Presence
# @raycast.mode compact
# @raycast.packageName Kahl-dev scripts

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Toggle F15-Pulse to prevent Teams/Slack idle-yellow
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

/opt/homebrew/bin/hs -c "require('modules.presence-keeper').toggle()" < /dev/null
