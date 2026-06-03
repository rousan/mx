import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists, isGitRepo } from './fsutil';
import { readJson, writeJson } from './json';
import { git, branchExists, isDirty, resolveBase } from './git';
import {
  workDir,
  workspaceFile,
  repoPath,
  readWork,
  writeWork,
  findWorktree,
  listWorkNames,
} from './runtime';
import type { Work, Worktree } from './types';

/**
 * Minimal shape of a VS Code `.code-workspace` file, as managed by mx.
 */
interface CodeWorkspace {
  /** Folder entries shown in the multi-root workspace. */
  folders: { name?: string; path: string }[];
  /** Workspace settings (left untouched by mx). */
  settings: Record<string, unknown>;
}

/**
 * Add a repo folder to a work's `.code-workspace`, creating the file if needed.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo (folder) to add.
 */
function addFolderToWorkspace(root: string, name: string, repo: string): void {
  const file = workspaceFile(root, name);
  const ws: CodeWorkspace = exists(file) ? readJson(file) : { folders: [], settings: {} };
  ws.folders = ws.folders ?? [];
  if (!ws.folders.some((f) => f.path === repo)) ws.folders.push({ name: repo, path: repo });
  writeJson(file, ws);
}

/**
 * Remove a repo folder from a work's `.code-workspace` if present.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo (folder) to remove.
 */
function removeFolderFromWorkspace(root: string, name: string, repo: string): void {
  const file = workspaceFile(root, name);
  if (!exists(file)) return;
  const ws: CodeWorkspace = readJson(file);
  ws.folders = (ws.folders ?? []).filter((f) => f.path !== repo);
  writeJson(file, ws);
}

/**
 * A new work plus the absolute path of its folder.
 */
export interface WorkNewResult extends Work {
  /** Absolute path to the created work folder. */
  path: string;
}

/**
 * Create a new work: its folder, an empty `work.json`, and an empty
 * `.code-workspace`. The name is immutable thereafter.
 *
 * @param root - Runtime root.
 * @param name - New work name.
 * @param description - Optional free-text description.
 * @returns The new work and its absolute folder path.
 */
export function workNew(root: string, name: string, description = ''): WorkNewResult {
  const dir = workDir(root, name);
  if (exists(dir)) throw new MxError(`work already exists: ${name}`, 'EXISTS');
  fs.mkdirSync(dir, { recursive: true });
  const work: Work = { name, description, worktrees: [] };
  writeWork(root, work);
  writeJson(workspaceFile(root, name), { folders: [], settings: {} });
  return { ...work, path: dir };
}

/**
 * One-line summary of a work for listings.
 */
export interface WorkSummary {
  /** Work name. */
  name: string;
  /** Work description. */
  description: string;
  /** Number of worktrees in the work. */
  worktrees: number;
}

/**
 * Summaries of all works.
 *
 * @param root - Runtime root.
 * @returns One summary per work.
 */
export function listWorksInfo(root: string): WorkSummary[] {
  return listWorkNames(root).map((name) => {
    const w = readWork(root, name);
    return { name, description: w.description ?? '', worktrees: (w.worktrees ?? []).length };
  });
}

/**
 * Read a work's full manifest.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The work manifest.
 */
export function workInfo(root: string, name: string): Work {
  return readWork(root, name);
}

/**
 * Replace a work's description (the name cannot change).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param text - New description.
 * @returns The updated work.
 */
export function workDescribe(root: string, name: string, text: string): Work {
  const work = readWork(root, name);
  work.description = text;
  writeWork(root, work);
  return work;
}

/**
 * A work's name and absolute folder path.
 */
export interface WorkPathResult {
  /** Work name. */
  name: string;
  /** Absolute work folder path. */
  path: string;
}

/**
 * Resolve a work's folder path (for `cd "$(mx work -n <name> path)"`).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The work name and absolute folder path.
 */
export function workPath(root: string, name: string): WorkPathResult {
  const dir = workDir(root, name);
  if (!exists(dir)) throw new MxError(`no such work: ${name}`, 'NO_WORK');
  return { name, path: dir };
}

/**
 * Options for creating a worktree.
 */
export interface WorktreeAddOpts {
  /** New branch to create (defaults to the work name; reused if it exists). */
  branch?: string;
  /** Base ref to fork from (resolved to a SHA, with an `origin/` fallback). */
  base?: string;
}

/**
 * Result of adding a worktree.
 */
