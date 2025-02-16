#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title stop Kanata
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon ./assets/kanata-icon.svg

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description This script stops the Kanata service.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

sudo ~/.dotfiles/.config/kanata/stop.kanata.sh
