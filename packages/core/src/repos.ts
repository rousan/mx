import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists, isGitRepo } from './fsutil';
import { git, gitQuiet, currentBranch, remoteUrl, remoteBranchList } from './git';
import { repoPath, listRepoNames, listWorkNames, readWork, findWorktree } from './runtime';
import type { RepoSummary } from './types';

/**
 * Derive a repo directory name from a clone URL (strips path and `.git`).
 *
 * @param url - Git clone URL or path.
 * @returns The inferred repo name.
 */
export function repoNameFromUrl(url: string): string {
  const base = url.split('/').pop() || url;
  return base.replace(/\.git$/, '');
}

/**
 * Result of cloning a pristine repo into the runtime.
 */
export interface RepoAddResult {
  /** Repo name. */
  name: string;
  /** Absolute clone path. */
  path: string;
  /** Origin remote URL, or null. */
  remote: string | null;
  /** Checked-out branch after clone. */
  branch: string;
}

/**
 * Clone a repo into `repos/`. The only operation that clones.
 *
 * @param root - Runtime root.
 * @param url - Git clone URL.
 * @param name0 - Optional explicit name; derived from the URL when omitted.
 * @returns The cloned repo's name, path, remote, and branch.
 */
export function repoAdd(root: string, url: string, name0?: string): RepoAddResult {
  const name = name0 || repoNameFromUrl(url);
  const dest = repoPath(root, name);
  if (exists(dest)) throw new MxError(`repo already exists: ${name}`, 'EXISTS');
  git(['clone', url, dest], { stdio: ['ignore', 'inherit', 'inherit'] });
  return { name, path: dest, remote: remoteUrl(dest), branch: currentBranch(dest) };
}

/**
 * Summaries of all pristine clones.
 *
 * @param root - Runtime root.
 * @returns One summary per repo.
 */
export function listReposInfo(root: string): RepoSummary[] {
  return listRepoNames(root).map((name) => ({
    name,
    path: repoPath(root, name),
    branch: currentBranch(repoPath(root, name)),
    remote: remoteUrl(repoPath(root, name)),
  }));
}

/**
 * Result of fetching a repo.
 */
export interface RepoFetchResult {
  /** Repo name. */
  name: string;
  /** Branch after the optional fast-forward. */
  branch: string;
  /** Branch names available on origin. */
  remoteBranches: string[];
}

/**
 * Fetch all branches/tags from origin, prune deleted ones, and best-effort
 * fast-forward the pristine clone's **currently checked-out branch** to its
 * upstream.
 *
 * Only the current branch is fast-forwarded — not the base/default branch, nor
 * any other local branch — and only when it's a clean fast-forward with an
 * upstream, so divergent or upstream-less branches are left untouched (no
 * working-tree churn).
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns The repo's branch and the list of branches now on origin.
 */
export function repoFetch(root: string, name: string): RepoFetchResult {
  const rp = repoPath(root, name);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${name}`, 'NO_REPO');
  // Update every branch's remote-tracking ref, pull in new branches and tags,
  // and prune ones deleted on origin.
  git(['-C', rp, 'fetch', '--all', '--prune', '--tags']);
  // Best-effort fast-forward of the checked-out branch (no working-tree churn).
  gitQuiet(['-C', rp, 'merge', '--ff-only', '@{u}']);
  return { name, branch: currentBranch(rp), remoteBranches: remoteBranchList(rp) };
}

/**
 * Detailed info about a single pristine repo.
 */
export interface RepoInfoResult {
  /** Repo name. */
  name: string;
  /** Absolute clone path. */
  path: string;
  /** Current branch. */
  branch: string;
  /** Origin remote URL, or null. */
  remote: string | null;
  /** Works that hold a worktree of this repo. */
  worktreesInWorks: string[];
}

/**
 * Inspect a pristine repo, including which works hold a worktree of it.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns The repo's details.
 */
export function repoInfo(root: string, name: string): RepoInfoResult {
  const rp = repoPath(root, name);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${name}`, 'NO_REPO');
  const usedBy = listWorkNames(root).filter((w) => findWorktree(readWork(root, w), name));
  return {
    name,
    path: rp,
    branch: currentBranch(rp),
    remote: remoteUrl(rp),
    worktreesInWorks: usedBy,
  };
}

