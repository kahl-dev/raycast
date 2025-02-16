#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Sidecar
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts
#
# Optional parameters:
# @raycast.icon 💻
#
# Documentation:
# @raycast.description Toggle Sidecar (Connect or Disconnect iPad)
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev
#
# Attribution:
# Original idea and base code from: https://github.com/kovstas/alfred-sidecar
# Modified for Raycast compatibility

on run
    -- Open Displays settings
    do shell script "open -b com.apple.systempreferences /System/Library/PreferencePanes/Displays.prefPane"

    -- Set device name, allowing an override via an environment variable
    set device to (system attribute "SIDECAR_DEVICE")
    if device is missing value or device is "" then
        set device to "iPad"
    end if

    tell application "System Events"
        repeat until (exists window "Displays" of application process "System Settings")
            delay 0.1
        end repeat

        tell process "System Settings"
            set popUpButton to pop up button 1 of group 1 of group 2 of splitter group 1 of group 1 of window "Displays"
            
            repeat until exists popUpButton
                delay 0.1
            end repeat

            click popUpButton

            repeat until exists menu 1 of popUpButton
                delay 0.1
            end repeat

            tell menu 1 of popUpButton
                set menuItem to (first menu item whose name contains device)

                -- Wait for the menu item to appear
                repeat until exists menuItem
                    delay 0.1
                end repeat

                click menuItem

                -- Wait until the menu is no longer visible
                repeat while exists menu 1 of popUpButton
                    delay 0.1
                end repeat
            end tell
        end tell
    end tell

    tell application "System Settings" to quit

    -- Log success message
    log "✅ Sidecar successfully toggled for device: " & device
end run
