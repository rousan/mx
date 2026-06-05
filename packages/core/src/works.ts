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
 * Empty a work's `.code-workspace` folder list (settings preserved). Used by
 * `archiveWork` so the workspace file stays but doesn't reference paths whose
 * worktrees were removed.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 */
function clearWorkspaceFolders(root: string, name: string): void {
  const file = workspaceFile(root, name);
  if (!exists(file)) return;
  const ws: CodeWorkspace = readJson(file);
  ws.folders = [];
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
 * Create a new work: its folder, an empty `work.json`, an empty
 * `.code-workspace`, and an empty `sessions/` directory. The name is
 * immutable thereafter.
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
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
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
  /** True when the work is archived. */
  isArchived: boolean;
  /** ISO-8601 timestamp of when the work was archived; null on active works. */
  archived_at: string | null;
}

/**
 * Options for filtering `listWorksInfo`.
 */
export interface ListWorksOpts {
  /** Include archived works alongside active ones (default: active only). */
  includeArchived?: boolean;
  /** Restrict to archived works only. */
  onlyArchived?: boolean;
}

/**
 * Summaries of works.
 *
 * By default returns only active (non-archived) works. Pass
 * `includeArchived` to include archived ones, or `onlyArchived` to restrict
 * to archived ones.
 *
 * @param root - Runtime root.
 * @param opts - Filter options.
 * @returns One summary per work matching the filter.
 */