export interface WorktreeAddResult {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Branch the worktree is on. */
  branch: string;
  /** Absolute worktree path. */
  path: string;
  /** Initially-empty service-to-port map. */
  ports: Record<string, number>;
}

/**
 * Create a git worktree for a repo inside a work, registering it in `work.json`
 * and the `.code-workspace`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo to create the worktree from.
 * @param opts - Optional new branch name and base ref.
 * @returns The created worktree's details.
 */
export function worktreeAdd(
  root: string,
  name: string,
  repo: string,
  opts: WorktreeAddOpts = {},
): WorktreeAddResult {
  const work = readWork(root, name);
  const rp = repoPath(root, repo);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${repo}`, 'NO_REPO');
  if (findWorktree(work, repo)) {
    throw new MxError(`work "${name}" already has worktree for ${repo}`, 'EXISTS');
  }

  const branch = opts.branch || name;
  const dest = path.join(workDir(root, name), repo);
  if (branchExists(rp, branch)) {
    git(['-C', rp, 'worktree', 'add', dest, branch]);
  } else {
    const args = ['-C', rp, 'worktree', 'add', '-b', branch, dest];
    if (opts.base) {
      // Resolve --base to a commit SHA so git can't DWIM a remote-named local
      // branch and override our -b; the new branch is created exactly as named.
      const sha = resolveBase(rp, opts.base);
      if (!sha) {
        throw new MxError(`base ref not found: ${opts.base} (tried also origin/${opts.base})`, 'NO_REF');
      }
      args.push(sha);
    }
    git(args);
  }

  work.worktrees = work.worktrees ?? [];
  work.worktrees.push({ repo, branch, ports: {} });
  writeWork(root, work);
  addFolderToWorkspace(root, name, repo);
  return { work: name, repo, branch, path: dest, ports: {} };
}

/**
 * List a work's worktrees.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The work's worktrees.
 */
export function worktreeList(root: string, name: string): Worktree[] {
  return readWork(root, name).worktrees ?? [];
}

/**
 * Result of removing a worktree.
 */
export interface WorktreeRemoveResult {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Branch that was kept. */
  branch: string;
  /** Always true on success. */
  removed: boolean;
}

/**
 * Remove a worktree (refusing on uncommitted changes) and deregister it. The
 * underlying feature branch is kept.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo (worktree) to remove.
 * @returns The removed worktree's repo and kept branch.
 */
export function worktreeRemove(root: string, name: string, repo: string): WorktreeRemoveResult {
  const work = readWork(root, name);
  const wt = findWorktree(work, repo);
  if (!wt) throw new MxError(`work "${name}" has no worktree for ${repo}`, 'NO_WORKTREE');
  const dest = path.join(workDir(root, name), repo);
  if (exists(dest) && isDirty(dest)) {
    throw new MxError(`worktree ${repo} has uncommitted changes — commit or discard them first`, 'DIRTY');
  }
  git(['-C', repoPath(root, repo), 'worktree', 'remove', dest]); // keeps the branch
  work.worktrees = work.worktrees.filter((w) => w.repo !== repo);
  writeWork(root, work);
  removeFolderFromWorkspace(root, name, repo);
  return { work: name, repo, branch: wt.branch, removed: true };
}

/**
 * Result of destroying a work.
 */
export interface WorkDestroyResult {
  /** Work name. */
  work: string;
  /** Repos whose worktrees were removed. */
  removedWorktrees: string[];
  /** Always true: branches are intentionally kept. */
  branchesKept: boolean;
}

/**
 * Remove all of a work's worktrees and its folder, refusing if any worktree is
 * dirty. Feature branches are kept.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The removed worktrees and confirmation branches were kept.
 */
export function workDestroy(root: string, name: string): WorkDestroyResult {
  const work = readWork(root, name);
  const dirty: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = path.join(workDir(root, name), wt.repo);
    if (exists(dest) && isDirty(dest)) dirty.push(wt.repo);
  }
  if (dirty.length) {
    throw new MxError(
      `cannot destroy "${name}" — uncommitted changes in: ${dirty.join(', ')}. Commit or discard, then retry.`,
      'DIRTY',
    );
  }
  const removed: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = path.join(workDir(root, name), wt.repo);
    if (exists(dest)) git(['-C', repoPath(root, wt.repo), 'worktree', 'remove', dest]); // keeps branch
    removed.push(wt.repo);
  }
  fs.rmSync(workDir(root, name), { recursive: true, force: true });
  return { work: name, removedWorktrees: removed, branchesKept: true };
}
