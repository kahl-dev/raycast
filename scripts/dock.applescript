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
  -- Each entry is a list: {App Name, Bundle Identifier}
  set appList to {{"Elgato Wave Link", "com.elgato.WaveLink"}, {"Elgato Stream Deck", "com.elgato.StreamDeck"}}
  
  repeat with appInfo in appList
    set appId to item 2 of appInfo
    tell application id appId to launch
  end repeat
  
  display notification "All docking apps have been opened." with title "Dock Mode"
end run
