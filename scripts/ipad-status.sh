#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title iPad Status
# @raycast.mode compact
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon 📱

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Show Sidecar connection status of the iPad
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

set -euo pipefail

# Resolve the vendored binary as a sibling of the real script file, following
# a symlink if the script is deployed via one (dotfiles pattern).
self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || printf '%s' "${BASH_SOURCE[0]}")"
binary="$(cd "$(dirname "$self")" && pwd -P)/sidecar-connect/sidecar-connect"

# `list` marks connected devices with ● and merely-reachable ones with ○.
# `|| true` keeps a non-zero binary exit (Gatekeeper quarantine, changed private
# API) from aborting under `set -e` (bash 3.2) so the 💤 fallback still shows.
output="$("$binary" list 2>/dev/null || true)"

# Restrict to the same device the toggle command targets, when SIDECAR_DEVICE is set.
if [ -n "${SIDECAR_DEVICE:-}" ]; then
    output="$(printf '%s\n' "$output" | grep -i -- "$SIDECAR_DEVICE" || true)"
fi

# First name for a marker, with the marker and the binary's two-space
# "  (connected)" sentinel stripped. Literal markers (not a [●○] bracket) keep
# the strip correct under the C/POSIX locale Raycast often runs scripts in.
name_for() {
    printf '%s\n' "$output" | grep -m1 "^[[:space:]]*$1" \
        | sed "s/^[[:space:]]*$1[[:space:]]*//; s/  (connected)\$//" || true
}

connected="$(name_for '●')"
reachable="$(name_for '○')"

if [ -n "$connected" ]; then
    echo "🖥️ Sidecar verbunden: $connected"
elif [ -n "$reachable" ]; then
    echo "📱 iPad bereit: $reachable"
else
    echo "💤 Kein iPad erreichbar (wach + entsperrt?)"
fi
