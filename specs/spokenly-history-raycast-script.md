# Feature: Spokenly History Access via Raycast

## Metadata
- Created: 2025-11-16 16:35
- Status: draft
- Phases: 2
- Estimated Timeline: 1-2 days
- Tickets: None

## Context & Questions

**Research Findings:**
- Spokenly stores all transcription history locally in JSON + WAV format
- Storage location: `~/Library/Containers/app.spokenly/Data/Library/Application Support/Spokenly/History/`
- Structure: Date folders (YYYY-MM-DD) containing UUID.json + UUID.wav pairs
- Current entries: 30 transcriptions available
- JSON path to text: `.content.dictation._0.success._0.result.transcriptionData.segments[].text`
- Timestamp path: `.creationDate` (Unix timestamp)

**Third-Party Dependencies:**
- **Existing Dependencies:**
  - jq: Already installed at `/opt/homebrew/bin/jq` (for JSON parsing)
  - Standard macOS tools: find, sort, pbcopy, date

**Relevant Patterns Found:**
- File: scritps/jira.sh
- Pattern: Raycast script command structure with metadata headers, argument handling, clipboard interaction

**Architectural Decisions:**
- Decision: Start with simple script command, not full extension
- Rationale: Faster to implement, easier to maintain, sufficient for basic use case
- Alternatives Considered: Full TypeScript Raycast extension (rejected due to complexity)
- Trade-offs: Lose rich UI features but gain simplicity and quick access

## Applicable Skills
- None specific for bash scripts; will rely on standard validation (shellcheck, manual testing)

## Problem Statement

User wants to access Spokenly speech-to-text transcription history from Raycast. Currently, transcriptions are only accessible within the Spokenly app. User needs ability to:
1. View recent transcriptions
2. Search transcriptions by keyword
3. Copy selected transcription text to clipboard
4. Quick keyboard access via Raycast

## Implementation Plan

### Phase 1: Basic Implementation
- [x] Create `scritps/spokenly-history.sh` script file
- [x] Add Raycast metadata headers (title, mode, icon, description)
- [x] Implement core functionality:
  - [x] Define Spokenly history directory path
  - [x] Find all JSON files sorted by modification time (recent first)
  - [x] Extract transcription text using jq
  - [x] Format output with timestamp and preview
  - [x] Display interactive menu with numbered options
  - [x] Copy selected transcription to clipboard
- [x] Handle edge cases:
  - [x] No history files found
  - [x] Invalid JSON structure
  - [x] Missing jq installation (fallback message)
- [x] **REVIEW GATE:** Manual testing + shellcheck validation
- [x] Commit after approval
- [x] Update specs/index.md with timestamp

### Phase 2: Enhancements (Optional)
- [x] Add search functionality via optional argument
- [x] Add date filtering (today, yesterday, last 7 days)
- [x] Show audio duration in output
- [x] Add option to export to file
- [x] **REVIEW GATE:** Manual testing + user approval
- [x] Commit after approval
- [x] Update specs/index.md with timestamp

## Script Structure

```bash
#!/bin/bash

# Raycast metadata headers
# @raycast.schemaVersion 1
# @raycast.title Spokenly History
# @raycast.mode fullOutput
# @raycast.packageName Spokenly
# @raycast.icon 🎙️
# @raycast.argument1 { "type": "text", "placeholder": "Search (optional)", "optional": true }

# Constants
HISTORY_DIR="$HOME/Library/Containers/app.spokenly/Data/Library/Application Support/Spokenly/History"

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required. Install: brew install jq"
    exit 1
fi

# Check if history directory exists
if [ ! -d "$HISTORY_DIR" ]; then
    echo "❌ Spokenly history directory not found"
    exit 1
fi

# Find and process history files
# 1. Find all JSON files
# 2. Sort by modification time (recent first)
# 3. Extract text and timestamp
# 4. Display interactive menu
# 5. Copy selection to clipboard

# Implementation details...
```

## Validation Pipeline

### After Phase 1:
- [ ] Run shellcheck for bash script validation
  ```bash
  shellcheck scritps/spokenly-history.sh
  ```
- [ ] Manual testing:
  - [ ] Test with no arguments (list all)
  - [ ] Test selecting different entries
  - [ ] Verify clipboard copy works
  - [ ] Test with empty history
  - [ ] Test with malformed JSON
- [ ] Verify output formatting is clean and readable
- [ ] Test Raycast integration (import script, run from Raycast)

### After Phase 2:
- [ ] Test search functionality with various keywords
- [ ] Test date filtering options
- [ ] Verify backward compatibility (Phase 1 functionality still works)
- [ ] Manual testing in Raycast

## Success Criteria

**Phase 1:**
- ✅ Script successfully lists recent Spokenly transcriptions
- ✅ User can select and copy transcription to clipboard
- ✅ Script handles errors gracefully
- ✅ Script integrates with Raycast without issues
- ✅ shellcheck passes with no warnings

**Phase 2:**
- ✅ Search functionality works accurately
- ✅ Date filtering produces expected results
- ✅ All Phase 1 features remain functional

## Progress Log
- [2025-11-16 16:35] Plan created
- [2025-11-16 17:05] Phase 1 completed - Basic implementation with search functionality, all tests passing
- [2025-11-16 17:10] Phase 2 completed - Added date filtering, audio duration display, and export to file functionality

## How to Implement

1. **Start with Phase 1**: Implement basic script functionality
2. **Run Validation Pipeline**: Execute shellcheck and manual tests
3. **Present for Review**:
   - Show script code
   - Demonstrate functionality with screenshots/output examples
   - Report shellcheck results
   - Wait for human approval
4. **Commit via Skill**: Use git-commit-formatter skill after approval
5. **Update Progress**:
   - Mark Phase 1 complete in checklist
   - Add timestamp to Progress Log (ISO 8601: YYYY-MM-DD HH:MM)
   - Update specs/index.md with current status
6. **Ask Before Phase 2**: "Phase 1 complete. Proceed with enhancements (Phase 2)?"
7. **Update CLAUDE.md**: If needed, document the new script in project CLAUDE.md

## Notes

- Keep script simple and maintainable
- Focus on common use cases (recent history access)
- Ensure robust error handling
- Follow existing script patterns in scritps/ directory
- Consider user experience in terminal output formatting
