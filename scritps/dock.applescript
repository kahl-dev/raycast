#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Dock
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts
#
# Optional parameters:
# @raycast.icon 🔌
#
# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description This script will open all applications needed for the macbook docking mode 
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

on run
  set appList to {"Elgato Wave Link", "Elgato Stream Deck"}
  
  repeat with appName in appList
    tell application appName to launch
  end repeat
  
  display notification "All docking apps have been opened." with title "Dock Mode"
end run
