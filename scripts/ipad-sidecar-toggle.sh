#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title iPad Sidecar Toggle
# @raycast.mode compact
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon 💻

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Connect/disconnect iPad as extended display (Sidecar)
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

set -euo pipefail

# Resolve the vendored binary as a sibling of the real script file, following
# a symlink if the script is deployed via one (dotfiles pattern).
self="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || printf '%s' "${BASH_SOURCE[0]}")"
binary="$(cd "$(dirname "$self")" && pwd -P)/sidecar-connect/sidecar-connect"

# SIDECAR_DEVICE (optional env override) = case-insensitive substring of the
# iPad name. Unset/empty targets the first Sidecar device found.
exec "$binary" toggle "${SIDECAR_DEVICE:-}"
