import * as vscode from 'vscode';

/**
 * Represents a file in the git diff tree
 */
export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly section: 'all' | 'committed' | 'uncommitted',
    public readonly baseBranch: string,
    public readonly repoRoot: string,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.resourceUri = resourceUri;
    this.tooltip = resourceUri.fsPath;
    this.contextValue = `fileItem-${section}`;

    // Set the command to open the file when clicked
    if (command) {
      this.command = command;
    }
  }
}

/**
 * Represents a group header in the tree (e.g., "Committed Changes").
 * Carries the owning repository so the tree can support multi-root workspaces.
 */
export class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly repoRoot: string,
    public readonly section: 'all' | 'committed' | 'uncommitted',
    public readonly baseBranch: string
  ) {
    super(label, collapsibleState);
    // Ids must be unique across the whole tree, so scope them by repository.
    this.id = `${repoRoot}::${section}`;
    this.contextValue = 'group';
  }
}

/**
 * Represents a repository (workspace folder) header in a multi-root workspace.
 */
export class RepoItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly repoRoot: string,
    public readonly baseBranch: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = repoRoot;
    this.contextValue = 'repo';
    this.description = `from ${baseBranch}`;
    this.tooltip = repoRoot;
    this.iconPath = new vscode.ThemeIcon('repo');
  }
}

/**
 * File status from git
 */
export enum FileStatus {
  Modified = 'M',
  Added = 'A',
  Deleted = 'D',
  Renamed = 'R',
  Copied = 'C',
  Unmerged = 'U',
  Unknown = '?'
}

/**
 * Changed file with status
 */
export interface ChangedFile {
  path: string;
  status: FileStatus;
}

/**
 * git-spice `gs ls --json` output (one JSON object per line)
 */
export interface GitSpiceBranch {
  name: string;
  current?: boolean;
  down?: { name: string; needsRestack?: boolean };
  ups?: { name: string }[];
  change?: { id: string; url: string };
  push?: { ahead: number; behind: number; needsPush?: boolean };
  worktree?: string;
}
