import * as vscode from 'vscode';
import * as path from 'path';
import { GitDiffProvider } from './gitDiffProvider';
import { GitService } from './gitService';
import { Logger } from './logger';

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

  // Register open diff view command
  const openDiffCommand = vscode.commands.registerCommand(
    'gitDiff.openDiff',
    async (fileItem: any) => {
      try {
        const fileUri = fileItem.resourceUri;
        const section = fileItem.section;
        const baseBranch = fileItem.baseBranch;
        const filePath = fileUri.fsPath;

        let leftUri: vscode.Uri;
        let title: string;

        if (section === 'all' || section === 'committed') {
          // Show diff from base branch
          leftUri = vscode.Uri.parse(`git:${filePath}?ref=${baseBranch}`);
          title = `${path.basename(filePath)} (${baseBranch} ↔ Working Tree)`;
        } else {
          // Uncommitted: show diff from HEAD (last commit)
          leftUri = vscode.Uri.parse(`git:${filePath}?ref=HEAD`);
          title = `${path.basename(filePath)} (HEAD ↔ Working Tree)`;
        }

        const rightUri = fileUri;

        await vscode.commands.executeCommand(
          'vscode.diff',
          leftUri,
          rightUri,
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

  // Set up file system watcher for auto-refresh
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

  fileWatcher.onDidChange(() => {
    gitDiffProvider.refresh();
  });

  fileWatcher.onDidCreate(() => {
    gitDiffProvider.refresh();
  });

  fileWatcher.onDidDelete(() => {
    gitDiffProvider.refresh();
  });

  context.subscriptions.push(fileWatcher);

  // Also refresh when git operations complete (detected by .git folder changes)
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/**');

  gitWatcher.onDidChange(() => {
    gitDiffProvider.refresh();
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
