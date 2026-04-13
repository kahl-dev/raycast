#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title restart Kanata
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon ./assets/kanata-icon.svg

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description This script restarts the Kanata service.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

sudo ~/.dotfiles/.config/kanata/restart.kanata.sh
