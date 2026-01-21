import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

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
      console.error('Error getting current branch:', error);
      return 'main';
    }
  }

  /**
   * Get files that differ from the base branch (committed changes)
   */
  async getCommittedChanges(baseBranch: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`git diff --name-only ${baseBranch}`, {
        cwd: this.workspaceRoot
      });
      return stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (error) {
      console.error('Error getting committed changes:', error);
      return [];
    }
  }

  /**
   * Get uncommitted changes (staged + unstaged + untracked)
   */
  async getUncommittedChanges(): Promise<string[]> {
    try {
      // Get unstaged changes
      const { stdout: unstaged } = await execAsync('git diff --name-only', {
        cwd: this.workspaceRoot
      });

      // Get staged changes
      const { stdout: staged } = await execAsync('git diff --name-only --cached', {
        cwd: this.workspaceRoot
      });

      // Get untracked files (respects .gitignore)
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

      // Combine and deduplicate
      const allFiles = [...new Set([...stagedFiles, ...unstagedFiles, ...untrackedFiles])];
      return allFiles;
    } catch (error) {
      console.error('Error getting uncommitted changes:', error);
      return [];
    }
  }

  /**
   * Get list of branches from git-spice stack (current branch and all parent branches)
   * Falls back to regular git branches if git-spice is not available
   */
  async getGitSpiceBranches(): Promise<string[]> {
    try {
      const gisPath = `${process.env.HOME}/.alan/bin/gis`;

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
      console.error('Error getting git-spice branches:', error);
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
      console.error('Error getting regular branches:', error);
      return ['main'];
    }
  }

  /**
   * Check if we're in a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', {
        cwd: this.workspaceRoot
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
