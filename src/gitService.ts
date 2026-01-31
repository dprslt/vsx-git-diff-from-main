import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { Logger } from './logger';

const execAsync = promisify(exec);

/**
 * Service for executing git commands
 */
export class GitService {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get the current git branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.workspaceRoot
      });
      return stdout.trim();
    } catch (error) {
      Logger.error('Error getting current branch:', error);
      return 'main';
    }
  }

  /**
   * Get files that differ from the base branch (committed changes only)
   */
  async getCommittedChanges(baseBranch: string): Promise<string[]> {
    try {
      // Compare base branch to HEAD (not working tree) to exclude uncommitted changes
      const command = `git diff --name-only ${baseBranch} HEAD`;
      Logger.log(`[GitService] Running: ${command}`);
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspaceRoot
      });
      if (stderr) {
        Logger.log(`[GitService] stderr: ${stderr}`);
      }
      const files = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      Logger.log(`[GitService] Found ${files.length} committed changes`);
      return files;
    } catch (error) {
      Logger.error('[GitService] Error getting committed changes', error);
      return [];
    }
  }

  /**
   * Get uncommitted changes (staged + unstaged + untracked)
   */
  async getUncommittedChanges(): Promise<string[]> {
    try {
      Logger.log('[GitService] Getting uncommitted changes...');

      // Get unstaged changes
      Logger.log('[GitService] Running: git diff --name-only');
      const { stdout: unstaged } = await execAsync('git diff --name-only', {
        cwd: this.workspaceRoot
      });

      // Get staged changes
      Logger.log('[GitService] Running: git diff --name-only --cached');
      const { stdout: staged } = await execAsync('git diff --name-only --cached', {
        cwd: this.workspaceRoot
      });

      // Get untracked files (respects .gitignore)
      Logger.log('[GitService] Running: git ls-files --others --exclude-standard');
      const { stdout: untracked } = await execAsync('git ls-files --others --exclude-standard', {
        cwd: this.workspaceRoot
      });

      const unstagedFiles = unstaged
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const stagedFiles = staged
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const untrackedFiles = untracked
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      Logger.log(`[GitService] Unstaged: ${unstagedFiles.length}, Staged: ${stagedFiles.length}, Untracked: ${untrackedFiles.length}`);

      // Combine and deduplicate
      const allFiles = [...new Set([...stagedFiles, ...unstagedFiles, ...untrackedFiles])];
      Logger.log(`[GitService] Total uncommitted changes: ${allFiles.length}`);
      return allFiles;
    } catch (error) {
      Logger.error('[GitService] Error getting uncommitted changes', error);
      return [];
    }
  }

  /**
   * Get list of branches from git-spice stack (current branch and all parent branches)
   * Falls back to regular git branches if git-spice is not available
   */
  async getGitSpiceBranches(): Promise<string[]> {
    try {
      const gisPath = 'gs';

      // Get the current branch's stack (upstack and downstack)
      const { stdout } = await execAsync(`${gisPath} stack`, {
        cwd: this.workspaceRoot
      });

      // Parse the git-spice stack output
      // Example output format:
      // main
      //   feature-1
      //     feature-2 (current)
      //       feature-3
      const branches = stdout
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
          // Remove tree characters (│, ├, └, ─, spaces) and annotations like (current)
          const cleaned = line
            .replace(/^[│├└─\s]+/, '')  // Remove tree characters
            .replace(/\s*\(current\)\s*$/, '')  // Remove (current) marker
            .trim();
          return cleaned;
        })
        .filter(branch => branch.length > 0);

      // Deduplicate branches
      return [...new Set(branches)];
    } catch (error) {
      Logger.error('Error getting git-spice branches:', error);
      // Fallback to regular git branches
      return this.getRegularBranches();
    }
  }

  /**
   * Get list of regular git branches
   */
  private async getRegularBranches(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch --format="%(refname:short)"', {
        cwd: this.workspaceRoot
      });

      const branches = stdout
        .split('\n')
        .map(line => line.trim().replace(/^"|"$/g, ''))
        .filter(line => line.length > 0);

      return branches;
    } catch (error) {
      Logger.error('Error getting regular branches:', error);
      return ['main'];
    }
  }

  /**
   * Check if we're in a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      Logger.log(`[GitService] Checking if ${this.workspaceRoot} is a git repository...`);
      await execAsync('git rev-parse --git-dir', {
        cwd: this.workspaceRoot
      });
      Logger.log('[GitService] Confirmed: is a git repository');
      return true;
    } catch (error) {
      Logger.log('[GitService] Not a git repository');
      return false;
    }
  }
}
