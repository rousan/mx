import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { MxError } from './errors';

/**
 * Run a git command and return its trimmed stdout, throwing `MxError` on
 * failure.
 *
 * @param args - Arguments passed to `git` (e.g. `['-C', repo, 'status']`).
 * @param opts - Extra child-process options (e.g. inherited stdio for clone).
 * @returns Trimmed stdout; empty string when stdout was not captured (inherited).
 */
export function git(args: string[], opts: ExecFileSyncOptions = {}): string {
  try {
    const out = execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }) as unknown as string | null;
    // stdout is null when the caller inherits it (e.g. clone progress).
    return (out == null ? '' : String(out)).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const msg = (err.stderr ?? err.stdout ?? err.message ?? '').toString().trim();
    throw new MxError(`git ${args.join(' ')} failed: ${msg}`, 'GIT');
  }
}

/**
 * Run a git command, returning its trimmed stdout on success or `null` on a
 * non-zero exit (never throws).
 *
 * @param args - Arguments passed to `git`.
 * @param opts - Extra child-process options.
 * @returns Trimmed stdout, or null if git exited non-zero.
 */
export function gitQuiet(args: string[], opts: ExecFileSyncOptions = {}): string | null {
  try {
    const out = execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    }) as unknown as string | null;
    return (out == null ? '' : String(out)).trim();
  } catch {
    return null;
  }
}

/**
 * Current checked-out branch of a repo (or `(detached)` when not on a branch).
 *
 * @param repoPath - Path to the git repo or worktree.
 * @returns The short branch name.
 */
export function currentBranch(repoPath: string): string {
  return gitQuiet(['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']) ?? '(detached)';
}

/**
 * Origin remote URL of a repo.
 *
 * @param repoPath - Path to the git repo.
 * @returns The origin URL, or null if none is configured.
 */
export function remoteUrl(repoPath: string): string | null {
  return (
    gitQuiet(['-C', repoPath, 'remote', 'get-url', 'origin']) ??
    gitQuiet(['-C', repoPath, 'config', '--get', 'remote.origin.url']) ??
    null
  );
}

/**
 * Whether a local branch exists in a repo.
 *
 * @param repoPath - Path to the git repo.
 * @param branch - Branch name to test.
 * @returns True if `refs/heads/<branch>` exists.
 */
export function branchExists(repoPath: string, branch: string): boolean {
  return gitQuiet(['-C', repoPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]) !== null;
}

/**
 * Whether a worktree has uncommitted changes.
 *
 * @param worktreePath - Path to the worktree.
 * @returns True if `git status --porcelain` reports any changes.
 */
export function isDirty(worktreePath: string): boolean {
  const s = gitQuiet(['-C', worktreePath, 'status', '--porcelain']);
  return s == null ? false : s.length > 0;
}

/**
 * Branch names available on origin (short, without the `origin/` prefix).
 *
 * @param repoPath - Path to the git repo.
 * @returns Origin branch names, excluding the `origin/HEAD` symref.
 */
export function remoteBranchList(repoPath: string): string[] {
  // Use the full refname so the origin/HEAD symref (whose short form is just
  // "origin") is filtered out cleanly.
  const out = gitQuiet(['-C', repoPath, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin']);
  if (!out) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.endsWith('/HEAD'))
    .map((s) => s.replace(/^refs\/remotes\/origin\//, ''));
}

/**
 * Resolve a `--base` ref to a commit SHA, trying the ref as given and then
 * `origin/<ref>`.
 *
 * Resolving to a SHA before `git worktree add -b` prevents git from DWIM-ing a
 * local branch named after a remote-only ref (which would silently override the
 * requested new branch name). The `origin/` fallback lets a bare branch name
 * work in a fresh clone where it only exists as a remote-tracking ref.
 *
 * @param repoPath - Path to the git repo.
 * @param base - The base ref (local branch, remote ref, short remote name, tag, or SHA).
 * @returns The resolved commit SHA, or null if neither form resolves.
 */
export function resolveBase(repoPath: string, base: string): string | null {
  return (
    gitQuiet(['-C', repoPath, 'rev-parse', '--verify', `${base}^{commit}`]) ??
    gitQuiet(['-C', repoPath, 'rev-parse', '--verify', `origin/${base}^{commit}`]) ??
    null
  );
}
