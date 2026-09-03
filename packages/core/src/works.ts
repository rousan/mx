import * as fs from 'node:fs';
import { MxError } from './errors';
import { exists, isGitRepo } from './fsutil';
import { readJson, writeJson } from './json';
import { git, branchExists, isDirty, resolveBase, currentBranch } from './git';
import {
  workDir,
  workspaceFile,
  worktreesDir,
  worktreePath,
  repoGitDir,
  readWork,
  writeWork,
  findWorktreeByName,
  worktreeName,
  listWorkNames,
  ensureWorkScaffolding,
  countSessions,
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
 * Add a worktree folder to a work's `.code-workspace`, creating the file if
 * needed. Keyed by worktree name (the `wt/<name>` segment), so multiple
 * worktrees of the same repo get distinct entries.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param wtName - Worktree name (folder under `wt/`) to add.
 */
function addFolderToWorkspace(root: string, name: string, wtName: string): void {
  const file = workspaceFile(root, name);
  const ws: CodeWorkspace = exists(file) ? readJson(file) : { folders: [], settings: {} };
  ws.folders = ws.folders ?? [];
  const rel = `wt/${wtName}`; // worktrees live under the work's wt/ folder
  if (!ws.folders.some((f) => f.path === rel)) ws.folders.push({ name: wtName, path: rel });
  writeJson(file, ws);
}

/**
 * Remove a worktree folder from a work's `.code-workspace` if present.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param wtName - Worktree name (folder under `wt/`) to remove.
 */
function removeFolderFromWorkspace(root: string, name: string, wtName: string): void {
  const file = workspaceFile(root, name);
  if (!exists(file)) return;
  const ws: CodeWorkspace = readJson(file);
  ws.folders = (ws.folders ?? []).filter((f) => f.path !== `wt/${wtName}`);
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
 * @param agentManaged - When true, mark the work as agent-created (sets
 *   `isAgentManaged: true` in `work.json`). Left unset for user works, mirroring
 *   how `isArchived` is only present when true.
 * @returns The new work and its absolute folder path.
 */
export function workNew(
  root: string,
  name: string,
  description = '',
  agentManaged = false,
): WorkNewResult {
  const dir = workDir(root, name);
  if (exists(dir)) throw new MxError(`work already exists: ${name}`, 'EXISTS');
  fs.mkdirSync(dir, { recursive: true });
  const work: Work = { name, description, worktrees: [] };
  // Only stamp the flag when true, so user works keep a clean manifest.
  if (agentManaged) work.isAgentManaged = true;
  writeWork(root, work);
  writeJson(workspaceFile(root, name), { folders: [], settings: {} });
  ensureWorkScaffolding(root, name);
  return { ...work, path: dir };
}

/**
 * A work as surfaced by listings: the full manifest plus a count of session
 * summaries on disk. Same shape used by `mx info`'s works section
 * (re-exported there as `StatusWork`).
 *
 * Note (1.6.0+): `worktrees` is now the full array of `Worktree` records
 * (previously a count). Consumers wanting the count should use
 * `worktrees.length`.
 */
export type WorkSummary = Work & {
  /** Absolute path to the work folder under `works/`. */
  path: string;
  /** Number of `.md` files in `<work>/sessions/`. */
  sessions: number;
};

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
 * Listings of works with full per-work detail (manifest + session count).
 *
 * By default returns only active (non-archived) works. Pass
 * `includeArchived` to include archived ones, or `onlyArchived` to restrict
 * to archived ones.
 *
 * @param root - Runtime root.
 * @param opts - Filter options.
 * @returns One entry per work matching the filter.
 */
export function listWorksInfo(root: string, opts: ListWorksOpts = {}): WorkSummary[] {
  return listWorkNames(root)
    .map((name) => ({
      ...readWork(root, name),
      path: workDir(root, name),
      sessions: countSessions(root, name),
    }))
    .filter((w) => {
      if (opts.onlyArchived) return w.isArchived === true;
      if (opts.includeArchived) return true;
      return w.isArchived !== true;
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
 * Set (or clear) a work's `isAgentManaged` flag after creation — the fix for when
 * an agent forgot `mx work new --agent-managed`, or to reclassify a work either
 * way. Mirrors the creation-time semantics: the flag is stored only when true, so
 * clearing it removes the key entirely (a clean user-work manifest).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param value - True to mark as agent-created, false to clear the flag.
 * @returns The updated work.
 */
export function workSetAgentManaged(root: string, name: string, value: boolean): Work {
  const work = readWork(root, name);
  if (value) work.isAgentManaged = true;
  else delete work.isAgentManaged;
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
 * A repo to create an initial worktree for at `mx work new` time, with optional
 * per-repo branch and base overrides.
 */
export interface InitWorktreeSpec {
  /** Pristine repo name to fork the worktree from. */
  repo: string;
  /** Explicit branch for this worktree, or undefined to fall back to the caller's default. */
  branch?: string;
  /** Explicit base ref (fork point) for this worktree, or undefined to fall back to the caller's default. */
  base?: string;
}

/**
 * Parse an initial-worktree token from
 * `mx work new <name> <repo>[:<branch>[:<base>]]...`. Colon-separated, up to
 * three segments — git refs can't contain `:`, so the split is unambiguous:
 *
 * - `app` → `{repo}` (caller supplies the default branch + base)
 * - `app:hotfix` → `{repo, branch}`
 * - `app:hotfix:main` → `{repo, branch, base}`
 * - `app::develop` → `{repo, base}` (empty middle = default branch, custom base)
 *
 * Empty `branch`/`base` segments fall back to the caller's defaults; only the
 * `repo` segment is required.
 *
 * @param token - One positional token, `<repo>[:<branch>[:<base>]]`.
 * @returns The parsed repo with optional branch and base.
 */
export function parseInitWorktreeSpec(token: string): InitWorktreeSpec {
  const parts = token.split(':');
  const [repo, branch, base] = parts;
  if (!repo || parts.length > 3) {
    throw new MxError(
      `bad repo spec: ${JSON.stringify(token)} — expected <repo>[:<branch>[:<base>]]`,
      'BAD_ARGS',
    );
  }
  const spec: InitWorktreeSpec = { repo };
  if (branch) spec.branch = branch; // empty (e.g. "app::main") means "use the default branch"
  if (base) spec.base = base;
  return spec;
}

/**
 * Options for creating a worktree.
 */
export interface WorktreeAddOpts {
  /**
   * Worktree name within the work — its `wt/<name>` directory and selector.
   * Defaults to the repo name. Pass a distinct name to add a **second worktree
   * of the same repo** to one work.
   */
  name?: string;
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
  /** Worktree name (the `wt/<name>` selector; equals `repo` unless overridden). */
  name: string;
  /** Branch the worktree is on. */
  branch: string;
  /** Absolute worktree path. */
  path: string;
  /** Initially-empty service-to-port map. */
  ports: Record<string, number>;
}

/**
 * Create a git worktree for a repo inside a work, registering it in `work.json`
 * and the `.code-workspace`. The worktree's directory/selector is `opts.name`
 * (default: the repo name); pass a distinct name to hold multiple worktrees of
 * the same repo in one work.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo to create the worktree from.
 * @param opts - Optional worktree name, new branch name, and base ref.
 * @returns The created worktree's details.
 */
export function worktreeAdd(
  root: string,
  name: string,
  repo: string,
  opts: WorktreeAddOpts = {},
): WorktreeAddResult {
  const work = readWork(root, name);
  const rp = repoGitDir(root, repo);
  if (!isGitRepo(rp)) throw new MxError(`no such repo: ${repo}`, 'NO_REPO');

  const wtName = opts.name ?? repo;
  if (wtName.includes('/') || wtName.includes('\\') || wtName === '.' || wtName === '..') {
    throw new MxError(`invalid worktree name: ${JSON.stringify(wtName)}`, 'BAD_ARGS');
  }
  if (findWorktreeByName(work, wtName)) {
    throw new MxError(
      wtName === repo
        ? `work "${name}" already has a worktree named "${wtName}" — give the new one a name: \`mx work -n ${name} worktree add ${repo} <name>\``
        : `work "${name}" already has a worktree named "${wtName}"`,
      'EXISTS',
    );
  }

  const branch = opts.branch || name;
  const dest = worktreePath(root, name, wtName);
  fs.mkdirSync(worktreesDir(root, name), { recursive: true }); // ensure wt/ exists
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
  // Always record `name` (= repo when not overridden) so every work.json
  // worktree has the same shape, new or migrated.
  work.worktrees.push({ repo, name: wtName, branch, ports: {} });
  writeWork(root, work);
  addFolderToWorkspace(root, name, wtName);
  return { work: name, repo, name: wtName, branch, path: dest, ports: {} };
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
  /** Worktree name that was removed. */
  name: string;
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
 * @param wtName - Worktree name (selector) to remove (defaults to the repo name).
 * @returns The removed worktree's repo/name and kept branch.
 */
export function worktreeRemove(root: string, name: string, wtName: string): WorktreeRemoveResult {
  const work = readWork(root, name);
  const wt = findWorktreeByName(work, wtName);
  if (!wt) throw new MxError(`work "${name}" has no worktree named "${wtName}"`, 'NO_WORKTREE');
  const dest = worktreePath(root, name, wtName);
  if (exists(dest) && isDirty(dest)) {
    throw new MxError(`worktree "${wtName}" has uncommitted changes — commit or discard them first`, 'DIRTY');
  }
  git(['-C', repoGitDir(root, wt.repo), 'worktree', 'remove', dest]); // keeps the branch
  work.worktrees = work.worktrees.filter((w) => worktreeName(w) !== wtName);
  writeWork(root, work);
  removeFolderFromWorkspace(root, name, wtName);
  return { work: name, repo: wt.repo, name: wtName, branch: wt.branch, removed: true };
}

/**
 * Result of re-recording a worktree's branch in `work.json`.
 */
export interface WorktreeSetBranchResult {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Worktree name (the `wt/<name>` selector). */
  name: string;
  /** Branch now recorded in `work.json` — the worktree's live checked-out branch. */
  branch: string;
  /** Branch that was recorded before this call. */
  previous: string;
  /** Whether the recorded branch actually changed. */
  changed: boolean;
}

/**
 * Re-point a worktree's recorded branch in `work.json` to the branch the
 * worktree is *actually* checked out on. mx never runs the checkout itself: the
 * user switches branches with plain `git` inside the worktree, then calls this
 * to keep the manifest truthful. Only `work.json` metadata is mutated — no git
 * worktree/checkout operation is performed.
 *
 * The recorded branch is always taken from the worktree's live git state (never
 * from the argument), so the manifest can't drift from reality. When `expected`
 * is provided it acts purely as a guard: it must equal the worktree's current
 * branch or `BRANCH_MISMATCH` is thrown — catching the "I meant to check out X
 * but forgot" case before a stale value is written.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param wtName - Worktree name (selector) whose branch to re-record.
 * @param expected - Optional branch the caller believes the worktree is on; when given, must match the live branch.
 * @returns The updated worktree's branch, the previous one, and whether it changed.
 */
export function worktreeSetBranch(
  root: string,
  name: string,
  wtName: string,
  expected?: string,
): WorktreeSetBranchResult {
  const work = readWork(root, name);
  const wt = findWorktreeByName(work, wtName);
  if (!wt) throw new MxError(`work "${name}" has no worktree named "${wtName}"`, 'NO_WORKTREE');
  const dest = worktreePath(root, name, wtName);
  if (!exists(dest)) {
    // No worktree on disk (e.g. the work is archived) means there's no live
    // branch to read — refuse rather than trust an unverifiable argument.
    throw new MxError(
      `worktree "${wtName}" is not on disk${work.isArchived ? ` ("${name}" is archived)` : ''} — nothing to read a branch from`,
      'NO_WORKTREE',
    );
  }
  // The manifest must mirror reality: read the branch the worktree is truly on
  // rather than trusting the argument, so work.json can never drift from git.
  const actual = currentBranch(dest);
  // `git rev-parse --abbrev-ref HEAD` prints the literal "HEAD" on a detached
  // checkout (git forbids a real branch named HEAD, so this is unambiguous);
  // `currentBranch` falls back to "(detached)" only when git itself errors.
  if (actual === 'HEAD' || actual === '(detached)') {
    throw new MxError(
      `worktree "${wtName}" is in detached HEAD — check out a branch first, then re-run`,
      'DETACHED',
    );
  }
  if (expected != null && expected !== actual) {
    throw new MxError(
      `worktree "${wtName}" is on "${actual}", not "${expected}". ` +
        `mx records the branch the worktree is actually on — run \`git -C ${dest} checkout ${expected}\` first, or omit the branch argument to record "${actual}".`,
      'BRANCH_MISMATCH',
    );
  }
  const previous = wt.branch;
  wt.branch = actual;
  writeWork(root, work);
  return { work: name, repo: wt.repo, name: wtName, branch: actual, previous, changed: actual !== previous };
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
    const dest = worktreePath(root, name, worktreeName(wt));
    if (exists(dest) && isDirty(dest)) dirty.push(worktreeName(wt));
  }
  if (dirty.length) {
    throw new MxError(
      `cannot destroy "${name}" — uncommitted changes in: ${dirty.join(', ')}. Commit or discard, then retry.`,
      'DIRTY',
    );
  }
  const removed: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = worktreePath(root, name, worktreeName(wt));
    if (exists(dest)) git(['-C', repoGitDir(root, wt.repo), 'worktree', 'remove', dest]); // keeps branch
    removed.push(worktreeName(wt));
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
    const dest = worktreePath(root, name, worktreeName(wt));
    if (exists(dest) && isDirty(dest)) dirty.push(worktreeName(wt));
  }
  if (dirty.length) {
    throw new MxError(
      `cannot archive "${name}" — uncommitted changes in: ${dirty.join(', ')}. Commit or discard, then retry.`,
      'DIRTY',
    );
  }
  const removed: string[] = [];
  for (const wt of work.worktrees ?? []) {
    const dest = worktreePath(root, name, worktreeName(wt));
    if (exists(dest)) git(['-C', repoGitDir(root, wt.repo), 'worktree', 'remove', dest]); // keeps branch
    removed.push(worktreeName(wt));
    // Free the worktree's ports — the worktree (and whatever server bound them)
    // is gone. On unarchive, `post-worktree-create` re-allocates from scratch.
    wt.ports = {};
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
  /** Worktree name (the `wt/<name>` selector). */
  name: string;
  /** Branch the worktree is now checked out on (may differ from the recorded one when overridden). */
  branch: string;
  /** Absolute worktree path. */
  path: string;
  /** Ports as recorded in `work.json` — empty after an archive freed them; the caller re-allocates via `post-worktree-create`. */
  ports: Record<string, number>;
}

/**
 * Result of unarchiving a work.
 */
export interface UnarchiveResult {
  /** Work name. */
  work: string;
  /** Restored worktree details, one per worktree. */
  restored: UnarchiveRestoredWorktree[];
}

/**
 * Unarchive a work: re-create worktrees from the branches recorded in
 * `work.json`, or from explicit overrides when the recorded branches are
 * missing. Repopulates the `.code-workspace` and clears the archive flag.
 *
 * If any desired branch (recorded or overridden) does not exist in its
 * pristine clone, throws `NO_REF` listing exactly which worktrees lack which
 * branches, with a hint to re-run with overrides. The overrides map
 * **worktree name -> branch**; on success, the worktree entries in `work.json`
 * are updated to the actually-used branches.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param overrides - Optional `<worktree-name> -> branch` overrides.
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
    name: worktreeName(wt),
    branch: overrides[worktreeName(wt)] ?? wt.branch,
    ports: wt.ports ?? {},
  }));

  const missing: { name: string; branch: string }[] = [];
  for (const d of desired) {
    const rp = repoGitDir(root, d.repo);
    if (!isGitRepo(rp)) {
      throw new MxError(`pristine clone missing for repo: ${d.repo}`, 'NO_REPO');
    }
    if (!branchExists(rp, d.branch)) missing.push({ name: d.name, branch: d.branch });
  }
  if (missing.length) {
    const list = missing.map((m) => `${m.name}=${m.branch}`).join(', ');
    const overrideHint = missing.map((m) => `${m.name}=<branch>`).join(' ');
    throw new MxError(
      `cannot unarchive "${name}" — branch(es) not found: ${list}. ` +
        `Re-run with explicit overrides: \`mx work -n ${name} unarchive ${overrideHint}\`.`,
      'NO_REF',
    );
  }

  const restored: UnarchiveRestoredWorktree[] = [];
  for (const d of desired) {
    const dest = worktreePath(root, name, d.name);
    fs.mkdirSync(worktreesDir(root, name), { recursive: true });
    git(['-C', repoGitDir(root, d.repo), 'worktree', 'add', dest, d.branch]);
    addFolderToWorkspace(root, name, d.name);
    restored.push({ repo: d.repo, name: d.name, branch: d.branch, path: dest, ports: d.ports });
  }

  work.worktrees = restored.map((r) => ({ repo: r.repo, name: r.name, branch: r.branch, ports: r.ports }));
  work.isArchived = false;
  delete work.archived_at;
  writeWork(root, work);
  return { work: name, restored };
}
