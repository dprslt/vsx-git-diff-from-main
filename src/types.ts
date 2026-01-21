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
 * Represents a group header in the tree (e.g., "Committed Changes")
 */
export class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly id: string
  ) {
    super(label, collapsibleState);
    this.id = id;
    this.contextValue = 'group';
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
