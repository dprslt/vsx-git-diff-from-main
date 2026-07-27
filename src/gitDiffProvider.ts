import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from './gitService';
import { FileItem, GroupItem, RepoItem } from './types';
import { Logger } from './logger';

/**
 * A git repository discovered in the workspace, together with the base
 * branch its changes are compared against.
 */
export interface RepoContext {
  root: string;
  name: string;
  service: GitService;
  baseBranch: string;
}

const LEGACY_BASE_BRANCH_KEY = 'gitDiff.baseBranch';

/**
 * Tree data provider for the git diff sidebar.
 *
 * Supports multi-root workspaces: every workspace folder that is a git
 * repository is shown as its own top-level node. When there is only a single
 * repository the repository node is omitted and the change groups are shown
 * directly at the root, preserving the original single-repo layout.
 */
export class GitDiffProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repos: RepoContext[] = [];
  private reposByRoot = new Map<string, RepoContext>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private baseBranchKey(root: string): string {
    return `${LEGACY_BASE_BRANCH_KEY}::${root}`;
  }

  /**
   * Resolve the base branch for a repository: per-repo saved value, then the
   * legacy single-repo saved value (for backward compatibility), then a
   * detected default.
   */
  private async resolveBaseBranch(root: string, service: GitService): Promise<string> {
    const perRepo = this.context.workspaceState.get<string>(this.baseBranchKey(root));
    if (perRepo) {
      return perRepo;
    }
    const legacy = this.context.workspaceState.get<string>(LEGACY_BASE_BRANCH_KEY);
    if (legacy) {
      return legacy;
    }
    return service.getDefaultBaseBranch();
  }

  /**
   * Discover every workspace folder that is a git repository.
   */
  private async discoverRepos(): Promise<RepoContext[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const repos: RepoContext[] = [];

    for (const folder of folders) {
      const root = folder.uri.fsPath;
      const service = new GitService(root);
      if (await service.isGitRepository()) {
        const baseBranch = await this.resolveBaseBranch(root, service);
        repos.push({ root, name: folder.name, service, baseBranch });
      }
    }

    this.repos = repos;
    this.reposByRoot = new Map(repos.map(r => [r.root, r]));
    // Drive the visibility of the title-bar "Select Base Branch" action: it is
    // only unambiguous when there is a single repository. In multi-root
    // workspaces the base branch is changed per repository from its own node.
    vscode.commands.executeCommand('setContext', 'gitDiff.multiRoot', repos.length > 1);
    Logger.log(`[GitDiff] Discovered ${repos.length} git repositor${repos.length === 1 ? 'y' : 'ies'}`);
    return repos;
  }

  /**
   * Public accessor used by commands; discovers repositories on demand.
   */
  async getRepos(): Promise<RepoContext[]> {
    if (this.repos.length === 0) {
      await this.discoverRepos();
    }
    return this.repos;
  }

  /**
   * Get a git service for a repository root (cached when known).
   */
  getService(root: string): GitService {
    return this.reposByRoot.get(root)?.service ?? new GitService(root);
  }

  /**
   * Set the base branch for a specific repository and refresh.
   */
  async setBaseBranch(root: string, branch: string): Promise<void> {
    await this.context.workspaceState.update(this.baseBranchKey(root), branch);
    const repo = this.reposByRoot.get(root);
    if (repo) {
      repo.baseBranch = branch;
    }
    this.refresh();
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
        const repos = await this.discoverRepos();
        if (repos.length === 0) {
          const item = new vscode.TreeItem('No git repository in workspace');
          item.contextValue = 'error';
          return [item];
        }
        // Single repo: keep the original flat layout (groups at the root).
        if (repos.length === 1) {
          return this.getGroupItems(repos[0]);
        }
        // Multi-root: one node per repository.
        return repos.map(r => new RepoItem(r.name, r.root, r.baseBranch));
      }

      if (element instanceof RepoItem) {
        const repo = this.reposByRoot.get(element.repoRoot);
        return repo ? this.getGroupItems(repo) : [];
      }

      if (element instanceof GroupItem) {
        return this.getFileItems(element.repoRoot, element.section, element.baseBranch);
      }

      return [];
    } catch (error) {
      Logger.error('[GitDiff] Error in getChildren', error);
      return [];
    }
  }

  /**
   * Build the three change groups for a repository.
   */
  private getGroupItems(repo: RepoContext): GroupItem[] {
    const allChangesGroup = new GroupItem(
      'All Changes',
      vscode.TreeItemCollapsibleState.Expanded,
      repo.root,
      'all',
      repo.baseBranch
    );
    allChangesGroup.description = `from ${repo.baseBranch}`;
    allChangesGroup.iconPath = new vscode.ThemeIcon('files');

    const committedGroup = new GroupItem(
      'Committed Changes',
      vscode.TreeItemCollapsibleState.Collapsed,
      repo.root,
      'committed',
      repo.baseBranch
    );
    committedGroup.description = `from ${repo.baseBranch}`;
    committedGroup.iconPath = new vscode.ThemeIcon('git-commit');

    const uncommittedGroup = new GroupItem(
      'Uncommitted Changes',
      vscode.TreeItemCollapsibleState.Collapsed,
      repo.root,
      'uncommitted',
      repo.baseBranch
    );
    uncommittedGroup.iconPath = new vscode.ThemeIcon('git-modified');

    return [allChangesGroup, committedGroup, uncommittedGroup];
  }

  /**
   * List files for a group within a repository.
   */
  private async getFileItems(
    root: string,
    section: 'all' | 'committed' | 'uncommitted',
    baseBranch: string
  ): Promise<FileItem[]> {
    const repo = this.reposByRoot.get(root);
    if (!repo) {
      return [];
    }

    let files: string[];
    if (section === 'committed') {
      files = await repo.service.getCommittedChanges(baseBranch);
    } else if (section === 'uncommitted') {
      files = await repo.service.getUncommittedChanges();
    } else {
      const committed = await repo.service.getCommittedChanges(baseBranch);
      const uncommitted = await repo.service.getUncommittedChanges();
      files = [...new Set([...committed, ...uncommitted])];
    }

    return files.map(file => this.createFileItem(root, file, section, baseBranch));
  }

  /**
   * Create a file tree item scoped to its repository.
   */
  private createFileItem(
    root: string,
    filePath: string,
    section: 'all' | 'committed' | 'uncommitted',
    baseBranch: string
  ): FileItem {
    const fileName = path.basename(filePath);
    const fileUri = vscode.Uri.file(path.join(root, filePath));
    const fileItem = new FileItem(
      fileName,
      fileUri,
      vscode.TreeItemCollapsibleState.None,
      section,
      baseBranch,
      root,
      {
        command: 'gitDiff.openFile',
        title: 'Open File',
        arguments: [fileUri]
      }
    );

    if (filePath.includes('/')) {
      fileItem.description = path.dirname(filePath);
    }
    fileItem.iconPath = vscode.ThemeIcon.File;
    return fileItem;
  }
}
