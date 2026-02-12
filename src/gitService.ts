import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
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
   * Run git-spice command and return combined stdout+stderr (git-spice outputs to stderr)
   */
  private async runGitSpice(args: string): Promise<string | null> {
    try {
      const gsPath = this.getGitSpiceExecutable();
      const { stdout, stderr } = await execAsync(`${gsPath} ${args}`, {
        cwd: this.workspaceRoot
      });
      return stdout + stderr;
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
   * Extract branch name from git-spice output line
   * Strips tree chars, PR refs (#123), status markers (needs restack), current marker (◀)
   */
  private extractBranchName(line: string): string | null {
    const cleaned = line
      .replace(/^[\s│├└┏┻━■□─┃]+/, '') // tree chars
      .replace(/\s*◀\s*$/, '')          // current marker
      .replace(/\s*\(#\d+\)/g, '')      // PR refs
      .replace(/\s*\([^)]+\)/g, '')     // status markers
      .trim();
    return cleaned.length > 0 ? cleaned : null;
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
   * Check if currently in a git-spice stack (◀ marker present = current branch tracked)
   */
  async isInGitSpiceStack(): Promise<boolean> {
    const output = await this.runGitSpice('ls');
    return output !== null && output.includes('◀');
  }

  /**
   * Get parent branches in git-spice stack (branches below current toward main)
   */
  async getGitSpiceParentBranches(): Promise<string[]> {
    const output = await this.runGitSpice('ls');
    if (!output) return [];

    const lines = output.split('\n').filter(l => l.length > 0 && !l.startsWith('INF'));
    const parents: string[] = [];
    let foundCurrent = false;

    for (const line of lines) {
      if (line.includes('◀')) {
        foundCurrent = true;
        continue;
      }
      if (foundCurrent) {
        const branch = this.extractBranchName(line);
        if (branch) parents.push(branch);
      }
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
    const output = await this.runGitSpice('ls');
    if (!output) return this.getRegularBranches();

    const lines = output.split('\n').filter(l => l.length > 0 && !l.startsWith('INF'));
    const branches = lines.map(l => this.extractBranchName(l)).filter((b): b is string => b !== null);
    return [...new Set(branches)];
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
