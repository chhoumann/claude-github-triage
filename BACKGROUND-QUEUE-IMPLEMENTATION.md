# Background Queue Implementation

This document describes the fixes for the two critical issues in the bulk triage system.

## Issues Fixed

### Issue 1: Non-blocking Background Triage Queue ✅

**Problem:**
- Bulk triage blocked all TUI interaction until completion
- Users couldn't navigate, filter, or mark issues while triage was running
- Complex modal with too many parameters

**Solution:**
- Created lightweight background queue system (`TriageQueue.ts`)
- Queue runs independently with concurrency control (default: 3)
- Simple adapter picker (Claude/Codex only)
- Always force re-triage from TUI
- Non-blocking: users can continue working while triage runs in background

**Key Features:**
- **FIFO Queue**: Issues processed in order
- **Concurrent Processing**: Configurable concurrency (default: 3)
- **Event-Driven**: Real-time UI updates via events
- **Non-Blocking**: Queue runs in background, TUI remains interactive
- **Dynamic**: Add more issues to queue while it's running

### Issue 2: Jump Mode Error Handling ✅

**Problem:**
- Jumping to non-existent issue number caused blocking error state
- User couldn't recover without restarting

**Solution:**
- Introduced toast notification system
- Jump errors show as temporary warning toasts (auto-dismiss after 4 seconds)
- Reserved fatal errors only for critical failures
- All user input errors now use toast notifications

## Architecture

### TriageQueue Class (`src/tui/TriageQueue.ts`)

```typescript
class TriageQueue extends EventEmitter {
  // Queue management
  enqueue(issueNumbers: number[]): void
  setAdapter(name: "claude" | "codex"): void
  
  // Queue status
  getQueueSize(): number
  getActiveSize(): number
  getActiveIssues(): number[]
  
  // Control
  stop(): void
}

// Events emitted
type TriageQueueEvent =
  | { type: "queued"; issueNumber: number }
  | { type: "started"; issueNumber: number }
  | { type: "success"; issueNumber: number; elapsedMs: number }
  | { type: "error"; issueNumber: number; elapsedMs: number; error: string }
  | { type: "drain" } // Queue is empty
```

**How it works:**
1. Issues added to FIFO queue via `enqueue()`
2. Queue automatically starts processing (pump mechanism)
3. Maintains N concurrent tasks (default: 3)
4. Emits events for each state change
5. Continues until queue drains
6. Can add more issues while running

### Toast Notification System

**Components Created:**
- `Toast.tsx` - Toast display component
- Toast types: `info`, `warn`, `error`, `success`
- Auto-dismiss with configurable expiration

**Usage:**
```typescript
setToast({
  message: "Issue #123 not found",
  level: "warn",
  expiresAt: Date.now() + 4000, // 4 seconds
});
```

### Adapter Picker (`AdapterPicker.tsx`)

**Simplified UX:**
- One-line prompt: "1) Claude  2) Codex"
- Press number to select
- Enter for last-used adapter
- ESC to cancel

**Replaced:**
- Complex `BulkTriageModal` with many parameters
- Now just: adapter selection (always force=true)

## User Flow

### Background Triage Workflow

1. **Enter Selection Mode**: Press `V`
2. **Select Issues**: 
   - `Space` to toggle
   - `A` to select all
   - `I` to invert
3. **Start Triage**:
   - Press `T` to use last adapter (quick)
   - Press `t` to choose adapter
4. **Continue Working**:
   - ✅ Navigate other issues
   - ✅ Apply filters
   - ✅ Mark issues read/done
   - ✅ Add more issues to queue
   - ✅ View progress in real-time
5. **Monitor Progress**:
   - Progress bar shows live status
   - Per-row indicators: ⏳ running, ✅ done, ❌ error
   - Success toast when complete

### Jump Mode (Fixed)

1. Press `:` to enter jump mode
2. Type issue number
3. **If found**: Jump to issue
4. **If not found**: Show warning toast, exit jump mode gracefully
5. User can immediately continue working

## Changes Made

