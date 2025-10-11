# Project Management Guide

This guide explains how to manage multiple GitHub repository configurations with the triage tool.

## Overview

The triage tool supports managing multiple projects (repositories) with separate configurations. Each project stores:
- **Owner/Repo**: GitHub repository identifier
- **Token**: GitHub API token (can be direct value or `env:VAR` reference)
- **Code Path**: Absolute path to the codebase (⚠️ REQUIRED for triage to work!)
- **Data Directory**: Where triage results are stored (optional, auto-generated if not set)

## Commands

### Add a Project

Add a new project configuration:

```bash
bun cli.ts project add \
  -o <owner> \
  -r <repo> \
  -t <token> \
  -p <path-to-codebase>
```

**Example:**
```bash
bun cli.ts project add \
  -o facebook \
  -r react \
  -t env:GITHUB_TOKEN \
  -p /Users/me/repos/react
```

**Options:**
- `-o, --owner <owner>`: Repository owner (required)
- `-r, --repo <repo>`: Repository name (required)
- `-t, --token <token>`: GitHub token or `env:VAR` (default: `env:GITHUB_TOKEN`)
- `-p, --path <path>`: **Absolute path to codebase** (highly recommended!)

**Important:** 
- If this is the first project, it will be automatically activated
- Always specify `-p` with the codebase path, otherwise triage won't have codebase access!

### Update a Project

Update an existing project's configuration:

```bash
bun cli.ts project update \
  -o <owner> \
  -r <repo> \
  [-t <new-token>] \
  [-p <new-path>]
```

**Example - Fix missing codePath:**
```bash
bun cli.ts project update \
  -o facebook \
  -r react \
  -p /Users/me/repos/react
```

**Example - Update token:**
```bash
bun cli.ts project update \
  -o facebook \
  -r react \
  -t env:MY_GITHUB_TOKEN
```

**Options:**
- `-o, --owner <owner>`: Repository owner (required to identify project)
- `-r, --repo <repo>`: Repository name (required to identify project)
- `-t, --token <token>`: New GitHub token (optional, keeps existing if not provided)
- `-p, --path <path>`: New codebase path (optional, keeps existing if not provided)

**Use Cases:**
- Fix missing `codePath` after upgrading
- Change GitHub token
- Update path after moving repository

### List Projects

Show all configured projects:

```bash
bun cli.ts project list
```

**Output Example:**
```
📋 Projects:

✓ facebook/react
    Path: /Users/me/repos/react
    Token: env:GITHUB_TOKEN
    Data: /Users/me/.github-triage/data/facebook/react

  vercel/next.js
    Path: ⚠️  NOT SET (triage won't have codebase access!)
    Token: env:GITHUB_TOKEN
```

