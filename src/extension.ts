import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitDiffProvider } from './gitDiffProvider';
import { GitService } from './gitService';
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

  // Show the output channel
  Logger.show();

  // Check if we have a workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    Logger.log('No workspace folder found');
    vscode.window.showWarningMessage('Git Diff Sidebar: No workspace folder found');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  Logger.log(`Workspace root: ${workspaceRoot}`);
  const gitService = new GitService(workspaceRoot);

  // Create the tree data provider
  Logger.log('Creating tree data provider...');
  const gitDiffProvider = new GitDiffProvider(context);

  // Register the tree data provider
  Logger.log('Registering tree view...');
  const treeView = vscode.window.createTreeView('gitDiffSidebar', {
    treeDataProvider: gitDiffProvider,
    showCollapseAll: true
  });

  context.subscriptions.push(treeView);
  Logger.log('Tree view registered successfully');

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand('gitDiff.refresh', () => {
    gitDiffProvider.refresh();
    vscode.window.showInformationMessage('Git changes refreshed');
  });
  context.subscriptions.push(refreshCommand);

  // Register open file command
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

  // Register a content provider for git file contents
  const gitContentProvider = new (class implements vscode.TextDocumentContentProvider {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
      const params = JSON.parse(uri.query);
      const { relativePath, ref } = params;
      try {
        const { stdout } = await execAsync(`git show ${ref}:${relativePath}`, {
          cwd: workspaceRoot
        });
        return stdout;
      } catch {
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
        const fileUri = fileItem.resourceUri;
        const section = fileItem.section;
        const baseBranch = fileItem.baseBranch;
        const absolutePath = fileUri.fsPath;

        // Get relative path from workspace root
        const relativePath = path.relative(workspaceRoot, absolutePath);

        let ref: string;
        let title: string;

        if (section === 'all' || section === 'committed') {
          ref = baseBranch;
          title = `${path.basename(absolutePath)} (${baseBranch} ↔ Working Tree)`;
        } else {
          ref = 'HEAD';
          title = `${path.basename(absolutePath)} (HEAD ↔ Working Tree)`;
        }

        // Build URI for our custom content provider
        const gitUri = vscode.Uri.from({
          scheme: 'gitdiff',
          path: absolutePath,
          query: JSON.stringify({ relativePath, ref })
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
    async () => {
      try {
        // Get available branches
        const branches = await gitService.getGitSpiceBranches();

        if (branches.length === 0) {
          vscode.window.showWarningMessage('No branches found');
          return;
        }

        // Show quick pick
        const currentBranch = gitDiffProvider.getBaseBranch();
        const selected = await vscode.window.showQuickPick(branches, {
          placeHolder: 'Select base branch to compare against',
          title: 'Select Base Branch',
          canPickMany: false,
          matchOnDescription: true,
          matchOnDetail: true
        });

        if (selected && selected !== currentBranch) {
          await gitDiffProvider.setBaseBranch(selected);
          vscode.window.showInformationMessage(`Base branch changed to: ${selected}`);
        }
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