export function listWorksInfo(root: string, opts: ListWorksOpts = {}): WorkSummary[] {
  return listWorkNames(root)
    .map((name) => {
      const w = readWork(root, name);
      return {
        name,
        description: w.description ?? '',
        worktrees: (w.worktrees ?? []).length,
        isArchived: w.isArchived === true,
        archived_at: w.archived_at ?? null,
      };
    })
    .filter((s) => {
      if (opts.onlyArchived) return s.isArchived;
      if (opts.includeArchived) return true;
      return !s.isArchived;
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
 * Options for `workDestroy`.
 */
export interface WorkDestroyOpts {
  /**
   * Required gate for destroy. Without it, the call throws `NEED_FORCE` with
   * a message pointing at `archiveWork`. mx ships archive as the recommended
   * soft-delete; destroy is reserved for cases where the user truly wants the
   * work folder gone (incl. `work.json` history and any session summaries).
   */
  force?: boolean;
}

/**
 * Permanently remove a work: delete all of its worktrees and the work folder
 * itself (incl. `work.json`, `.code-workspace`, and `sessions/`). Feature
 * branches are kept.
 *
 * Requires `opts.force` — without it, throws `NEED_FORCE` and hints at
 * `archiveWork`, which is the reversible alternative. Refuses on uncommitted
 * changes in any worktree.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param opts - Must include `force: true`.
 * @returns The removed worktrees and confirmation branches were kept.
 */
export function workDestroy(
  root: string,
  name: string,
  opts: WorkDestroyOpts = {},
): WorkDestroyResult {
  if (!opts.force) {
    throw new MxError(
      `refusing to destroy "${name}" — destroy is permanent and removes the work folder including any session summaries. ` +
        `Use \`mx work archive\` to soft-delete (recoverable via \`mx work unarchive\`), or re-run with \`--force\` if you really want this gone.`,
      'NEED_FORCE',
    );
  }
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

/**
 * Result of archiving a work.
 */
export interface ArchiveResult {
  /** Work name. */
  work: string;
  /** ISO-8601 timestamp the work was marked archived. */
  archived_at: string;
  /** Repos whose worktrees were removed. */
  removedWorktrees: string[];
  /** Always true: branches are intentionally kept. */
  branchesKept: boolean;
}

/**
 * Archive a work: remove all of its worktrees, empty the `.code-workspace`
 * folder list, and flip `isArchived: true` (with `archived_at` set) in
 * `work.json`. The work folder, manifest, sessions, and branches are all
 * retained — `unarchiveWork` re-creates worktrees from `work.json` later.
 *
 * Refuses on uncommitted changes in any worktree, or if the work is already
 * archived.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Archive timestamp and the list of worktrees that were removed.
 */
export function archiveWork(root: string, name: string): ArchiveResult {
  const work = readWork(root, name);
  if (work.isArchived === true) {
    throw new MxError(`work "${name}" is already archived`, 'ALREADY_ARCHIVED');
  }
  const dirty: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = path.join(workDir(root, name), wt.repo);
    if (exists(dest) && isDirty(dest)) dirty.push(wt.repo);
  }
  if (dirty.length) {
    throw new MxError(
      `cannot archive "${name}" — uncommitted changes in: ${dirty.join(', ')}. Commit or discard, then retry.`,
      'DIRTY',
    );
  }
  const removed: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = path.join(workDir(root, name), wt.repo);
    if (exists(dest)) git(['-C', repoPath(root, wt.repo), 'worktree', 'remove', dest]); // keeps branch
    removed.push(wt.repo);
  }
  clearWorkspaceFolders(root, name);
  const archived_at = new Date().toISOString();
  work.isArchived = true;
  work.archived_at = archived_at;
  writeWork(root, work);
  return { work: name, archived_at, removedWorktrees: removed, branchesKept: true };
}

/**
 * One restored worktree's details, returned from `unarchiveWork`.
 */
export interface UnarchiveRestoredWorktree {
  /** Repo name. */
  repo: string;
  /** Branch the worktree is now checked out on (may differ from the recorded one when overridden). */
  branch: string;
  /** Absolute worktree path. */
  path: string;
  /** Ports as recorded in `work.json` (unchanged across archive/unarchive). */
  ports: Record<string, number>;
}

/**
 * Result of unarchiving a work.
 */
export interface UnarchiveResult {
  /** Work name. */
  work: string;
  /** Restored worktree details, one per repo. */
  restored: UnarchiveRestoredWorktree[];
}

/**
 * Unarchive a work: re-create worktrees from the branches recorded in
 * `work.json`, or from explicit overrides when the recorded branches are
 * missing. Repopulates the `.code-workspace` and clears the archive flag.
 *
 * If any desired branch (recorded or overridden) does not exist in its
 * pristine clone, throws `NO_REF` listing exactly which repos lack which
 * branches, with a hint to re-run with overrides. The overrides map
 * `repo -> branch`; on success, the worktree entries in `work.json` are
 * updated to the actually-used branches.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param overrides - Optional `repo -> branch` overrides for any worktree.
 * @returns The restored worktrees.
 */
export function unarchiveWork(
  root: string,
  name: string,
  overrides: Record<string, string> = {},
): UnarchiveResult {
  const work = readWork(root, name);
  if (work.isArchived !== true) {
    throw new MxError(`work "${name}" is not archived`, 'NOT_ARCHIVED');
  }
  const desired = (work.worktrees ?? []).map((wt) => ({
    repo: wt.repo,
    branch: overrides[wt.repo] ?? wt.branch,
    ports: wt.ports ?? {},
  }));

  const missing: { repo: string; branch: string }[] = [];
  for (const d of desired) {
    const rp = repoPath(root, d.repo);
    if (!isGitRepo(rp)) {
      throw new MxError(`pristine clone missing for repo: ${d.repo}`, 'NO_REPO');
    }
    if (!branchExists(rp, d.branch)) missing.push({ repo: d.repo, branch: d.branch });
  }
  if (missing.length) {
    const list = missing.map((m) => `${m.repo}=${m.branch}`).join(', ');
    const overrideHint = missing.map((m) => `${m.repo}=<branch>`).join(' ');
    throw new MxError(
      `cannot unarchive "${name}" — branch(es) not found: ${list}. ` +
        `Re-run with explicit overrides: \`mx work -n ${name} unarchive ${overrideHint}\`.`,
      'NO_REF',
    );
  }

  const restored: UnarchiveRestoredWorktree[] = [];
  for (const d of desired) {
    const dest = path.join(workDir(root, name), d.repo);
    git(['-C', repoPath(root, d.repo), 'worktree', 'add', dest, d.branch]);
    addFolderToWorkspace(root, name, d.repo);
    restored.push({ repo: d.repo, branch: d.branch, path: dest, ports: d.ports });
  }

  work.worktrees = restored.map((r) => ({ repo: r.repo, branch: r.branch, ports: r.ports }));
  work.isArchived = false;
  delete work.archived_at;
  writeWork(root, work);
  return { work: name, restored };
}
