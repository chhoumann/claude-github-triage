# Bulk Triage Implementation

This document describes the implementation of the bulk triage workflow with custom parameters feature.

## Overview

The bulk triage feature allows users to select multiple issues in the interactive TUI and re-triage them with custom parameters. This implementation follows the three-phase approach recommended by the oracle.

## Features Implemented

### Phase 1: Visual Selection Mode ✅

**Files Modified:**
- `src/tui/InboxApp.tsx` - Added selection state and keyboard handlers
- `src/tui/TableView.tsx` - Added checkbox column and visual indicators
- `src/tui/StatusBar.tsx` - Added selection mode status display

**Keyboard Shortcuts:**
- `V` - Enter/exit visual selection mode
- `Space` - Toggle selection for current issue (in selection mode)
- `A` - Select all issues in current filtered view (in selection mode)
- `I` - Invert selection (in selection mode)
- `ESC` - Clear selection (first press) or exit selection mode (second press)

**UI Changes:**
- Checkbox column `[✓]` / `[ ]` shown when in selection mode
- Selection counter in status bar
- Context-sensitive help text in status bar

### Phase 2: Bulk Triage with Custom Parameters ✅

**Files Created:**
- `src/tui/BulkTriageModal.tsx` - Interactive parameter configuration modal

**Files Modified:**
- `src/issue-triager.ts` - Added types and bulk triage method
  - `TriageRunOptions` type for custom run parameters
  - `TriageProgress` type for progress events
  - Extended `triageIssue()` with optional `runOptions` parameter
  - New `triageIssuesList()` method for bulk operations with progress callbacks
- `src/tui/InboxApp.tsx` - Integrated bulk triage workflow

**Custom Parameters Supported:**
- **Adapter**: `claude` | `codex` - Choose AI adapter
- **Concurrency**: 1-10 (default: 3) - Number of concurrent triage operations
- **Force re-triage**: Boolean - Skip detection override
- **Timeout (minutes)**: Default 60 - Per-issue timeout
- **Max turns**: Default 100000 - Maximum agent turns
- **Debug logs**: Boolean - Enable/disable debug logging

**Keyboard Shortcuts:**
- `T` - Open bulk triage parameter modal (when issues selected)
- `Shift+T` - Quick re-triage with last-used parameters
- In modal: `↑/↓` navigate, `Enter/Space` toggle/edit, `S` submit, `ESC` cancel

### Phase 3: Progress Display & Live Updates ✅

**Files Created:**
- `src/tui/BulkTriageProgress.tsx` - Real-time progress bar component

**Files Modified:**
- `src/tui/InboxApp.tsx` - Progress tracking state and handlers
- `src/tui/TableView.tsx` - Per-row status indicators

**Progress Features:**
- Real-time progress bar with completion percentage
- Live counters: ✓ Completed, ⏭ Skipped, ✗ Failed, ▶ In-flight
- Elapsed time and ETA calculation
- Per-row status indicators:
  - `⏳ Triaging` - Currently processing
  - `✅ Done` - Successfully completed
  - `❌ Failed` - Error occurred
  - `⏭ Skipped` - Already triaged (when not using force)

**Progress Events:**
- `started` - Issue triage begins
- `skipped` - Issue skipped (already triaged)
- `success` - Issue triage completed successfully
- `error` - Issue triage failed

## Architecture

### IssueTriage Class Extensions

```typescript
// New types
export type TriageRunOptions = {
  maxTurns?: number;
  timeoutMs?: number;
  debug?: boolean;
};

export type TriageProgress =
  | { type: "started"; issueNumber: number }
  | { type: "skipped"; issueNumber: number }
  | { type: "success"; issueNumber: number; elapsedMs: number }
  | { type: "error"; issueNumber: number; elapsedMs: number; error: string };

// Enhanced method signature
async triageIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  projectPath: string,
  force = false,
  runOptions?: TriageRunOptions,
): Promise<void>

// New bulk method
async triageIssuesList(
  owner: string,
  repo: string,
  projectPath: string,
  issueNumbers: number[],
  options?: {
    concurrency?: number;
    force?: boolean;
    run?: TriageRunOptions;
    onProgress?: (e: TriageProgress) => void;
  },
): Promise<void>
```

