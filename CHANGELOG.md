# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-01

### Added

#### Multi-Project Support 🎉
- **Project Management Commands**: Add, update, switch, list, and remove projects
  - `bun cli.ts project add -o owner -r repo -t token -p /path`
  - `bun cli.ts project update -o owner -r repo -p /new/path`
  - `bun cli.ts project remove -o owner -r repo`
  - `bun cli.ts project list` - Shows all projects with codePath warnings
  - `bun cli.ts project switch -o owner -r repo`
- **Automatic Project Context**: No more need for `-o`, `-r`, `-t` flags every time
- **TUI Project Switcher**: Press `P` to switch between projects
- **Project-Specific Data**: Separate directories per repository in `~/.github-triage/data/`
- **Configuration Persistence**: Projects stored in `~/.github-triage-config.json`
- **Status Bar Display**: Shows current project in TUI status bar

#### Background Triage Queue 🎉
- **Non-Blocking Queue System**: Triage runs in background, UI stays responsive
- **Visual Selection Mode**: 
  - Press `V` to enter selection mode
  - `Space` to toggle individual issues
  - `A` to select all filtered issues
  - `I` to invert selection
  - `ESC` to clear selection
- **Simple Bulk Triage**:
  - Press `t` to pick adapter (Claude/Codex)
  - Press `T` for quick re-triage with last adapter
  - Always forces re-triage from TUI
- **Real-Time Progress Display**:
  - Live progress bar with percentage
  - Shows active issue numbers: `▶ 3 (#42, #56, #89)`
  - Timer updates every second
  - Counters: ✓ Completed, ⏭ Skipped, ✗ Failed, ▶ In-flight
  - ETA calculation based on average completion time
- **Per-Row Status Indicators**:
  - `⏳ Triaging` - Currently processing
  - `✅ Done` - Successfully completed
  - `❌ Failed` - Error occurred
  - `⏭ Skipped` - Already triaged
- **Queue Features**:
  - Configurable concurrency (default: 3)
  - Add more issues while queue is running
  - Continue navigating/filtering during triage
  - Automatic issue reload on completion

#### Toast Notification System
- **Non-Blocking Notifications**: Warnings and errors shown as dismissible toasts
- **Auto-Dismiss**: Toasts automatically disappear after timeout
- **Types**: Info, warn, error, success with color coding
- **Better UX**: Jump mode errors no longer block entire UI

### Fixed

#### Critical: Codebase Access
- **Fixed**: Triage agent now correctly accesses codebase via `codePath`
- **Added**: Warning when codePath is not configured
- **Validation**: Queue initialization checks for valid codePath
- **Migration**: `project update` command to fix existing configs

#### UI/UX Improvements
- **Fixed**: Elapsed timer now updates continuously (every second)
- **Fixed**: Re-render bug causing newlines in progress bar
- **Fixed**: Jump mode errors now show toast instead of blocking UI
- **Improved**: Progress bar shows which specific issues are triaging
- **Improved**: Better error messages throughout TUI

### Changed

- **Bulk Triage**: Simplified from complex modal to simple adapter picker
- **Triage Queue**: Changed from blocking to non-blocking background system
- **Error Handling**: Split into fatal errors (blocking) and warnings (toast)
- **Project Config**: Now includes codePath validation and warnings

### Documentation

- **Added**: [PROJECT-MANAGEMENT.md](PROJECT-MANAGEMENT.md) - Complete project management guide
- **Added**: [BACKGROUND-QUEUE-IMPLEMENTATION.md](BACKGROUND-QUEUE-IMPLEMENTATION.md) - Queue system architecture
- **Added**: [BULK-TRIAGE-IMPLEMENTATION.md](BULK-TRIAGE-IMPLEMENTATION.md) - Original bulk triage design (superseded)
- **Added**: [FIXES-SUMMARY.md](FIXES-SUMMARY.md) - Bug fixes and solutions
- **Updated**: [ROADMAP.md](ROADMAP.md) - Moved completed features, added recent updates

## Key Features Summary

### For Users
- 🎯 **Manage Multiple Repos**: Switch between projects effortlessly
- ⚡ **Background Triage**: Keep working while issues process
- 📊 **Live Progress**: See exactly what's happening in real-time
- 🔔 **Smart Notifications**: Non-intrusive warnings and errors
- 🛠️ **Easy Config Management**: Fix and update project settings

### For Developers
- 🏗️ **Clean Architecture**: Event-driven queue system
- 🔌 **Extensible**: Easy to add new adapters or features
- 📝 **Well Documented**: Multiple guides for different aspects
- 🧪 **Type Safe**: Full TypeScript support
- 🐛 **Better Error Handling**: Clear separation of concerns

## Migration Guide

### For Existing Users

If you were using the tool before these updates:

1. **Check your configuration:**
   ```bash
   bun cli.ts project list
   ```

2. **If codePath is missing (shows ⚠️ NOT SET):**
   ```bash
   bun cli.ts project update -o owner -r repo -p /path/to/codebase
   ```

3. **Verify the fix:**
   ```bash
   bun cli.ts project list
   ```

4. **Test in TUI:**
   ```bash
   bun cli.ts inbox
   # Try the new bulk triage: V, Space, t, 1
   ```

## Breaking Changes

None! All changes are backward compatible. Existing configurations will continue to work, though you may need to add `codePath` for optimal triage results.

## Upgrade Notes

- The old `BulkTriageModal` component is deprecated but kept for reference
- Legacy single-project configs automatically migrate to multi-project system
- All keyboard shortcuts remain the same, with new ones added

---

**Full Implementation Details**: See individual documentation files linked above.