### Files Created
- `src/tui/TriageQueue.ts` - Background queue manager
- `src/tui/AdapterPicker.tsx` - Simple adapter selection
- `src/tui/Toast.tsx` - Toast notification component
- `BACKGROUND-QUEUE-IMPLEMENTATION.md` - This document

### Files Modified
- `src/tui/InboxApp.tsx` - Major refactor:
  - Replaced blocking `runBulkTriage()` with `enqueueForTriage()`
  - Added `queueRef` (useRef) for queue instance
  - Wire queue events to UI state updates
  - Added toast state and auto-dismiss
  - Changed `error` to `fatalError` + `toast`
  - Updated all error handlers to use toast
  - Simplified adapter picker flow
  - Jump mode fixed with toast

### Files Deprecated (but not deleted)
- `src/tui/BulkTriageModal.tsx` - No longer used
  - Kept for reference, can be deleted later

## Key Improvements

### 1. Non-Blocking Architecture
- Queue runs independently in background
- Uses `useRef` to avoid React re-creation
- Event-driven updates via `EventEmitter`
- No `await` in keyboard handlers

### 2. Better Error Handling
- **Fatal errors**: Block UI (rare, e.g., failed to load issues)
- **User errors**: Show toast (common, e.g., jump not found)
- **Triage errors**: Show toast, continue processing queue

### 3. Simplified UX
- Removed 6-field parameter modal
- Just pick adapter (Claude/Codex)
- Always force=true from TUI
- Quick re-triage with `Shift+T`

### 4. Real-Time Feedback
- Live progress bar
- Per-row status indicators
- Toast notifications
- Queue continues loading while showing progress

## Event Flow

```
User presses 't' in selection mode
  ↓
AdapterPicker shows
  ↓
User selects adapter (1 or 2)
  ↓
enqueueForTriage() called
  ↓
Queue emits "queued" events
  ↓
UI shows queued status (per-row)
  ↓
Queue starts processing concurrently
  ↓
Queue emits "started" event
  ↓
UI shows running status (⏳)
  ↓
[User can navigate/filter/add more issues]
  ↓
Queue emits "success" or "error"
  ↓
UI updates row status (✅ or ❌)
  ↓
Issues reload automatically
  ↓
Queue continues until empty
  ↓
Queue emits "drain"
  ↓
Success toast shown
  ↓
Progress bar clears
```

## Performance Benefits

1. **Responsive UI**: No blocking during triage
2. **Efficient**: Concurrent processing (default: 3)
3. **Flexible**: Add issues while queue runs
4. **Resilient**: Individual failures don't stop queue
5. **User-Friendly**: Immediate feedback, clear status

## Testing

```bash
# Start TUI
bun run src/cli.ts inbox

# Test background queue:
# 1. Press V to enter selection mode
# 2. Select multiple issues with Space
# 3. Press t to pick adapter
# 4. Press 1 for Claude
# 5. Queue starts immediately
# 6. Try navigating with arrows (still works!)
# 7. Try filtering with 2 (still works!)
# 8. Watch progress bar and row indicators

# Test jump mode error handling:
# 1. Press : to jump
# 2. Type 99999 (non-existent)
# 3. See warning toast (auto-dismisses)
# 4. Continue working normally
```

## Configuration

Queue concurrency can be adjusted in `InboxApp.tsx`:

```typescript
const queue = new TriageQueue({
  // ... other config
  concurrency: 3, // Change this to adjust concurrent triages
});
```

## Future Enhancements (Optional)

As recommended by oracle:
- **Persistent Queue**: Save queue to file, resume across sessions
- **Child Processes**: Isolate crashes with worker processes
- **Advanced Scheduling**: Priority lanes, retry policies
- **Multi-Project**: Queue across multiple repositories

## Summary

Both critical issues have been resolved:

✅ **Issue 1: Non-blocking queue system**
- Background processing with event-driven updates
- Simple adapter picker (Claude/Codex)
- Always force re-triage from TUI
- Can continue working while triage runs

✅ **Issue 2: Jump mode error handling**
- Toast notification system for warnings
- Non-blocking error display
- Auto-dismiss after timeout
- User can immediately recover

The system now provides a smooth, non-blocking bulk triage experience with excellent user feedback and error handling.