### TUI State Management

```typescript
// Selection state
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());

// Bulk triage state
const [showBulkTriageModal, setShowBulkTriageModal] = useState(false);
const [lastBulkParams, setLastBulkParams] = useState<BulkTriageParams | undefined>();
const [bulkTriageRunning, setBulkTriageRunning] = useState(false);
const [bulkTriageStatus, setBulkTriageStatus] = useState<BulkTriageStatus | null>(null);
const [perRowStatus, setPerRowStatus] = useState<Map<number, "idle" | "queued" | "running" | "done" | "skipped" | "error">>(new Map());
```

## Usage Flow

1. **Enter Selection Mode**: Press `V`
2. **Select Issues**: 
   - Use `Space` to toggle individual issues
   - Use `A` to select all visible issues
   - Use `I` to invert selection
3. **Configure & Run**:
   - Press `T` to open parameter modal
   - Adjust parameters using `↑/↓` and `Enter/Space`
   - Press `S` to submit and start bulk triage
4. **Monitor Progress**: 
   - View real-time progress bar
   - See per-row status indicators
   - Track completion, failures, and ETA
5. **Completion**:
   - Issues automatically reload with updated metadata
   - Selection mode exits
   - Selection clears

## Implementation Notes

### Backward Compatibility
- Existing CLI flows remain unchanged
- `triageIssue()` method is backward-compatible (optional parameters)
- No breaking changes to existing APIs

### Concurrency & Performance
- Uses Listr2 for concurrent task execution
- Default concurrency: 3 (configurable via modal)
- Progress events fire on each state change
- React state updates trigger UI re-renders

### Error Handling
- Individual issue failures don't stop the batch
- Errors tracked per-row with status indicators
- Failed count shown in progress bar
- Error messages preserved in progress events

### Future Enhancements (Optional)

As recommended by the oracle, consider these advanced features if needed:

- **Persistent Job Queue**: Resume bulk operations across TUI sessions
- **Auto-apply Recommendations**: Automatically close/label issues after triage
- **Confidence-based Re-triage**: Only re-triage issues below a confidence threshold
- **Filesystem Watcher**: Auto-update UI when triage files change externally
- **Advanced Filters**: Re-triage only specific subsets (e.g., old model, low confidence)

## Testing

To test the implementation:

```bash
# Start the interactive TUI
bun run src/cli.ts inbox

# In the TUI:
# 1. Press V to enter selection mode
# 2. Press Space to select issues
# 3. Press T to open bulk triage modal
# 4. Configure parameters and press S
# 5. Watch progress bar and row indicators
```

## Files Changed

### Created
- `src/tui/BulkTriageModal.tsx` - Parameter configuration modal
- `src/tui/BulkTriageProgress.tsx` - Progress bar component
- `BULK-TRIAGE-IMPLEMENTATION.md` - This document

### Modified
- `src/issue-triager.ts` - Bulk triage method and types
- `src/tui/InboxApp.tsx` - Selection mode and bulk triage integration
- `src/tui/TableView.tsx` - Checkbox column and row status indicators
- `src/tui/StatusBar.tsx` - Selection mode status display

## Summary

This implementation delivers a complete, maintainable bulk triage workflow with:
- ✅ Visual selection mode with intuitive keyboard controls
- ✅ Customizable triage parameters via interactive modal
- ✅ Real-time progress tracking with live UI updates
- ✅ Per-row status indicators for immediate feedback
- ✅ Backward-compatible API extensions
- ✅ Clean separation of concerns (UI, logic, state)

All features work together to provide a powerful, user-friendly bulk operations experience in the GitHub triage TUI.
