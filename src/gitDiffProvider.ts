import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from './gitService';
import { FileItem, GroupItem } from './types';

/**
 * Tree data provider for git diff sidebar
 */
export class GitDiffProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private gitService: GitService;
  private workspaceRoot: string;
  private baseBranch: string = 'main';

  constructor(private context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }
    this.workspaceRoot = workspaceFolders[0].uri.fsPath;
    this.gitService = new GitService(this.workspaceRoot);

    // Restore last selected base branch from workspace state
    this.baseBranch = context.workspaceState.get('gitDiff.baseBranch', 'main');
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set the base branch for comparison
   */
  async setBaseBranch(branch: string): Promise<void> {
    this.baseBranch = branch;
    await this.context.workspaceState.update('gitDiff.baseBranch', branch);
    this.refresh();
  }

  /**
   * Get the current base branch
   */
  getBaseBranch(): string {
    return this.baseBranch;
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level - show groups
      return this.getRootItems();
    }

    // If element is a group, show files in that group
    if (element instanceof GroupItem) {
      if (element.label === 'Committed Changes') {
        return this.getCommittedChangesItems();
      } else if (element.label === 'Uncommitted Changes') {
        return this.getUncommittedChangesItems();
      }
    }

    return [];
  }

  /**
   * Get root level items (groups)
   */
  private async getRootItems(): Promise<vscode.TreeItem[]> {
    const isGitRepo = await this.gitService.isGitRepository();
    if (!isGitRepo) {
      const item = new vscode.TreeItem('Not a git repository');
      item.contextValue = 'error';
      return [item];
    }

    const committedGroup = new GroupItem(
      'Committed Changes',
      vscode.TreeItemCollapsibleState.Expanded
    );
    committedGroup.description = `from ${this.baseBranch}`;
    committedGroup.iconPath = new vscode.ThemeIcon('git-commit');

    const uncommittedGroup = new GroupItem(
      'Uncommitted Changes',
      vscode.TreeItemCollapsibleState.Expanded
    );
    uncommittedGroup.iconPath = new vscode.ThemeIcon('git-modified');

    return [committedGroup, uncommittedGroup];
  }

  /**
   * Get committed changes file items
   */
  private async getCommittedChangesItems(): Promise<vscode.TreeItem[]> {
    const files = await this.gitService.getCommittedChanges(this.baseBranch);
    return files.map(file => this.createFileItem(file));
  }

  /**
   * Get uncommitted changes file items
   */
  private async getUncommittedChangesItems(): Promise<vscode.TreeItem[]> {
    const files = await this.gitService.getUncommittedChanges();
    return files.map(file => this.createFileItem(file));
  }

  /**
   * Create a file tree item
   */
  private createFileItem(filePath: string): FileItem {
    const fileName = path.basename(filePath);
    const fileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath));

    const fileItem = new FileItem(
      fileName,
      fileUri,
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'gitDiff.openFile',
        title: 'Open File',
        arguments: [fileUri]
      }
    );

    // Set description to show relative path
    if (filePath.includes('/')) {
      fileItem.description = path.dirname(filePath);
    }

    // Set icon based on file type
    fileItem.iconPath = vscode.ThemeIcon.File;

    return fileItem;
  }
}
