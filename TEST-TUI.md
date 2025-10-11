# Testing TUI Project Switcher

## Setup

1. Add multiple projects:
```bash
bun cli.ts project add -o owner1 -r repo1 -t env:GITHUB_TOKEN
bun cli.ts project add -o owner2 -r repo2 -t env:GITHUB_TOKEN
bun cli.ts project list
```

## Test the TUI

1. Launch the TUI:
```bash
bun cli.ts inbox
```

2. You should see:
   - **Status bar** showing current project: `📁 owner1/repo1 | Unread: X | Read: Y | Total: Z`
   - Help text at bottom showing: `P Project` option

3. Test project switcher:
   - Press `P` to open project selector
   - You'll see a list like:
     ```
     Switch Project
     
     1 - owner1/repo1 (current)
     2 - owner2/repo2
     
     Press number to select, ESC or Q to cancel
     ```
   - Press `2` to switch to owner2/repo2
   - The TUI will reload with the new project's data
   - Status bar will now show: `📁 owner2/repo2 | ...`

4. Test help screen:
   - Press `?` to see help
   - Verify "P - Switch project" is listed under "Other:"

## Expected Behavior

✅ Current project name visible in status bar
✅ `P` key opens project selector (if >1 project)
✅ Shows "Only one project configured" if only 1 project
✅ Shows error if no projects configured
✅ Switching project reloads all data for new project
✅ Current project is marked in selector
✅ ESC or Q cancels project selection

## Features

- **Seamless switching**: No need to quit and restart
- **Visual feedback**: Current project shown in bold magenta
- **Smart filtering**: Only shows projects when multiple exist
- **Context preservation**: Returns to same view after switching
