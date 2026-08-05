import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as vscode from 'vscode';
import {
  GhStackView,
  GitSpiceBranch,
  StackContext,
  StackParent,
  StackProviderSetting
} from './types';
import { Logger } from './logger';

const execAsync = promisify(exec);

/** Give up on a stacking CLI rather than hanging the branch picker */
const CLI_TIMEOUT_MS = 10000;

/**
 * Resolves the stack the current branch belongs to.
 *
 * Two stacking tools are supported: GitHub stacks (`gh stack`) and git-spice
 * (`gs`). A repository — even a single branch — can be tracked by both, in
 * which case GitHub stacks win: they are what the pull requests on GitHub are
 * actually based on.
 */
export class StackService {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Read an executable path from settings (expands ~ to home directory)
   */
  private getExecutable(setting: string, fallback: string): string {
    const config = vscode.workspace.getConfiguration('gitDiffSidebar');
    let path = config.get<string>(setting, fallback);
    if (path.startsWith('~')) {
      path = path.replace('~', os.homedir());
    }
    return path;
  }

  /**
   * Get the stack the current branch belongs to, or null when it is not
   * stacked (or no stacking tool is installed).
   */
  async getStack(): Promise<StackContext | null> {
    const preference = vscode.workspace
      .getConfiguration('gitDiffSidebar')
      .get<StackProviderSetting>('stackProvider', 'auto');

    if (preference === 'none') {
      Logger.log('[StackService] Stack detection disabled by settings');
      return null;
    }

    const [github, gitSpice] = await Promise.all([
      preference === 'git-spice' ? Promise.resolve(null) : this.getGitHubStack(),
      preference === 'github' ? Promise.resolve(null) : this.getGitSpiceStack()
    ]);

    if (github && gitSpice) {
      Logger.log('[StackService] Branch is tracked by both tools, using GitHub stack');
    }

    // GitHub stacks win — they mirror what GitHub will base the PRs on
    const stack = github ?? gitSpice;
    if (!stack) {
      Logger.log('[StackService] Current branch is not part of a stack');
      return null;
    }

    const chain = stack.parents.map(p => p.name).join(' <- ') || '(no parents)';
    Logger.log(`[StackService] Using ${stack.kind} stack: ${chain}`);
    return stack;
  }

  /**
   * Read the stack from `gh stack view --json`.
   */
  private async getGitHubStack(): Promise<StackContext | null> {
    const ghPath = this.getExecutable('ghExecutable', 'gh');

    let stdout: string;
    try {
      ({ stdout } = await execAsync(`${ghPath} stack view --json`, {
        cwd: this.workspaceRoot,
        timeout: CLI_TIMEOUT_MS
      }));
    } catch (error: unknown) {
      this.logCliFailure('gh stack', ghPath, error);
      return null;
    }

    // Ignore anything printed around the payload — gh can add notices
    // (upgrade prompts, for instance) that would break a strict parse
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');

    let view: GhStackView;
    try {
      if (start === -1 || end < start) throw new Error('no JSON object in output');
      view = JSON.parse(stdout.slice(start, end + 1)) as GhStackView;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      Logger.log(`[StackService] Could not parse \`gh stack view --json\` output: ${reason}`);
      return null;
    }

    const branches = view.branches ?? [];
    const currentIndex = branches.findIndex(b => b.isCurrent === true);

    if (currentIndex === -1) {
      // Standing on the trunk still counts as being in the stack, just with
      // nothing below it. Any other branch is simply not part of the stack.
      if (view.currentBranch && view.currentBranch === view.trunk) {
        return { kind: 'github', parents: [] };
      }
      return null;
    }

    // `branches` runs from the trunk upwards, so everything before the current
    // branch is a parent — reversed to put the closest parent first.
    const parents: StackParent[] = branches
      .slice(0, currentIndex)
      .reverse()
      .map(branch => ({
        name: branch.name,
        kind: 'github' as const,
        isMerged: branch.isMerged === true,
        changeId: branch.pr ? `#${branch.pr.number}` : undefined
      }));

    if (view.trunk) {
      parents.push({ name: view.trunk, kind: 'github', isTrunk: true });
    }

    return { kind: 'github', parents };
  }

  /**
   * Read the stack from `gs ls --json`, walking the `down` chain from the
   * current branch towards the trunk.
   */
  private async getGitSpiceStack(): Promise<StackContext | null> {
    const gsPath = this.getExecutable('gitSpiceExecutable', 'gs');

    let stdout: string;
    try {
      ({ stdout } = await execAsync(`${gsPath} ls --json`, {
        cwd: this.workspaceRoot,
        timeout: CLI_TIMEOUT_MS
      }));
    } catch (error: unknown) {
      this.logCliFailure('git-spice', gsPath, error);
      return null;
    }

    const branches: GitSpiceBranch[] = [];
    for (const line of stdout.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        branches.push(JSON.parse(line) as GitSpiceBranch);
      } catch {
        Logger.log(`[StackService] Skipping unparsable \`gs ls\` line: ${line}`);
      }
    }

    const current = branches.find(b => b.current === true);
    if (!current) {
      return null;
    }

    const byName = new Map(branches.map(b => [b.name, b]));
    const parents: StackParent[] = [];
    const seen = new Set<string>([current.name]);

    let next = current.down?.name;
    while (next && !seen.has(next)) {
      seen.add(next);
      const branch = byName.get(next);
      parents.push({
        name: next,
        kind: 'git-spice',
        // The trunk is the only branch with nothing below it
        isTrunk: branch !== undefined && branch.down === undefined,
        changeId: this.formatChangeId(branch?.change?.id)
      });
      next = branch?.down?.name;
    }

    return { kind: 'git-spice', parents };
  }

  /**
   * Normalize a git-spice change id into a `#1234` reference
   */
  private formatChangeId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    return id.startsWith('#') ? id : `#${id}`;
  }

  /**
   * Log why a stacking CLI could not be used. Failing is the normal case —
   * the branch is usually only stacked in one tool, or in neither.
   */
  private logCliFailure(tool: string, executable: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ENOENT') || message.includes('command not found')) {
      Logger.log(`[StackService] ${tool} not found: ${executable}`);
      return;
    }

    // The tools explain themselves on stderr ("not part of a stack", ...),
    // which is far more useful than the "Command failed" wrapper. The last
    // line is the one that made them stop — earlier ones are progress noise.
    const stderr = (error as { stderr?: unknown }).stderr;
    const reason = typeof stderr === 'string'
      ? stderr.split('\n').map(l => l.trim()).filter(l => l.length > 0).pop()
      : undefined;

    Logger.log(`[StackService] ${tool}: ${reason ?? message.split('\n')[0]}`);
  }
}
