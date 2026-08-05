# Git Diff Sidebar

VSCode extension that shows files changed from a base branch in the Source Control sidebar.

## Features

- Shows committed changes (diff from base branch, default: `main`)
- Shows uncommitted changes (staged, unstaged, untracked)
- Click file to open, click diff icon to view diff
- Auto-refreshes on file changes
- Stacked-diff integration for branch selection: [GitHub stacks](https://gh.io/stacks) (`gh stack`) and [git-spice](https://github.com/abhinav/git-spice) (`gs`)

## Install

From [Open VSX Registry](https://open-vsx.org/extension/dprslt/vsx-git-diff-from-main) or install `.vsix` manually:

1. Download from [Releases](https://github.com/dprslt/vsx-git-diff-from-main/releases)
2. In VSCode: Extensions > `...` > Install from VSIX

## Usage

1. Open a git repo in VSCode
2. Find "Changes from Base" in Source Control sidebar
3. Use toolbar icons to refresh or change base branch

<img width="387" height="254" alt="image" src="https://github.com/user-attachments/assets/be4678b1-8245-42bd-9688-6da447754eec" />


## Stacked diffs

When the current branch belongs to a stack, the base branch picker lists the
branches below it (marked 🥞) before the recent branches, so you can diff
against the layer you are actually stacked on.

Both stacking tools are supported and detected automatically:

- **GitHub stacks** — `gh stack view --json`
- **git-spice** — `gs ls --json`

A repository can use both. Detection is per branch: whichever tool tracks the
current branch is used, and if both do, **GitHub stacks win** — they are what
the pull requests on GitHub are based on. Set
`gitDiffSidebar.stackProvider` to force one tool or to turn detection off.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitDiffSidebar.gitSpiceExecutable` | `gs` | Path to git-spice executable |
| `gitDiffSidebar.ghExecutable` | `gh` | Path to GitHub CLI executable |
| `gitDiffSidebar.stackProvider` | `auto` | `auto`, `github`, `git-spice` or `none` |

Example (in `settings.json`):
```json
{
  "gitDiffSidebar.gitSpiceExecutable": "gs",
  "gitDiffSidebar.ghExecutable": "gh",
  "gitDiffSidebar.stackProvider": "auto"
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
