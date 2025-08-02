# Claude GitHub Triage

An AI-powered GitHub issue triage bot that uses Claude Code SDK to analyze issues in the context of your codebase and provide intelligent recommendations.

## Features

- **AI-Powered Analysis**: Uses Claude to analyze issues with full codebase context
- **Smart Recommendations**: Suggests whether to close issues, what labels to add, and provides response templates
- **Batch Processing**: Process single issues or multiple issues with pagination support
- **Review System**: Track which triaged issues you've reviewed with an inbox-style interface
- **Concurrency Control**: Process multiple issues in parallel with configurable limits
- **Skip Detection**: Automatically skips already-triaged issues (with force option)
- **GitHub Sync**: Mark closed issues as read automatically

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up your GitHub token:
```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

## Usage

### Quick Start
```bash
# Test connection
bun cli.ts test -o owner -r repo
# or
bun run start test -o owner -r repo

# Triage all open issues
bun cli.ts triage -o owner -r repo -p /path/to/codebase

# View your triage inbox
bun cli.ts inbox

# Review unread issues
bun cli.ts review
```

> **Note**: You can run commands using either `bun cli.ts` or `bun run start`

### Commands

#### `test` - Test GitHub Connection
```bash
bun cli.ts test -o owner -r repo
```
Verifies your GitHub token and connection to the repository.

#### `triage` - Analyze GitHub Issues
```bash
# Single issue
bun cli.ts triage -o owner -r repo -i 123 -p /path/to/codebase

# Multiple issues (default: no limit, processes all)
bun cli.ts triage -o owner -r repo -p /path/to/codebase --limit 10

# With specific options
bun cli.ts triage -o owner -r repo \
  -p /path/to/codebase \
  --state open \
  --limit 50 \
  --concurrency 5 \
  --force
```

**Options:**
- `-o, --owner <owner>`: Repository owner (required)
- `-r, --repo <repo>`: Repository name (required)
- `-t, --token <token>`: GitHub token (defaults to GITHUB_TOKEN env var)
- `-p, --path <path>`: Path to project codebase (defaults to current directory)
- `-i, --issue <number>`: Specific issue number to triage
- `-s, --state <state>`: Issue state filter (open/closed/all, default: open)
- `-l, --labels <labels...>`: Filter by labels
- `--limit <number>`: Maximum number of issues to triage (omit for all)
- `-c, --concurrency <number>`: Concurrent Claude instances (default: 3)
- `-f, --force`: Force re-triage of existing issues
- `--apply`: Apply recommendations to GitHub (add labels, close issues)

#### `inbox` - View Triaged Issues
```bash
# View all issues
bun cli.ts inbox

# Filter by status
bun cli.ts inbox --filter unread
bun cli.ts inbox --filter read

# Sort options
bun cli.ts inbox --sort date
```

**Options:**
- `-f, --filter <type>`: Filter by status (all/read/unread, default: all)
- `-s, --sort <field>`: Sort by field (number/date, default: number)

Shows a table with:
- Issue number
- Read/unread status
- Triage date
- Review date
- Should close recommendation

#### `review` - Review Triaged Issues
```bash
# Review next unread issue
bun cli.ts review

# Review specific issue
bun cli.ts review --issue 123

# Review all unread issues sequentially
bun cli.ts review --all
```

**Options:**
- `-i, --issue <number>`: Review specific issue
- `-a, --all`: Review all unread issues in sequence

Displays the full triage analysis and automatically marks issues as read.

#### `mark` - Mark Issues Read/Unread
```bash
# Mark specific issue
bun cli.ts mark 123 --read
bun cli.ts mark 123 --unread

# Mark all as read
bun cli.ts mark --all --read
```

**Options:**
- `-r, --read`: Mark as read
- `-u, --unread`: Mark as unread
- `-a, --all`: Apply to all issues

#### `sync` - Sync with GitHub
```bash
bun cli.ts sync -o owner -r repo
```

Fetches closed issues from GitHub and marks them as read in your local review system. Useful for keeping your inbox clean after closing issues through GitHub's web interface.

**Options:**
- `-o, --owner <owner>`: Repository owner (required)
- `-r, --repo <repo>`: Repository name (required)
- `-t, --token <token>`: GitHub token (defaults to GITHUB_TOKEN env var)

## Review Workflow

A typical workflow for triaging and reviewing issues:

1. **Initial Triage**: Run triage on your repository
   ```bash
   bun cli.ts triage -o owner -r repo -p ./codebase
   ```

2. **Check Inbox**: See what needs review
   ```bash
   bun cli.ts inbox --filter unread
   ```

3. **Review Issues**: Go through unread issues
   ```bash
   bun cli.ts review --all  # Review all
   # or
   bun cli.ts review       # Review one at a time
   ```

4. **Sync Periodically**: Keep inbox clean
   ```bash
   bun cli.ts sync -o owner -r repo
   ```

## How It Works

### Triage Process

1. The bot fetches issues from your GitHub repository
2. For each issue, it uses Claude Code SDK to:
   - Explore your codebase to understand the context
   - Search for relevant code, documentation, and implementations
   - Analyze whether the issue is valid, a duplicate, or needs attention
3. It creates markdown files in the `results/` directory with detailed analysis
4. Tracks metadata in `results/.triage-metadata.json` for review status

### File Structure

```
results/
├── issue-123-triage.md          # Triage analysis
├── issue-123-triage-debug.json  # Debug info (optional)
├── issue-124-triage.md
└── .triage-metadata.json        # Review tracking metadata
```

### Triage Output Format

Each triage file contains:

```
=== TRIAGE ANALYSIS START ===
SHOULD_CLOSE: Yes/No
LABELS: label1, label2, label3
CONFIDENCE: High/Medium/Low

ANALYSIS:
[Detailed analysis and reasoning]

SUGGESTED_RESPONSE:
[Optional response template for the issue]
=== TRIAGE ANALYSIS END ===
```

## API Usage

You can also use the library programmatically:

```typescript
import { IssueTriage } from 'claude-github-triage';

const triager = new IssueTriage(githubToken);

const recommendation = await triager.triageIssue(
  'owner',
  'repo',
  123,
  '/path/to/codebase'
);

console.log(recommendation);
```

## Output Format

All triage results are saved as markdown files in the `results/` directory. Example file structure:

```markdown
# Issue #123: Feature Request: Add dark mode

## Recommendation
Should Close: No

## Suggested Labels
- enhancement
- UI/UX

## Confidence Level
High

## Analysis
This is a valid feature request that aligns with modern application standards...

## Suggested Response
Thank you for your suggestion! Dark mode is indeed a valuable feature...
```

## Requirements

- Bun runtime (v1.0+)
- GitHub personal access token with repo permissions
- Access to Claude Code SDK
- A local codebase to analyze issues against

## Environment Variables

- `GITHUB_TOKEN`: Your GitHub personal access token (required for API access)

## Tips

- **Concurrency**: Adjust `--concurrency` based on your rate limits and system resources
- **Pagination**: When triaging without `--limit`, the tool fetches ALL issues page by page
- **Skip Detection**: Already-triaged issues are automatically skipped unless you use `--force`
- **Review Workflow**: Use `inbox` → `review` → `sync` for an efficient workflow
- **Debug Info**: Check `issue-*-debug.json` files for Claude's full analysis process
