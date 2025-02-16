#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title open clipboard url
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon 📋

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Open clipboard content as URL in default browser. Mostly for osc 52 url to handled from ssh.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

url=$(pbpaste)
if [[ "$url" =~ ^https?:// ]]; then
  open "$url"
else
  echo "No URL found in clipboard"
fi
