# Git Diff Sidebar

VSCode extension that shows files changed from a base branch in the Source Control sidebar.

## Features

- Shows committed changes (diff from base branch, default: `main`)
- Shows uncommitted changes (staged, unstaged, untracked)
- Click file to open, click diff icon to view diff
- Auto-refreshes on file changes
- Optional [git-spice](https://github.com/abhinav/git-spice) integration for branch selection

## Install

From [Open VSX Registry](https://open-vsx.org/extension/dprslt/vsx-git-diff-from-main) or install `.vsix` manually:

1. Download from [Releases](https://github.com/dprslt/vsx-git-diff-from-main/releases)
2. In VSCode: Extensions > `...` > Install from VSIX

## Usage

1. Open a git repo in VSCode
2. Find "Changes from Base" in Source Control sidebar
3. Use toolbar icons to refresh or change base branch

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitDiffSidebar.gitSpiceExecutable` | `gs` | Path to git-spice executable |

Example (in `settings.json`):
```json
{
  "gitDiffSidebar.gitSpiceExecutable": "gs"
}
```

## Development

```bash
npm install
npm run compile
npm run package  # creates .vsix
```

Press `F5` in VSCode to launch extension in debug mode.

## License

MIT
