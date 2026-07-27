import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitDiffProvider } from './gitDiffProvider';
import { Logger } from './logger';

const execAsync = promisify(exec);

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  // Initialize logger
  Logger.initialize('Git Diff Sidebar');
  Logger.log('Extension activating...');
  Logger.log('========================================');

  // Check if we have a workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    Logger.log('No workspace folder found');
    vscode.window.showWarningMessage('Git Diff Sidebar: No workspace folder found');
    return;
  }
  Logger.log(`Workspace folders: ${workspaceFolders.map(f => f.uri.fsPath).join(', ')}`);

  // Register open file command BEFORE creating tree view
  const openFileCommand = vscode.commands.registerCommand(
    'gitDiff.openFile',
    async (fileUri: vscode.Uri) => {
      try {
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${error}`);
      }
    }
  );
  context.subscriptions.push(openFileCommand);

  // Create the tree data provider
  Logger.log('Creating tree data provider...');
  const gitDiffProvider = new GitDiffProvider(context);

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand('gitDiff.refresh', () => {
    gitDiffProvider.refresh();
    vscode.window.showInformationMessage('Git changes refreshed');
  });
  context.subscriptions.push(refreshCommand);

  // Register the tree data provider
  Logger.log('Registering tree view...');
  const treeView = vscode.window.createTreeView('gitDiffSidebar', {
    treeDataProvider: gitDiffProvider,
    showCollapseAll: true
  });

  context.subscriptions.push(treeView);
  Logger.log('Tree view registered successfully');

  // Register a content provider for git file contents
  const gitContentProvider = new (class implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
      const params = JSON.parse(uri.query);
      const { relativePath, ref, repoRoot } = params;
      try {
        const { stdout } = await execAsync(`git show ${ref}:${relativePath}`, {
          cwd: repoRoot
        });
        return stdout;
      } catch (error) {
        Logger.log(`[GitDiff] No base content for ${relativePath} at ${ref} (new file or deleted)`);
        return '';
      }
    }
  })();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('gitdiff', gitContentProvider)
  );

  // Register open diff view command
  const openDiffCommand = vscode.commands.registerCommand(
    'gitDiff.openDiff',
    async (fileItem: any) => {
      try {
        // Fallback: if fileItem is missing or incomplete, use tree view selection
        if (!fileItem?.resourceUri) {
          const selected = treeView.selection[0];
          if (!selected || !('resourceUri' in selected) || !selected.resourceUri) {
            vscode.window.showErrorMessage('No file selected for diff');
            return;
          }
          fileItem = selected;
        }

        const fileUri = fileItem.resourceUri;
        const section = fileItem.section
          ?? fileItem.contextValue?.replace('fileItem-', '')
          ?? 'all';
        const absolutePath = fileUri.fsPath;

        // Resolve the repository this file belongs to. Prefer the value the
        // tree item carries; fall back to the file's workspace folder.
        const repoRoot: string = fileItem.repoRoot
          ?? vscode.workspace.getWorkspaceFolder(fileUri)?.uri.fsPath
          ?? workspaceFolders[0].uri.fsPath;
        const baseBranch = fileItem.baseBranch ?? 'main';

        // Get relative path from the repository root
        const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join('/');

        let ref: string;
        let title: string;

        if (section === 'all' || section === 'committed') {
          const mergeBase = await gitDiffProvider.getService(repoRoot).getMergeBase(baseBranch);
          ref = mergeBase;
          title = `${path.basename(absolutePath)} (${baseBranch} ↔ Working Tree)`;
        } else {
          ref = 'HEAD';
          title = `${path.basename(absolutePath)} (HEAD ↔ Working Tree)`;
        }

        // Build URI for our custom content provider
        const gitUri = vscode.Uri.from({
          scheme: 'gitdiff',
          path: absolutePath,
          query: JSON.stringify({ relativePath, ref, repoRoot })
        });

        await vscode.commands.executeCommand(
          'vscode.diff',
          gitUri,
          fileUri,
          title
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
      }
    }
  );
  context.subscriptions.push(openDiffCommand);

  // Register select base branch command
  const selectBaseBranchCommand = vscode.commands.registerCommand(
    'gitDiff.selectBaseBranch',
    async (item?: any) => {
      try {
        // Resolve which repository to change the base branch for. When invoked
        // from a repository's context menu the item carries the root; when
        // invoked from the title bar we pick the only repo, or prompt when
        // there is more than one.
        let repoRoot: string | undefined = item?.repoRoot;
        if (!repoRoot) {
          const repos = await gitDiffProvider.getRepos();
          if (repos.length === 0) {
            vscode.window.showWarningMessage('Git Diff Sidebar: No git repository in workspace');
            return;
          }
          if (repos.length === 1) {
            repoRoot = repos[0].root;
          } else {
            const picked = await vscode.window.showQuickPick(
              repos.map(r => ({ label: r.name, description: `current: ${r.baseBranch}`, root: r.root })),
              { title: 'Select repository', placeHolder: 'Choose a repository to change its base branch' }
            );
            if (!picked) {
              return;
            }
            repoRoot = picked.root;
          }
        }

        const gitService = gitDiffProvider.getService(repoRoot);
        const currentRepo = (await gitDiffProvider.getRepos()).find(r => r.root === repoRoot);
        const currentBaseBranch = item?.baseBranch ?? currentRepo?.baseBranch ?? 'main';

        // Create QuickPick for sections and dynamic filtering
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `Select Base Branch (current: ${currentBaseBranch})`;
        quickPick.placeholder = 'Type to filter branches...';
        quickPick.matchOnDescription = true;

        // Build initial items
        const buildItems = async (filterQuery?: string): Promise<vscode.QuickPickItem[]> => {
          const items: vscode.QuickPickItem[] = [];

          if (filterQuery && filterQuery.length > 0) {
            // When filtering, show filtered results only
            const filtered = await gitService.filterBranches(filterQuery, 10);
            items.push(...filtered.map(b => ({ label: b })));
          } else {
            // Show git-spice stack branches (prefixed with emoji) + recent branches
            const isInStack = await gitService.isInGitSpiceStack();
            const stackBranchSet = new Set<string>();

            if (isInStack) {
              const stackBranches = await gitService.getGitSpiceParentBranches();
              for (const b of stackBranches) {
                stackBranchSet.add(b);
                items.push({ label: `🥞 ${b}`, description: 'git-spice stack' });
              }
            }

            // Recent branches (skip first one which is current branch, and skip stack branches)
            const recentBranches = await gitService.getRecentBranches(11);
            const filteredRecent = recentBranches
              .slice(1) // Skip first (current branch)
              .filter(b => !stackBranchSet.has(b))
              .slice(0, 10);
            items.push(...filteredRecent.map(b => ({ label: b })));
          }

          return items;
        };

        // Load initial items
        quickPick.busy = true;
        quickPick.items = await buildItems();
        quickPick.busy = false;

        // Debounce for filter updates
        let filterTimeout: ReturnType<typeof setTimeout> | undefined;

        quickPick.onDidChangeValue(async (value) => {
          if (filterTimeout) {
            clearTimeout(filterTimeout);
          }
          filterTimeout = setTimeout(async () => {
            quickPick.busy = true;
            quickPick.items = await buildItems(value);
            quickPick.busy = false;
          }, 150);
        });

        // Handle selection
        quickPick.onDidAccept(async () => {
          const selected = quickPick.selectedItems[0];
          if (selected) {
            // Strip emoji prefix if present
            const branchName = selected.label.replace(/^🥞 /, '');
            if (branchName !== currentBaseBranch) {
              await gitDiffProvider.setBaseBranch(repoRoot, branchName);
              vscode.window.showInformationMessage(`Base branch changed to: ${branchName}`);
            }
          }
          quickPick.dispose();
        });

        quickPick.onDidHide(() => {
          if (filterTimeout) {
            clearTimeout(filterTimeout);
          }
          quickPick.dispose();
        });

        quickPick.show();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to select base branch: ${error}`);
      }
    }
  );
  context.subscriptions.push(selectBaseBranchCommand);

  // Debounced refresh to prevent infinite loops from file watcher cascades
  let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
  const REFRESH_DEBOUNCE_MS = 300;

  const debouncedRefresh = () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      gitDiffProvider.refresh();
    }, REFRESH_DEBOUNCE_MS);
  };

  // Clean up timeout on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    }
  });

  // Set up file system watcher for auto-refresh
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

  fileWatcher.onDidChange(() => {
    debouncedRefresh();
  });

  fileWatcher.onDidCreate(() => {
    debouncedRefresh();
  });

  fileWatcher.onDidDelete(() => {
    debouncedRefresh();
  });

  context.subscriptions.push(fileWatcher);

  // Also refresh when git operations complete (detected by .git folder changes)
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');

  gitWatcher.onDidChange(() => {
    debouncedRefresh();
  });

  context.subscriptions.push(gitWatcher);

  // Initial refresh
  Logger.log('Triggering initial refresh...');
  gitDiffProvider.refresh();

  Logger.log('========================================');
  Logger.log('Extension activated successfully!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  Logger.log('Extension deactivating...');
  Logger.dispose();
}
