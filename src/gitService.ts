import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as vscode from 'vscode';
import { GitSpiceBranch } from './types';
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
   * Get git-spice executable path from settings (expands ~ to home directory)
   */
  private getGitSpiceExecutable(): string {
    const config = vscode.workspace.getConfiguration('gitDiffSidebar');
    let path = config.get<string>('gitSpiceExecutable', 'gs');
    if (path.startsWith('~')) {
      path = path.replace('~', os.homedir());
    }
    return path;
  }

  /**
   * Run `gs ls --json` and parse output into typed branch objects.
   * Returns null if git-spice is not available.
   */
  private async getGitSpiceStack(): Promise<GitSpiceBranch[] | null> {
    try {
      const gsPath = this.getGitSpiceExecutable();
      const { stdout } = await execAsync(`${gsPath} ls --json`, {
        cwd: this.workspaceRoot
      });
      return stdout
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as GitSpiceBranch);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('ENOENT') || errorMsg.includes('command not found')) {
        Logger.log(`[GitService] git-spice not found: ${this.getGitSpiceExecutable()}`);
      } else {
        Logger.log(`[GitService] git-spice error: ${errorMsg}`);
      }
      return null;
    }
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
      const { stdout } = await execAsync(`git diff --name-only ${baseBranch}...HEAD`, {
        cwd: this.workspaceRoot
      });
      return stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
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
      const [unstaged, staged, untracked] = await Promise.all([
        execAsync('git diff --name-only', { cwd: this.workspaceRoot }),
        execAsync('git diff --name-only --cached', { cwd: this.workspaceRoot }),
        execAsync('git ls-files --others --exclude-standard', { cwd: this.workspaceRoot })
      ]);

      const parse = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      return [...new Set([...parse(staged.stdout), ...parse(unstaged.stdout), ...parse(untracked.stdout)])];
    } catch (error) {
      Logger.error('[GitService] Error getting uncommitted changes', error);
      return [];
    }
  }

  /**
   * Check if currently in a git-spice stack (current branch is tracked)
   */
  async isInGitSpiceStack(): Promise<boolean> {
    const branches = await this.getGitSpiceStack();
    return branches !== null && branches.some(b => b.current === true);
  }

  /**
   * Get parent branches in git-spice stack (branches below current toward main).
   * Walks the `down` chain from the current branch.
   */
  async getGitSpiceParentBranches(): Promise<string[]> {
    const branches = await this.getGitSpiceStack();
    if (!branches) return [];

    const byName = new Map(branches.map(b => [b.name, b]));
    const current = branches.find(b => b.current === true);
    if (!current) return [];

    const parents: string[] = [];
    let next = current.down?.name;
    while (next) {
      parents.push(next);
      next = byName.get(next)?.down?.name;
    }

    Logger.log(`[GitService] Parent branches: ${parents.join(', ') || '(none)'}`);
    return parents;
  }

  /**
   * Get recent branches sorted by commit date
   */
  async getRecentBranches(limit: number): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `git branch --sort=-committerdate --format="%(refname:short)"`,
        { cwd: this.workspaceRoot }
      );
      return stdout.split('\n').map(l => l.trim().replace(/^"|"$/g, '')).filter(l => l.length > 0).slice(0, limit);
    } catch (error) {
      Logger.error('Error getting recent branches:', error);
      return ['main'];
    }
  }

  /**
   * Filter branches by query pattern
   */
  async filterBranches(query: string, limit: number): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `git branch --list "*${query}*" --sort=-committerdate --format="%(refname:short)"`,
        { cwd: this.workspaceRoot }
      );
      return stdout.split('\n').map(l => l.trim().replace(/^"|"$/g, '')).filter(l => l.length > 0).slice(0, limit);
    } catch (error) {
      Logger.error('Error filtering branches:', error);
      return [];
    }
  }

  /**
   * Get list of branches from git-spice stack
   * Falls back to regular git branches if git-spice is not available
   */
  async getGitSpiceBranches(): Promise<string[]> {
    const branches = await this.getGitSpiceStack();
    if (!branches) return this.getRegularBranches();
    return branches.map(b => b.name);
  }

  /**
   * Get list of regular git branches
   */
  private async getRegularBranches(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch --format="%(refname:short)"', {
        cwd: this.workspaceRoot
      });
      return stdout.split('\n').map(l => l.trim().replace(/^"|"$/g, '')).filter(l => l.length > 0);
    } catch (error) {
      Logger.error('Error getting regular branches:', error);
      return ['main'];
    }
  }

  /**
   * Get the merge-base (common ancestor) between a branch and HEAD
   */
  async getMergeBase(baseBranch: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git merge-base ${baseBranch} HEAD`, {
        cwd: this.workspaceRoot
      });
      return stdout.trim();
    } catch (error) {
      Logger.error('[GitService] Error getting merge-base', error);
      return baseBranch;
    }
  }

  /**
   * Check if we're in a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.workspaceRoot });
      return true;
    } catch {
      return false;
    }
  }
}
