# GitHub Triage Roadmap

This document tracks planned features and improvements for the GitHub triage system.

## Recent Updates (2025)

🎉 **Major Features Shipped:**
- ✅ **Multi-Project Support** - Manage multiple repositories with separate configurations
- ✅ **Background Triage Queue** - Non-blocking bulk operations with real-time progress
- ✅ **Visual Selection Mode** - Select and batch-process multiple issues
- ✅ **Toast Notifications** - Better error handling with non-blocking messages

See [Completed Features](#completed-features) section below for full details.

## High Priority

### Issue Notes & Custom Tags
**Status**: Planned

**Features**:
- Add personal notes to any issue (e.g., "waiting for upstream fix")
- Custom tags beyond read/done (e.g., "urgent", "blocked", "needs-follow-up")
- Show tags/notes as indicators in TUI table
- Filter by custom tags
- Store in metadata file per project

**UI Ideas**:
- Press `n` to add/edit note for selected issue
- Press `t` to add/remove tags
- Show tags as colored badges in table
- Filter: `T` to filter by tag (with autocomplete)

## Medium Priority

### Smart Sorting
**Status**: Planned

**Sort Options**:
- By triage confidence level (low confidence issues first)
- By GitHub activity (most recently active)
- By engagement (number of comments)
- By age (oldest issues first)
- By recommendation + status (e.g., unread issues that should close)

**UI**:
- Press `s` to open sort menu
- Quick sort presets: `6`, `7`, `8` for common sorts
- Show current sort in status bar

### Custom Filter Presets
**Status**: Planned

**Features**:
- Save filter combinations with names
- Examples: "urgent" = unread + should-close, "review-later" = read + !done
- Quick access via number keys `6-9` or named shortcuts
- Store presets in config file
- Share presets across projects

## Lower Priority

### Export & Reporting
**Status**: Planned

**Features**:
- Generate summary reports (X triaged, Y closed, time saved estimates)
- Export filtered view to CSV/JSON
- Weekly digest of triage activity
- Analytics: most common labels, close rate, etc.

### Better Triage Context
**Status**: Planned

**Ideas**:
- Show related issues in preview
- Link to relevant PRs
- Show issue dependencies/blockers
- Timeline view of issue activity

### Workflow Integration
**Status**: Planned

**Features**:
- Trigger custom workflows from TUI
- GitHub Actions integration
- Webhook support for external systems
- Plugin system for extensibility

## Completed Features

### Core Features
- ✅ Interactive TUI with vim navigation
- ✅ Basic filtering (status, close recommendation)
- ✅ Text search
- ✅ Editor integration
- ✅ Issue metadata tracking (read/done status)
- ✅ GitHub sync for closed issues
- ✅ Multiple AI adapter support (Claude, Codex)

### Multi-Project Support ✨ NEW
**Implemented:** Full multi-project management system

**Features:**
- ✅ Project-specific data in separate directories (`~/.github-triage/data/<owner>/<repo>/`)
- ✅ Project context with saved credentials and settings
- ✅ Configuration file storing active project
- ✅ Quick project switcher in TUI (`P` key)
- ✅ Current project shown in status bar
- ✅ CLI commands: `add`, `update`, `switch`, `list`, `remove`
- ✅ No need to provide `-o`, `-r`, `-t` flags every time

**Documentation:** See [PROJECT-MANAGEMENT.md](PROJECT-MANAGEMENT.md)

### Bulk Operations & Background Queue ✨ NEW
**Implemented:** Non-blocking background triage system

**Features:**
- ✅ Visual selection mode (press `V` to enter, `Space` to toggle)
- ✅ Multi-select with indicators: `A` select all, `I` invert selection
- ✅ Background triage queue (non-blocking, continue working while triaging)
- ✅ Simple adapter picker (Claude/Codex) - press `T`/`t`
- ✅ Real-time progress bar with live updates
- ✅ Per-row status indicators (`⏳ Triaging`, `✅ Done`, `❌ Failed`)
- ✅ Show which issues are currently triaging (e.g., `▶ 3 (#42, #56, #89)`)
- ✅ Live timer updating every second
- ✅ Toast notifications for warnings/errors
- ✅ Can add more issues to queue while running
- ✅ Always force re-triage from TUI

**Use Cases:**
- ✅ Select 10 old issues and re-triage them all at once
- ✅ Continue navigating/filtering while triage runs in background
- ✅ Re-triage issues that were processed by older model
- ✅ Efficiently manage large backlogs without blocking

**Documentation:** See [BACKGROUND-QUEUE-IMPLEMENTATION.md](BACKGROUND-QUEUE-IMPLEMENTATION.md)

### GitHub Sync Improvements ✨ NEW
**Implemented:** Automatic background sync with visual indicators

**Features:**
- ✅ Background auto-sync every N minutes (configurable via `GITHUB_TRIAGE_SYNC_MINUTES` env var, defaults to 10 min)
- ✅ TUI sync indicators: animated spinner during sync, "last sync" timestamp when idle
- ✅ Manual sync trigger with `S` key
- ✅ Silent auto-sync (no interruptions) with toast notifications for manual syncs
- ✅ Mutex protection prevents overlapping syncs
- ✅ Reusable sync service shared between CLI and TUI

## Ideas / Future Exploration

- AI-powered similar issue detection
- Sentiment analysis of issue comments
- Priority scoring based on multiple factors
- Integration with project management tools (Linear, Jira)
