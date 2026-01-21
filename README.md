# Git Diff Sidebar

A VSCode extension that displays files modified from a base branch in the sidebar. Shows both committed and uncommitted changes, with support for git-spice branch selection.

## Features

- **All Changes**: Combined view of all changes (committed + uncommitted) in one place
- **Committed Changes**: Shows files that differ from the base branch (default: `main`)
- **Uncommitted Changes**: Shows staged, unstaged, and untracked files in your working directory
- **Direct File Navigation**: Click any file to open it directly (not the diff view)
- **Diff View**: Click the diff icon next to any file to view changes side-by-side
- **Git-Spice Integration**: Select any branch from your git-spice stack as the base branch
- **Auto-Refresh**: Automatically updates when files change or git operations complete

## Installation

### From Source

1. Clone or navigate to the extension directory:
   ```bash
   cd ~/repos/vscode-git-diff-sidebar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Package the extension:
   ```bash
   npm run package
   ```

5. Install the generated `.vsix` file in VSCode:
   - Open VSCode
   - Go to Extensions view (Cmd+Shift+X)
   - Click the "..." menu → "Install from VSIX..."
   - Select the generated `.vsix` file

### For Development

1. Open the extension folder in VSCode:
   ```bash
   code ~/repos/vscode-git-diff-sidebar
   ```

2. Press `F5` to launch a new VSCode window with the extension loaded

## Usage

### Viewing Changes

1. Open a git repository in VSCode
2. Look for "Git Changes from Base" in the Explorer sidebar
3. The view shows three groups:
   - **All Changes**: Combined view of all files (committed + uncommitted)
   - **Committed Changes**: Files differing from the base branch
   - **Uncommitted Changes**: Staged, unstaged, and untracked files

### Opening Files

- **Click a file**: Opens it directly in the editor (not a diff view)
- **Click the diff icon (📊)**: Opens the diff view showing changes
  - **All Changes / Committed Changes**: Shows diff from the base branch
  - **Uncommitted Changes**: Shows diff from HEAD (last commit)

### Changing Base Branch

1. Click the branch icon (🌿) in the Git Changes toolbar
2. Select a branch from the list:
   - If git-spice is available: Shows branches from your git-spice stack
   - If git-spice is not available: Shows all git branches in the repository
3. The view updates to show changes from the new base branch

### Manual Refresh

- Click the refresh icon (🔄) in the Git Changes toolbar
- Or run the command: "Refresh Git Changes" from the Command Palette (Cmd+Shift+P)

## Configuration

The extension stores the selected base branch per workspace, so each project can have its own base branch setting.

## Git-Spice Support

This extension supports [git-spice](https://github.com/abhinav/git-spice) workflows. When git-spice is available, the branch selector shows branches from your git-spice stack (parent and child branches in the tree).

The git-spice binary is expected at:

```bash
~/.alan/bin/gis
```

If git-spice is not available, the extension falls back to showing all regular git branches.

## Requirements

- VSCode 1.85.0 or higher
- A git repository

## Development

### Project Structure

```text
vscode-git-diff-sidebar/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── gitDiffProvider.ts    # Tree view provider
│   ├── gitService.ts         # Git command execution
│   └── types.ts              # TypeScript types
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── .vscode/
    ├── launch.json           # Debug configuration
    └── tasks.json            # Build tasks
```

### Building

```bash
npm run compile    # Compile TypeScript
npm run watch      # Watch mode for development
npm run package    # Create .vsix package
```

### Debugging

1. Open the project in VSCode
2. Press `F5` to launch Extension Development Host
3. Set breakpoints in the source files
4. Open a git repository in the Extension Development Host window

## Troubleshooting

### "Not a git repository" message

- Make sure you've opened a folder that contains a git repository
- The extension requires a `.git` directory in the workspace root

### No branches showing in selector

- Verify git is installed and available in your PATH
- Check if the git repository has multiple branches

### Git-spice branches not showing

- Verify git-spice is installed at `~/.alan/bin/gis`
- The extension will fall back to regular git branches if git-spice is unavailable

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
