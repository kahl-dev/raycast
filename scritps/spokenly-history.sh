#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Spokenly History
# @raycast.mode fullOutput
# @raycast.packageName Spokenly

# Optional parameters:
# @raycast.icon 🎙️
# @raycast.argument1 { "type": "text", "placeholder": "Search (optional)", "optional": true, "percentEncoded": false }

# Documentation:
# @raycast.description Access Spokenly transcription history - view, search, and copy to clipboard
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

# Constants
HISTORY_DIR="$HOME/Library/Containers/app.spokenly/Data/Library/Application Support/Spokenly/History"
SEARCH_QUERY="$1"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required for JSON parsing"
    echo ""
    echo "Install with: brew install jq"
    exit 1
fi

# Check if history directory exists
if [ ! -d "$HISTORY_DIR" ]; then
    echo "❌ Spokenly history directory not found"
    echo ""
    echo "Expected location: $HISTORY_DIR"
    echo ""
    echo "Make sure Spokenly is installed and has created at least one transcription."
    exit 1
fi

# Find all JSON files, sorted by modification time (most recent first)
json_files=()
while IFS= read -r file; do
    json_files+=("$file")
done < <(find "$HISTORY_DIR" -name "*.json" -type f -exec ls -t {} + 2>/dev/null)

# Check if any history files exist
if [ ${#json_files[@]} -eq 0 ]; then
    echo "📭 No transcription history found"
    echo ""
    echo "Spokenly hasn't created any transcriptions yet."
    exit 0
fi

# Function to extract text from JSON file
extract_text() {
    local file="$1"
    jq -r '.content.dictation._0.success._0.result.transcriptionData.segments[]?.text // empty' "$file" 2>/dev/null
}

# Function to extract timestamp from JSON file
extract_timestamp() {
    local file="$1"
    local cf_timestamp
    cf_timestamp=$(jq -r '.creationDate // empty' "$file" 2>/dev/null)

    if [ -n "$cf_timestamp" ]; then
        # Convert CoreFoundation timestamp (seconds since 2001-01-01) to Unix timestamp
        # Add 978307200 (seconds between 1970-01-01 and 2001-01-01)
        local unix_timestamp=$((${cf_timestamp%.*} + 978307200))
        date -r "$unix_timestamp" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "Unknown"
    else
        echo "Unknown"
    fi
}

# Build array of transcriptions
declare -a transcriptions
declare -a timestamps
declare -a filepaths

echo "🎙️  Spokenly Transcription History"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

count=0
for json_file in "${json_files[@]}"; do
    # Extract text and timestamp
    text=$(extract_text "$json_file")

    # Skip if text extraction failed or is empty
    if [ -z "$text" ]; then
        continue
    fi

    # If search query provided, filter results
    if [ -n "$SEARCH_QUERY" ]; then
        if ! echo "$text" | grep -qi "$SEARCH_QUERY"; then
            continue
        fi
    fi

    timestamp=$(extract_timestamp "$json_file")

    # Store for later
    transcriptions+=("$text")
    timestamps+=("$timestamp")
    filepaths+=("$json_file")

    count=$((count + 1))

    # Create preview (first 100 chars)
    preview="${text:0:100}"
    if [ ${#text} -gt 100 ]; then
        preview="${preview}..."
    fi

    # Display entry
    echo "[$count] $timestamp"
    echo "    $preview"
    echo ""

    # Limit to 20 most recent for readability
    if [ $count -ge 20 ]; then
        echo "... (showing 20 most recent, ${#json_files[@]} total)"
        echo ""
        break
    fi
done

# Check if any results after filtering
if [ $count -eq 0 ]; then
    if [ -n "$SEARCH_QUERY" ]; then
        echo "🔍 No transcriptions found matching: \"$SEARCH_QUERY\""
    else
        echo "📭 No valid transcriptions found"
    fi
    exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Enter number to copy to clipboard (or press Enter to exit):"
read -r selection

# Validate selection
if [ -z "$selection" ]; then
    echo "👋 Exited without copying"
    exit 0
fi

# Check if selection is a valid number
if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    echo "❌ Invalid selection: must be a number"
    exit 1
fi

# Check if selection is in range
if [ "$selection" -lt 1 ] || [ "$selection" -gt "$count" ]; then
    echo "❌ Invalid selection: must be between 1 and $count"
    exit 1
fi

# Get selected transcription (array is 0-indexed)
selected_index=$((selection - 1))
selected_text="${transcriptions[$selected_index]}"
selected_timestamp="${timestamps[$selected_index]}"

# Copy to clipboard
echo "$selected_text" | pbcopy

# Confirmation
echo ""
echo "✅ Copied to clipboard!"
echo ""
echo "📅 $selected_timestamp"
echo "📝 ${selected_text:0:150}$([ ${#selected_text} -gt 150 ] && echo '...')"
