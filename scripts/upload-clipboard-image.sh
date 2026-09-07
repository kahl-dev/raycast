#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Upload Clipboard Image
# @raycast.mode silent
# @raycast.packageName Kahl-dev scripts

# Optional parameters:
# @raycast.icon 📸
# @raycast.argument1 { "type": "text", "placeholder": "user@host:/path (optional)", "optional": true }

# Documentation:
# @raycast.description Upload clipboard image to server screenshots directory
# @raycast.author kahl.dev
# @raycast.authorURL https://raycast.com/kahl.dev

# Default remote server configuration
DEFAULT_REMOTE="kahl@typo3.dev.louis.info:/home/kahl/tmp/ai/screenshots"

# Use provided remote or default
REMOTE="${1:-$DEFAULT_REMOTE}"

# Create temporary file with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEMP_FILE="/tmp/clipboard_image_${TIMESTAMP}.png"

# Check for pngpaste (most reliable method)
if ! command -v pngpaste &> /dev/null; then
    echo "❌ pngpaste not found. Installing it will make this more reliable:"
    echo "   brew install pngpaste"
    echo ""
    echo "Trying alternative method..."
    
    # Alternative: Use osascript to save clipboard image
    osascript <<EOF 2>&1
try
    set thePath to POSIX file "$TEMP_FILE"
    set theData to the clipboard as «class PNGf»
    set theFile to open for access thePath with write permission
    set eof of theFile to 0
    write theData to theFile
    close access theFile
    return "success"
on error errMsg
    try
        close access thePath
    end try
    return "error: " & errMsg
end try
EOF
    
    if [ ! -f "$TEMP_FILE" ]; then
        echo "❌ Failed to save clipboard image"
        echo "💡 Make sure you have an image in your clipboard (Cmd+C on an image)"
        exit 1
    fi
else
    # Use pngpaste
    if ! pngpaste "$TEMP_FILE" 2>/dev/null; then
        echo "❌ No image found in clipboard"
        echo "💡 Copy an image first (Cmd+C on a screenshot or image)"
        exit 1
    fi
fi

# Check if file was created and has content
if [ ! -f "$TEMP_FILE" ] || [ ! -s "$TEMP_FILE" ]; then
    echo "❌ Failed to create image file"
    exit 1
fi

# Extract filename for remote
FILENAME="clipboard_${TIMESTAMP}.png"

# Parse remote format (user@host:path)
if [[ "$REMOTE" =~ ^([^:]+):(.*)$ ]]; then
    SSH_HOST="${BASH_REMATCH[1]}"
    REMOTE_PATH="${BASH_REMATCH[2]}"
else
    echo "❌ Invalid remote format. Use: user@host:/path/to/directory"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Ensure remote path ends with /
if [[ "$REMOTE_PATH" != */ ]]; then
    REMOTE_PATH="${REMOTE_PATH}/"
fi

# Ensure remote directory exists
echo "📁 Ensuring remote directory exists..."
if ! ssh "${SSH_HOST}" 'mkdir -p "'"$REMOTE_PATH"'"' 2>&1; then
    echo "❌ Failed to create remote directory"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Upload file via scp
echo "📤 Uploading image..."
echo "📁 Local file: $TEMP_FILE ($(stat -f%z "$TEMP_FILE" 2>/dev/null || echo "unknown") bytes)"
echo "🌐 Destination: ${SSH_HOST}:${REMOTE_PATH}${FILENAME}"

if scp "$TEMP_FILE" "${SSH_HOST}:${REMOTE_PATH}${FILENAME}" 2>&1; then
    # Copy remote path to clipboard for easy pasting
    echo "${REMOTE_PATH}${FILENAME}" | pbcopy
    echo "✅ Uploaded to: ${REMOTE_PATH}${FILENAME}"
    echo "📋 Path copied to clipboard"
else
    echo "❌ Failed to upload image"
    echo "💡 Debug info:"
    echo "   - Check SSH access: ssh ${SSH_HOST} 'echo connected'"
    echo "   - Check remote dir exists: ssh ${SSH_HOST} 'ls -la ${REMOTE_PATH}'"
    rm -f "$TEMP_FILE"
    exit 1
fi

# Clean up temporary file
rm -f "$TEMP_FILE"