import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from './gitService';
import { FileItem, GroupItem } from './types';
import { Logger } from './logger';

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
    try {
      if (!element) {
        // Root level - show groups
        Logger.log('[GitDiff] Getting root items');
        return this.getRootItems();
      }

      // If element is a group, show files in that group
      if (element instanceof GroupItem) {
        Logger.log(`[GitDiff] Getting children for group: ${element.label}`);
        if (element.label === 'All Changes') {
          return this.getAllChangesItems();
        } else if (element.label === 'Committed Changes') {
          return this.getCommittedChangesItems();
        } else if (element.label === 'Uncommitted Changes') {
          return this.getUncommittedChangesItems();
        }
      }

      Logger.log(`[GitDiff] No children for element: ${element.label}`);
      return [];
    } catch (error) {
      Logger.error('[GitDiff] Error in getChildren', error);
      return [];
    }
  }

  /**
   * Get root level items (groups)
   */
  private async getRootItems(): Promise<vscode.TreeItem[]> {
    Logger.log('[GitDiff] Getting root items, checking if git repo...');
    const isGitRepo = await this.gitService.isGitRepository();
    if (!isGitRepo) {
      Logger.log('[GitDiff] Not a git repository');
      const item = new vscode.TreeItem('Not a git repository');
      item.contextValue = 'error';
      return [item];
    }

    Logger.log(`[GitDiff] Creating groups with base branch: ${this.baseBranch}`);

    const allChangesGroup = new GroupItem(
      'All Changes',
      vscode.TreeItemCollapsibleState.Expanded,
      'all-changes'
    );
    allChangesGroup.description = `from ${this.baseBranch}`;
    allChangesGroup.iconPath = new vscode.ThemeIcon('files');

    const committedGroup = new GroupItem(
      'Committed Changes',
      vscode.TreeItemCollapsibleState.Collapsed,
      'committed-changes'
    );
    committedGroup.description = `from ${this.baseBranch}`;
    committedGroup.iconPath = new vscode.ThemeIcon('git-commit');

    const uncommittedGroup = new GroupItem(
      'Uncommitted Changes',
      vscode.TreeItemCollapsibleState.Collapsed,
      'uncommitted-changes'
    );
    uncommittedGroup.iconPath = new vscode.ThemeIcon('git-modified');

    Logger.log('[GitDiff] Created 3 groups');
    return [allChangesGroup, committedGroup, uncommittedGroup];
  }

  /**
   * Get all changes (committed + uncommitted combined)
   */
  private async getAllChangesItems(): Promise<vscode.TreeItem[]> {
    Logger.log(`[GitDiff] Getting all changes from ${this.baseBranch}`);
    const committedFiles = await this.gitService.getCommittedChanges(this.baseBranch);
    Logger.log(`[GitDiff] Committed files: ${committedFiles.length}`);
    const uncommittedFiles = await this.gitService.getUncommittedChanges();
    Logger.log(`[GitDiff] Uncommitted files: ${uncommittedFiles.length}`);

    // Combine and deduplicate
    const allFiles = [...new Set([...committedFiles, ...uncommittedFiles])];
    Logger.log(`[GitDiff] Total all changes: ${allFiles.length}`);
    return allFiles.map(file => this.createFileItem(file, 'all'));
  }

  /**
   * Get committed changes file items
   */
  private async getCommittedChangesItems(): Promise<vscode.TreeItem[]> {
    Logger.log(`[GitDiff] Getting committed changes from ${this.baseBranch}`);
    const files = await this.gitService.getCommittedChanges(this.baseBranch);
    Logger.log(`[GitDiff] Found ${files.length} committed files`);
    return files.map(file => this.createFileItem(file, 'committed'));
  }

  /**
   * Get uncommitted changes file items
   */
  private async getUncommittedChangesItems(): Promise<vscode.TreeItem[]> {
    Logger.log('[GitDiff] Getting uncommitted changes');
    const files = await this.gitService.getUncommittedChanges();
    Logger.log(`[GitDiff] Found ${files.length} uncommitted files`);
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
