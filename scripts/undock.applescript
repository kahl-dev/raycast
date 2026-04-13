#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Undock
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts
#
# Optional parameters:
# @raycast.icon 🔌
#
# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description This script will close all applications started in docking mode.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

on run
  set appList to {"Logi Tune", "Elgato Wave Link", "Elgato Stream Deck"}
  
  repeat with appName in appList
    try
      tell application appName to quit
    on error errMsg number errNum
      if errNum is -128 then
        log "User canceled quitting " & appName & "; ignoring."
      else
        log "Error closing " & appName & ": " & errMsg
      end if
    end try
  end repeat
end run
