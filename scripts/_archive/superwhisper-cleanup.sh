#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Superwhisper Cleanup
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon 🧹

# Documentation:
# @raycast.description Remove corrupt Superwhisper recordings (missing meta.json)
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

RECORDINGS_DIR="$HOME/Documents/superwhisper/recordings"

# Validate recordings directory exists
if [ ! -d "$RECORDINGS_DIR" ]; then
    echo "❌ Superwhisper recordings directory not found: $RECORDINGS_DIR"
    exit 1
fi

# Find all corrupt recordings (directories without meta.json)
# Use array to store results
corrupt_recordings=()
while IFS= read -r -d '' dir; do
    if [ ! -f "$dir/meta.json" ]; then
        corrupt_recordings+=("$dir")
    fi
done < <(find "$RECORDINGS_DIR" -maxdepth 1 -type d -name '[0-9]*' -print0)

# Check if any corrupt recordings found
if [ ${#corrupt_recordings[@]} -eq 0 ]; then
    echo "✅ No corrupt recordings found!"
    exit 0
fi

# Display findings
echo "🔍 Found ${#corrupt_recordings[@]} corrupt recording(s):"
echo ""

total_size=0
for dir in "${corrupt_recordings[@]}"; do
    timestamp=$(basename "$dir")
    size=$(du -sh "$dir" 2>/dev/null | awk '{print $1}')
    size_bytes=$(du -sb "$dir" 2>/dev/null | awk '{print $1}')
    total_size=$((total_size + size_bytes))

    # Convert timestamp to human-readable date
    if [[ $timestamp =~ ^[0-9]{10}$ ]]; then
        date_str=$(date -r "$timestamp" +"%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "Unknown date")
    else
        date_str="Unknown date"
    fi

    echo "  • $timestamp ($date_str) - $size"
done

total_size_human=$(numfmt --to=iec-i --suffix=B "$total_size" 2>/dev/null || du -sh . | awk '{print $1}')
echo ""
echo "💾 Total size: $total_size_human"
echo ""
echo "🗑️  Removing ${#corrupt_recordings[@]} corrupt recording(s)..."
echo ""

removed=0
failed=0

for dir in "${corrupt_recordings[@]}"; do
    if rm -rf "$dir"; then
        removed=$((removed + 1))
        echo "  ✓ Removed: $(basename "$dir")"
    else
        failed=$((failed + 1))
        echo "  ✗ Failed to remove: $(basename "$dir")"
    fi
done

echo ""
if [ $failed -eq 0 ]; then
    echo "✅ Successfully removed $removed corrupt recording(s)"
else
    echo "⚠️  Removed $removed, failed to remove $failed"
    exit 1
fi

exit 0
