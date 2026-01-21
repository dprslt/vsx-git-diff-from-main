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
      if (element.label === 'All Changes') {
        return this.getAllChangesItems();
      } else if (element.label === 'Committed Changes') {
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

    const allChangesGroup = new GroupItem(
      'All Changes',
      vscode.TreeItemCollapsibleState.Expanded
    );
    allChangesGroup.description = `from ${this.baseBranch}`;
    allChangesGroup.iconPath = new vscode.ThemeIcon('files');

    const committedGroup = new GroupItem(
      'Committed Changes',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    committedGroup.description = `from ${this.baseBranch}`;
    committedGroup.iconPath = new vscode.ThemeIcon('git-commit');

    const uncommittedGroup = new GroupItem(
      'Uncommitted Changes',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    uncommittedGroup.iconPath = new vscode.ThemeIcon('git-modified');

    return [allChangesGroup, committedGroup, uncommittedGroup];
  }

  /**
   * Get all changes (committed + uncommitted combined)
   */
  private async getAllChangesItems(): Promise<vscode.TreeItem[]> {
    const committedFiles = await this.gitService.getCommittedChanges(this.baseBranch);
    const uncommittedFiles = await this.gitService.getUncommittedChanges();

    // Combine and deduplicate
    const allFiles = [...new Set([...committedFiles, ...uncommittedFiles])];
    return allFiles.map(file => this.createFileItem(file, 'all'));
  }

  /**
   * Get committed changes file items
   */
  private async getCommittedChangesItems(): Promise<vscode.TreeItem[]> {
    const files = await this.gitService.getCommittedChanges(this.baseBranch);
    return files.map(file => this.createFileItem(file, 'committed'));
  }

  /**
   * Get uncommitted changes file items
   */
  private async getUncommittedChangesItems(): Promise<vscode.TreeItem[]> {
    const files = await this.gitService.getUncommittedChanges();
    return files.map(file => this.createFileItem(file, 'uncommitted'));
  }

  /**
   * Create a file tree item
   */
  private createFileItem(filePath: string, section: 'all' | 'committed' | 'uncommitted'): FileItem {
    const fileName = path.basename(filePath);
    const fileUri = vscode.Uri.file(path.join(this.workspaceRoot, filePath));

    const fileItem = new FileItem(
      fileName,
      fileUri,
      vscode.TreeItemCollapsibleState.None,
      section,
      this.baseBranch,
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
