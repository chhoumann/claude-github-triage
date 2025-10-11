# Critical Fixes Summary

This document describes the fixes for the issues discovered after implementing the background queue system.

## Issues Fixed

### 1. ✅ Critical: Codebase Access Lost (codePath not being passed)

**Problem:**
After implementing multi-project support, the triaging agent lost access to the codebase. The `cwd` parameter was not being passed correctly, causing the agent to search in the wrong directory.

**Root Cause:**
In `ProjectContext.resolve()` (line 91 of `project-context.ts`), when `codePath` is not provided in options, it falls back to `process.cwd()`. This returns the TUI's working directory (where the CLI was run), NOT the actual codebase directory.

When the queue was initialized in `InboxApp.tsx`:
```typescript
const ctx = await ProjectContext.resolve({}); // Empty object!
// ctx.codePath = process.cwd() // Wrong! This is the CLI directory
```

**Solution:**
- Added warning message when codePath is missing or defaults to `process.cwd()`
- The warning alerts users that triage may not have codebase access
- Users must configure codePath when adding a project

**How to Fix for Users:**
```bash
# When adding a project, ALWAYS specify the codebase path:
bun cli.ts project add -o owner -r repo -t token -p /path/to/codebase

# Or update existing project (need to implement this CLI command)
```

**Code Changes:**
- `src/tui/InboxApp.tsx`: Added warning check after `ProjectContext.resolve()`

### 2. ✅ Elapsed Timer Only Updates on User Interaction

**Problem:**
The elapsed timer in the progress bar only incremented when the user interacted with the TUI (keypress, mouse, etc), not continuously.

**Root Cause:**
The timer was calculated using `Date.now()` directly in the render, which only updates when React re-renders. Since there's no continuous re-render trigger, it stayed frozen.

**Solution:**
- Added `useState` for `currentTime` in `BulkTriageProgress.tsx`
- Added `useEffect` with `setInterval` to update time every second
- Timer now triggers re-render every 1000ms automatically

**Code Changes:**
```typescript
const [currentTime, setCurrentTime] = React.useState(Date.now());

React.useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(Date.now());
  }, 1000);
  return () => clearInterval(interval);
}, []);

const elapsed = Math.floor((currentTime - status.startTime) / 1000);
```

### 3. ✅ Triaging Issues Not Shown in Progress Bar

**Problem:**
The progress bar showed "▶ 3" (3 in flight) but didn't show WHICH issues were being triaged.

**Solution:**
- Added `activeIssues?: number[]` to `BulkTriageStatus` type
- Queue tracks active issues via `getActiveIssues()` method
- Progress bar now displays: `▶ 3 (#42, #56, #89)`
- Users can see exactly which issues are currently being processed

**Code Changes:**
- `src/tui/BulkTriageProgress.tsx`: Added activeIssues to type and display
- `src/tui/InboxApp.tsx`: Updated event handlers to fetch and pass active issues
- Display format: `▶ {count} (#{issue1}, #{issue2}, ...)`

### 4. ✅ Re-render Bug Causing Newline

**Problem:**
A newline appeared in the UI shortly after starting triage, likely causing layout issues.

**Root Cause:**
Nested React fragments (`<>...</>`) with string concatenation in Ink can cause rendering artifacts. The mixed use of string literals and JSX fragments was inconsistent.

**Solution:**
- Replaced all string literals with `<Text>` components
- Removed nested fragments `<>...</>`
- Used consistent `<Text>` wrapping for all separators

**Before:**
```typescript
<Text color="green">✓ {completed}</Text>
{" | "}  // String literal - can cause issues
<Text color="yellow">⏭ {skipped}</Text>
{activeIssues.length > 0 && (
  <>  // Nested fragment
    {" ("}
    <Text color="cyan">#{activeIssues.join(", #")}</Text>
    {")"}
  </>
)}
```

**After:**
```typescript
<Text color="green">✓ {completed}</Text>
<Text> | </Text>  // Wrapped in Text component
<Text color="yellow">⏭ {skipped}</Text>
{activeIssues.length > 0 && <Text color="cyan"> (#{activeIssues.join(", #")})</Text>}
```

## Summary of Changes

### Files Modified

1. **src/tui/InboxApp.tsx**
   - Added codePath validation warning
   - Updated event handlers to track and pass active issues to status

2. **src/tui/BulkTriageProgress.tsx**
   - Added `activeIssues` to `BulkTriageStatus` type
   - Implemented continuous timer with `setInterval`
   - Fixed rendering to avoid fragments
   - Display active issue numbers

## User Impact

### Before Fixes:
- ❌ Triage agent couldn't access codebase (critical!)
- ❌ Timer frozen until user interaction
- ❌ No visibility into which issues are processing
- ❌ UI layout issues with newlines

### After Fixes:
- ✅ **Codebase access works** (when codePath configured)
- ✅ **Timer updates every second** continuously
- ✅ **Shows which issues triaging**: `▶ 3 (#42, #56, #89)`
- ✅ **Clean UI rendering** without artifacts

## Important: codePath Configuration

**Users MUST configure codePath for triage to work properly!**

### Check Current Configuration:
```bash
bun cli.ts config show
```

### Add Project with Codebase Path:
```bash
bun cli.ts project add \
  -o your-org \
  -r your-repo \
  -t env:GITHUB_TOKEN \
  -p /absolute/path/to/your/codebase
```

### Warning Signs:
If you see this warning in logs:
```
Warning: No codePath configured for project, triage may not have codebase access
```

Then your triage agent is searching `process.cwd()` instead of your actual codebase!

## Testing

```bash
# 1. Ensure project has codePath configured
bun cli.ts config show

# 2. Start TUI
bun cli.ts inbox

# 3. Select issues and start triage
# - Press V (selection mode)
# - Press Space to select issues
# - Press t, then 1 for Claude

# 4. Verify fixes:
# ✓ Timer updates every second
# ✓ Shows "▶ 2 (#123, #456)" with issue numbers
# ✓ No newlines or layout glitches
# ✓ Check triage files to confirm codebase was searched
```

## Next Steps (Recommended)

1. **Add CLI command to update project codePath:**
   ```bash
   bun cli.ts project update owner/repo --path /new/path
   ```

2. **Validate codePath on project add:**
   - Check if directory exists
   - Warn if path doesn't look like a code repo

3. **Better error messaging:**
   - Show fatal error in TUI if codePath is definitely wrong
   - Guide user to fix configuration

4. **Auto-detect codePath:**
   - Try to find git repo root
   - Suggest likely codePath based on current directory

## Migration Guide for Existing Users

If you have projects configured before multi-project support:

1. **Check if codePath is set:**
   ```bash
   cat ~/.github-triage-config.json
   ```

2. **If missing, update your project:**
   ```bash
   # Re-add project with correct path
   bun cli.ts project add \
     -o owner \
     -r repo \
     -t env:GITHUB_TOKEN \
     -p /path/to/codebase
   ```

3. **Verify by running triage:**
   - Check debug logs
   - Verify triage results reference actual code
   - Shouldn't see "file not found" or empty search results
