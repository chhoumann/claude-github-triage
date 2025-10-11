# GitHub Triage Roadmap

This document tracks planned features and improvements for the GitHub triage system.

## High Priority

### Multi-Project Support
**Problem**: Currently all data is stored in a single `results/` directory without clear project separation.

**Solution**:
- Store project-specific data in separate directories (e.g., `data/<owner>/<repo>/`)
- Add project context/switching so you don't need to provide `-o`, `-r`, `-t` flags every time
- Configuration file to store active project and credentials
- Quick project switcher in TUI (e.g., `P` key to switch projects)
- Show current project in status bar

**Benefits**:
- Work on multiple repositories simultaneously
- Clearer organization of triage data
- Faster CLI usage with saved context

### Bulk Operations
**Status**: Planned

**Features**:
- Visual selection mode (press `v` to enter, `Space` to toggle selection)
- Multi-select multiple issues with visual indicators
- Bulk actions: mark as read/done, **trigger triage workflow** (with custom parameters)
- Show progress when running bulk triage operations
- Auto-update rows in real-time as triage completes

**Use Cases**:
- Select 10 old issues and mark them all as done
- Select issues needing re-triage and batch process them
- Selecting issues triaged by older model for re-triage
- Efficiently manage large backlogs

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

### GitHub Sync Improvements
**Status**: Planned

**Features**:
- Background auto-sync every N minutes (configurable)
- Sync indicators in TUI (syncing animation)
- Manual sync trigger (`S` key)

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

- ✅ Interactive TUI with vim navigation
- ✅ Basic filtering (status, close recommendation)
- ✅ Text search
- ✅ Editor integration
- ✅ Issue metadata tracking (read/done status)
- ✅ GitHub sync for closed issues
- ✅ Multiple AI adapter support (Claude, Codex)

## Ideas / Future Exploration

- AI-powered similar issue detection
- Sentiment analysis of issue comments
- Priority scoring based on multiple factors
- Integration with project management tools (Linear, Jira)
