# Multi-Project Support

The GitHub Triage system now supports working with multiple repositories simultaneously!

## Overview

Multi-project support allows you to:
- Manage triage data for multiple repositories in separate directories
- Switch between projects without needing to specify `-o`, `-r`, `-t` flags every time
- Store project configurations including credentials and paths
- Automatically migrate existing data from the legacy `results/` directory

## Directory Structure

Project data is now stored in organized directories:

```
~/.github-triage/
└── data/
    ├── owner1/
    │   └── repo1/
    │       ├── .triage-metadata.json
    │       ├── triage/
    │       │   ├── issue-123-triage.md
    │       │   └── issue-124-triage.md
    │       └── debug/
    │           ├── issue-123-triage-debug.json
    │           └── issue-124-triage-debug.json
    └── owner2/
        └── repo2/
            ├── .triage-metadata.json
            ├── triage/
            └── debug/
```

## Quick Start

### 1. Add a Project

```bash
# Add your first project
bun cli.ts project add -o owner -r repo -t env:GITHUB_TOKEN

# Or with explicit token
bun cli.ts project add -o owner -r repo -t ghp_your_token_here

# With codebase path
bun cli.ts project add -o owner -r repo -t env:GITHUB_TOKEN -p /path/to/codebase
```

The first project you add is automatically set as the active project.

### 2. Switch Projects

```bash
bun cli.ts project switch -o owner -r repo
```

### 3. List Projects

```bash
bun cli.ts project list
```

Output:
```
📋 Projects:

✓ chhoumann/quickadd
    Token: env:GITHUB_TOKEN
    
  microsoft/vscode
    Token: env:GITHUB_TOKEN
    Path: /Users/me/code/vscode
```

## Usage

Once you've added and activated a project, all commands work without flags:

```bash
# No need for -o, -r, -t anymore!
bun cli.ts test
bun cli.ts triage
bun cli.ts inbox
bun cli.ts review
bun cli.ts sync
bun cli.ts open 123
```

You can still override with flags if needed:
```bash
# Temporarily use different repo
bun cli.ts test -o different-owner -r different-repo
```

## Token Management

Projects support two token formats:

### Environment Variable Reference (Recommended)
```bash
bun cli.ts project add -o owner -r repo -t env:GITHUB_TOKEN
```
This references `process.env.GITHUB_TOKEN` at runtime, keeping tokens out of config files.

### Direct Token (Less Secure)
```bash
bun cli.ts project add -o owner -r repo -t ghp_your_token_here
```
⚠️ Token is stored in `~/.github-triage-config.json` - ensure file permissions are restricted.

## Migration from Legacy Structure

When you run any command for the first time with an active project, if the legacy `results/` directory exists, the tool will:

1. Create the new project-specific directories
2. Move all triage files to `data/owner/repo/triage/`
3. Move all debug files to `data/owner/repo/debug/`
4. Move metadata to `data/owner/repo/.triage-metadata.json`
5. Leave `results/` empty

**Migration is automatic and only happens once.**

Example output:
```
📦 Migrating legacy results/ directory to ~/.github-triage/data/owner/repo...
  ✓ Moved metadata file
  ✓ Moved 234 triage files
  ✓ Moved 234 debug files
✨ Migration complete!
```

## Configuration File

Project settings are stored in `~/.github-triage-config.json`:

```json
{
  "defaultEditor": "zed",
  "projects": {
    "owner/repo": {
      "owner": "owner",
      "repo": "repo",
      "token": "env:GITHUB_TOKEN",
      "codePath": "/path/to/codebase",
      "dataDir": "/Users/you/.github-triage/data/owner/repo"
    }
  },
  "activeProject": "owner/repo"
}
```

## Benefits

✅ **Work on multiple repositories simultaneously** - Each project has isolated data

✅ **Clearer organization** - Know exactly which repository's issues you're viewing

✅ **Faster CLI usage** - No more typing `-o owner -r repo -t token` every time

✅ **Flexible credentials** - Different tokens per project, or use env vars

✅ **Backwards compatible** - Automatically migrates existing data

## Coming Soon

🚧 **TUI Integration** - View current project in status bar and switch projects with `P` key

🚧 **Project removal** - `bun cli.ts project remove -o owner -r repo`

🚧 **Default code paths** - Set per-project codebase locations

## Troubleshooting

### "No project selected" error

Add a project first:
```bash
bun cli.ts project add -o owner -r repo -t env:GITHUB_TOKEN
```

### Migration not working

Ensure you have an active project set:
```bash
bun cli.ts project list  # Check active project (marked with ✓)
bun cli.ts project switch -o owner -r repo  # Set active project
```

### Can't find triaged issues

Make sure you're using the correct active project:
```bash
bun cli.ts project list
bun cli.ts project switch -o correct-owner -r correct-repo
```
