# Git Diff Sidebar - VSCode Extension

## Overview

VSCode extension showing files changed from a base branch in Source Control sidebar. Supports GitHub stacks and git-spice for stacked diffs.

## Architecture

```
src/
├── extension.ts      # Entry point, commands, activation
├── gitService.ts     # Git operations (diff, branches, merge-base)
├── stackService.ts   # Stack detection (gh stack / git-spice)
├── gitDiffProvider.ts # TreeDataProvider for sidebar view
├── logger.ts         # Output channel logging
└── types.ts          # TypeScript interfaces
```

## Key Commands

| Command | Description |
|---------|-------------|
| `gitDiff.refresh` | Refresh file list |
| `gitDiff.selectBaseBranch` | Change base branch |
| `gitDiff.openFile` | Open file in editor |
| `gitDiff.openDiff` | Open diff view |

## Settings

- `gitDiffSidebar.gitSpiceExecutable` - Path to git-spice (`gs` by default)
- `gitDiffSidebar.ghExecutable` - Path to GitHub CLI (`gh` by default)
- `gitDiffSidebar.stackProvider` - `auto` (default), `github`, `git-spice` or `none`

## Development

```bash
npm install
npm run compile   # Build TypeScript
npm run watch     # Watch mode
npm run package   # Create .vsix
```

Press F5 to debug in new VSCode window.

## Release

```bash
npm run version:patch  # Bump 0.0.x
npm run publish        # Push with tags (CI builds .vsix)
```

## Key Patterns

- Uses `child_process.exec` for git commands
- TreeView with `vscode.TreeDataProvider`
- File watcher for auto-refresh
- Stack detection by parsing `gh stack view --json` and `gs ls --json`. Both
  are probed in parallel; when both track the current branch, GitHub stacks
  win (that is what the PRs on GitHub are based on). Note `gh stack` state is
  per-worktree (`$GIT_DIR/gh-stack`), git-spice state is shared per repo
  (`refs/spice/data`).