/**
 * Health snapshot of a single pristine clone — purely local checks, no
 * network. Surfaces drift from the expected "checked-out on the default
 * branch, clean working tree, in sync with origin" state.
 */
export interface RepoHealth {
  /** Repo name. */
  name: string;
  /** Absolute clone path. */
  path: string;
  /** Origin's default branch (`origin/HEAD` target), or null if not set. */
  defaultBranch: string | null;
  /** Currently checked-out branch, or null when HEAD is detached. */
  currentBranch: string | null;
  /** True when `currentBranch` matches `defaultBranch`. */
  isOnDefault: boolean;
  /** Count of staged + unstaged changes (excluding untracked). */
  uncommittedChanges: number;
  /** Count of untracked files (status `??`). */
  untrackedFiles: number;
  /** Commits this clone has that origin/<currentBranch> doesn't (null when no upstream). */
  aheadOfOrigin: number | null;
  /** Commits origin/<currentBranch> has that this clone doesn't (null when no upstream). */
  behindOfOrigin: number | null;
  /** ISO-8601 timestamp of the last fetch, from `.git/FETCH_HEAD` mtime; null if never fetched. */
  lastFetchedAt: string | null;
  /** Works that currently hold a worktree of this repo. */
  worktreesInWorks: string[];
  /** True when no health checks flagged an issue. */
  healthy: boolean;
  /** Human-readable description of each issue; empty when `healthy`. */
  issues: string[];
}

/**
 * Best-effort read of origin's default branch via the local `origin/HEAD`
 * symbolic ref, which `git clone` sets at clone time. No network required.
 *
 * @param rp - Pristine clone path.
 * @returns Default branch name, or null when origin/HEAD isn't a symbolic ref.
 */
function originDefaultBranch(rp: string): string | null {
  const out = gitQuiet(['-C', rp, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (!out) return null;
  // Output is "origin/main"; strip the leading "origin/".
  const m = out.match(/^origin\/(.+)$/);
  return m ? m[1] : null;
}

/**
 * Current branch, or null when HEAD is detached.
 *
 * @param rp - Pristine clone path.
 * @returns Branch name, or null when detached.
 */
function currentBranchOrNull(rp: string): string | null {
  const out = gitQuiet(['-C', rp, 'symbolic-ref', '--short', '-q', 'HEAD']);
  return out || null;
}

/**
 * Counts of staged+unstaged changes and untracked files, from a single
 * `git status --porcelain` call.
 *
 * @param rp - Pristine clone path.
 * @returns Tuple `[uncommitted, untracked]`.
 */
function statusCounts(rp: string): [number, number] {
  const out = gitQuiet(['-C', rp, 'status', '--porcelain']);
  if (!out) return [0, 0];
  let uncommitted = 0;
  let untracked = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('??')) untracked++;
    else if (line.length > 0) uncommitted++;
  }
  return [uncommitted, untracked];
}

/**
 * Commits ahead / behind origin/<branch>. Returns `[null, null]` when no
 * upstream tracking branch exists.
 *
 * @param rp - Pristine clone path.
 * @param branch - Branch to compare; null if HEAD is detached.
 * @returns Tuple `[ahead, behind]`, each null if no upstream.
 */