**Indicators:**
- `✓` - Currently active project
- `⚠️ NOT SET` - Missing codePath (triage won't work!)

### Switch Active Project

Change which project is currently active:

```bash
bun cli.ts project switch -o <owner> -r <repo>
```

**Example:**
```bash
bun cli.ts project switch -o facebook -r react
```

The active project is used when running commands without explicit `-o/-r` flags.

### Remove a Project

Delete a project configuration:

```bash
bun cli.ts project remove -o <owner> -r <repo>
```

**Example:**
```bash
bun cli.ts project remove -o facebook -r react
```

**Behavior:**
- Deletes project from config file
- Does NOT delete triage data files
- If removing the active project, automatically switches to another project (if available)

## Common Workflows

### Initial Setup

```bash
# Add your first project
bun cli.ts project add \
  -o myorg \
  -r myrepo \
  -t env:GITHUB_TOKEN \
  -p ~/code/myrepo

# Verify it's configured correctly
bun cli.ts project list

# Start triaging
bun cli.ts inbox
```

### Fix Missing codePath (After Upgrade)

If you upgraded and lost codebase access:

```bash
# 1. Check current configuration
bun cli.ts project list

# 2. If you see "⚠️ NOT SET", update the path
bun cli.ts project update \
  -o myorg \
  -r myrepo \
  -p /absolute/path/to/codebase

# 3. Verify the fix
bun cli.ts project list
```

### Manage Multiple Repositories

```bash
# Add multiple projects
bun cli.ts project add -o org1 -r repo1 -t env:TOKEN -p ~/code/repo1
bun cli.ts project add -o org2 -r repo2 -t env:TOKEN -p ~/code/repo2

# List all projects
bun cli.ts project list

# Switch between them
bun cli.ts project switch -o org1 -r repo1
bun cli.ts inbox  # Works on repo1

bun cli.ts project switch -o org2 -r repo2
bun cli.ts inbox  # Works on repo2
```

### Clean Up Old Projects

```bash
# Remove projects you no longer need
bun cli.ts project remove -o old-org -r old-repo

# Check remaining projects
bun cli.ts project list
```

## Configuration File

Projects are stored in `~/.github-triage-config.json`:

```json
{
  "activeProject": "facebook/react",
  "projects": {
    "facebook/react": {
      "owner": "facebook",
      "repo": "react",
      "token": "env:GITHUB_TOKEN",
      "codePath": "/Users/me/repos/react"
    },
    "vercel/next.js": {
      "owner": "vercel",
      "repo": "next.js",
      "token": "env:GITHUB_TOKEN",
      "codePath": "/Users/me/repos/nextjs"
    }
  }
}
```

**Manual Editing:**
You can edit this file directly, but use the CLI commands for safety.

## Troubleshooting

### Triage Not Finding Code

**Symptom:** Triage results say "file not found" or show empty searches

**Solution:**
```bash
# Check if codePath is set
bun cli.ts project list

# If missing, add it
bun cli.ts project update -o owner -r repo -p /path/to/code
```

### Token Not Working

**Symptom:** "401 Unauthorized" errors

**Solutions:**
```bash
# Check token configuration
bun cli.ts project list

# Update token
bun cli.ts project update -o owner -r repo -t env:NEW_TOKEN

# Verify environment variable is set
echo $GITHUB_TOKEN
```

### Wrong Repository Active

**Symptom:** Triaging issues from wrong repository

**Solution:**
```bash
# Check active project
bun cli.ts project list

# Switch to correct project
bun cli.ts project switch -o correct-owner -r correct-repo
```

## Best Practices

1. **Always set codePath:** Use absolute paths, never relative
   ```bash
   # Good
   -p /Users/me/projects/myrepo
   
   # Bad (won't work)
   -p ./myrepo
   -p ~/myrepo  # ~ might not expand correctly
   ```

2. **Use environment variables for tokens:** Never commit tokens to config
   ```bash
   -t env:GITHUB_TOKEN  # Good
   -t ghp_xxxxx        # Bad - token visible in config file
   ```

3. **Organize by team/org:** Use consistent naming
   ```bash
   company-org/backend
   company-org/frontend
   opensource/project1
   ```

4. **Regular cleanup:** Remove projects you're no longer working on
   ```bash
   bun cli.ts project list
   bun cli.ts project remove -o old-org -r old-repo
   ```

5. **Verify after adding:** Always check configuration is correct
   ```bash
   bun cli.ts project add ...
   bun cli.ts project list  # Verify codePath is set!
   ```

## Migration from Legacy Config

If you were using the tool before multi-project support:

```bash
# 1. Check your old repo configuration
cat ~/.github-triage-config.json

# 2. If you have a "githubRepo" field, create a proper project
bun cli.ts project add \
  -o <owner-from-githubRepo> \
  -r <repo-from-githubRepo> \
  -t env:GITHUB_TOKEN \
  -p /path/to/your/codebase

# 3. Verify migration
bun cli.ts project list
```

## See Also

- [Main README](README.md) - General usage and features
- [Background Queue Implementation](BACKGROUND-QUEUE-IMPLEMENTATION.md) - How triage queue works
- [Fixes Summary](FIXES-SUMMARY.md) - Recent bug fixes
