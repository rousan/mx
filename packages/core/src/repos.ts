import * as fs from 'node:fs';
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
 * fast-forward the checked-out branch.
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