function aheadBehind(rp: string, branch: string | null): [number | null, number | null] {
  if (!branch) return [null, null];
  const upstream = `refs/remotes/origin/${branch}`;
  // No upstream → can't compare.
  const upstreamExists = gitQuiet(['-C', rp, 'rev-parse', '--verify', upstream]);
  if (!upstreamExists) return [null, null];
  // `--left-right --count A...B` prints "<left>\t<right>": left = commits in A
  // not in B (ahead, since HEAD is on the left); right = commits in B not in A (behind).
  const out = gitQuiet(['-C', rp, 'rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
  if (!out) return [null, null];
  const [aheadStr, behindStr] = out.split(/\s+/);
  return [Number(aheadStr), Number(behindStr)];
}

/**
 * Last-fetch timestamp from `.git/FETCH_HEAD` mtime, or null if the file
 * doesn't exist (no fetch has happened since clone).
 *
 * @param rp - Pristine clone path.
 * @returns ISO-8601 timestamp, or null.
 */
function lastFetched(rp: string): string | null {
  const fh = path.join(rp, '.git', 'FETCH_HEAD');
  if (!exists(fh)) return null;
  return fs.statSync(fh).mtime.toISOString();
}

/**
 * Compute a `RepoHealth` snapshot for a single pristine clone.
 *
 * Purely local — no network. The "behind origin" check compares against the
 * last-fetched state; run `mx repo fetch` first if you want fresh numbers.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns The health snapshot.
 */
export function repoHealth(root: string, name: string): RepoHealth {
  const rp = repoPath(root, name);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${name}`, 'NO_REPO');

  const defaultBranch = originDefaultBranch(rp);
  const current = currentBranchOrNull(rp);
  const isOnDefault = current !== null && defaultBranch !== null && current === defaultBranch;
  const [uncommittedChanges, untrackedFiles] = statusCounts(rp);
  const [aheadOfOrigin, behindOfOrigin] = aheadBehind(rp, current);
  const lastFetchedAt = lastFetched(rp);
  const worktreesInWorks = listWorkNames(root).filter((w) =>
    findWorktree(readWork(root, w), name),
  );

  const issues: string[] = [];
  if (current === null) {
    issues.push('HEAD is detached');
  } else if (defaultBranch && !isOnDefault) {
    issues.push(`on ${current} (default: ${defaultBranch})`);
  }
  if (uncommittedChanges > 0) {
    issues.push(
      `${uncommittedChanges} uncommitted change${uncommittedChanges === 1 ? '' : 's'}`,
    );
  }
  if (untrackedFiles > 0) {
    issues.push(`${untrackedFiles} untracked file${untrackedFiles === 1 ? '' : 's'}`);
  }
  if (behindOfOrigin !== null && behindOfOrigin > 0) {
    issues.push(`${behindOfOrigin} commit${behindOfOrigin === 1 ? '' : 's'} behind origin/${current}`);
  }
  if (aheadOfOrigin !== null && aheadOfOrigin > 0) {
    issues.push(`${aheadOfOrigin} commit${aheadOfOrigin === 1 ? '' : 's'} ahead of origin/${current}`);
  }

  return {
    name,
    path: rp,
    defaultBranch,
    currentBranch: current,
    isOnDefault,
    uncommittedChanges,
    untrackedFiles,
    aheadOfOrigin,
    behindOfOrigin,
    lastFetchedAt,
    worktreesInWorks,
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Compute a `RepoHealth` snapshot for every pristine clone in the runtime.
 *
 * @param root - Runtime root.
 * @returns One health snapshot per repo, sorted by name.
 */
export function listRepoHealth(root: string): RepoHealth[] {
  return listRepoNames(root).map((name) => repoHealth(root, name));
}

/**
 * Result of removing a pristine repo.
 */
export interface RepoRemoveResult {
  /** Repo name. */
  name: string;
  /** Always true on success. */
  removed: boolean;
}

/**
 * Remove a pristine clone, refusing if any work still has a worktree of it.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns The removed repo name.
 */
export function repoRemove(root: string, name: string): RepoRemoveResult {
  const rp = repoPath(root, name);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${name}`, 'NO_REPO');
  const usedBy = listWorkNames(root).filter((w) => findWorktree(readWork(root, w), name));
  if (usedBy.length) {
    throw new MxError(
      `repo "${name}" still has worktrees in: ${usedBy.join(', ')} — remove those first`,
      'IN_USE',
    );
  }
  fs.rmSync(rp, { recursive: true, force: true });
  return { name, removed: true };
}
