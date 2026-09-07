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
  -- Each entry is a list: {App Name, Bundle Identifier}
  set appList to {{"Logi Tune", "com.logitech.logitune"}, ¬
                  {"Elgato Wave Link", "com.elgato.WaveLink"}, ¬
                  {"Elgato Stream Deck", "com.elgato.StreamDeck"}, ¬
                  {"ScanSnap Home", "com.fujitsu.pfu.ScanSnapHome"}}
  
  repeat with appInfo in appList
    set appName to item 1 of appInfo
    set appId to item 2 of appInfo
    try
      tell application id appId to quit
    on error errMsg number errNum
      if errNum is -128 then
        log "User canceled quitting " & appName & "; ignoring."
      else
        log "Error closing " & appName & ": " & errMsg
      end if
    end try
  end repeat
end run
