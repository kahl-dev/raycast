#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Jira
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon https://www.google.com/s2/favicons?domain=atlassian.net&sz=128
# @raycast.argument2 { "type": "text", "placeholder": "TICKET ID", "optional": true, "percentEncoded": false }

# Documentation:
# docs: https://github.com/raycast/script-commands?tab=readme-ov-file
# @raycast.description Open Jira dashboard or ticket.
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

BASEURL="https://louis-internet.atlassian.net"

# Function to validate a Jira ticket ID (e.g., ABC-123)
is_valid_ticket_id() {
  [[ $1 =~ ^[A-Z]+-[0-9]+$ ]]
}

# Open Jira dashboard if no argument is provided
if [[ -z "$1" ]]; then
  open "$BASEURL"
  exit 0
fi

# If argument is a valid Jira ticket ID, open it
if is_valid_ticket_id "$1"; then
  open "$BASEURL/browse/$1"
else
  echo "Invalid Jira ticket ID format. Expected format: ABC-123"
  exit 1
fi
