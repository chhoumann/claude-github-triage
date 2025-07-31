# Claude GitHub Triage

An AI-powered GitHub issue triage bot that uses Claude Code SDK to analyze issues in the context of your codebase and provide intelligent recommendations.

## Features

- Analyzes GitHub issues using Claude AI with full codebase context
- Provides recommendations for:
  - Whether to close or keep issues open
  - Appropriate labels to add
  - Suggested responses to issue authors
- Can process single issues or batch triage multiple issues
- Optionally applies recommendations directly to GitHub

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

### Test GitHub Connection
```bash
bun run start test -o owner -r repo
```

### Triage a Single Issue
```bash
bun run start triage -o owner -r repo -i 123 -p /path/to/codebase
```

### Triage Multiple Issues
```bash
bun run start triage -o owner -r repo -p /path/to/codebase --limit 10
```

### Apply Recommendations Automatically
Add the `--apply` flag to automatically update issues based on recommendations:
```bash
bun run start triage -o owner -r repo --apply
```

### Command Options

- `-o, --owner <owner>`: Repository owner (required)
- `-r, --repo <repo>`: Repository name (required)
- `-t, --token <token>`: GitHub token (defaults to GITHUB_TOKEN env var)
- `-p, --path <path>`: Path to project codebase (defaults to current directory)
- `-i, --issue <number>`: Specific issue number to triage
- `-s, --state <state>`: Issue state filter (open/closed/all, default: open)
- `-l, --labels <labels...>`: Filter by labels
- `--limit <number>`: Maximum number of issues to triage (default: 10)
- `--apply`: Apply recommendations to GitHub

## How It Works

1. The bot fetches issues from your GitHub repository
2. For each issue, it uses Claude Code SDK to:
   - Explore your codebase to understand the context
   - Search for relevant code, documentation, and implementations
   - Analyze whether the issue is valid, a duplicate, or needs attention
3. It creates markdown files in the `results/` directory with detailed analysis
4. Each file is named `issue-{number}-triage.md` and contains:
   - Issue title and number
   - Recommendation (Should Close: Yes/No)
   - Suggested labels
   - Confidence level (High/Medium/Low)
   - Detailed analysis and reasoning
   - Suggested response (if applicable)
5. Optionally applies the recommendations to GitHub

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

- Bun runtime
- GitHub personal access token with repo permissions
- Access to Claude Code SDK
