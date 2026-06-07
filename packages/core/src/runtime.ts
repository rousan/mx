import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists, isGitRepo, listDirs, realpath } from './fsutil';
import { readJson, writeJson } from './json';
import { stampClaudeMd, stampContextIndex, removeStaleRuntimeReadme } from './templates';
import type { Work, Worktree, RuntimeOpts, InferredContext } from './types';

/**
 * Default runtime location used when neither `--runtime` nor `$MX_RUNTIME` is set.
 */
const DEFAULT_RUNTIME = path.join(os.homedir(), 'mx');

/**
 * Absolute path of the default runtime (`~/mx`). Resolved per call so tests
 * that monkey-patch `os.homedir` see consistent results.
 *
 * @returns Absolute path to the default runtime.
 */
export function defaultRuntime(): string {
  return path.resolve(DEFAULT_RUNTIME);
}

/**
 * Path to a runtime's `repos/` directory.
 *
 * @param root - Runtime root.
 * @returns Absolute path.
 */
export const reposDir = (root: string): string => path.join(root, 'repos');

/**
 * Path to a runtime's `works/` directory.
 *
 * @param root - Runtime root.
 * @returns Absolute path.
 */
export const worksDir = (root: string): string => path.join(root, 'works');

/**
 * Path to a pristine clone under `repos/`.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path.
 */
export const repoPath = (root: string, name: string): string => path.join(reposDir(root), name);

/**
 * Path to a work folder under `works/`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Absolute path.
 */
export const workDir = (root: string, name: string): string => path.join(worksDir(root), name);

/**
 * Path to a work's `work.json` manifest.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Absolute path.
 */
export const workManifest = (root: string, name: string): string =>
  path.join(workDir(root, name), 'work.json');

/**
 * Path to a work's VS Code `.code-workspace` file.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Absolute path.
 */
export const workspaceFile = (root: string, name: string): string =>
  path.join(workDir(root, name), `${name}.code-workspace`);

/**
 * Resolve the runtime path: `--runtime` flag, then `$MX_RUNTIME`, then the
 * default `~/mx`. The location is never persisted in the source tree.
 *
 * @param opts - Resolution options carrying an explicit `--runtime` flag.
 * @returns Absolute runtime path.
 */
export function discoverRuntime(opts: RuntimeOpts = {}): string {
  const p = opts.runtime || process.env.MX_RUNTIME || DEFAULT_RUNTIME;
  return path.resolve(p);
}

/**
 * Discover the runtime and assert it is initialized (has an `.mx-root` marker).
 *
 * @param opts - Resolution options.
 * @returns Absolute runtime path.
 */
export function requireRuntime(opts: RuntimeOpts = {}): string {
  const root = discoverRuntime(opts);
  if (!exists(path.join(root, '.mx-root'))) {
    throw new MxError(`not an mx runtime (no .mx-root): ${root} — run \`mx init\``, 'NO_RUNTIME');
  }
  return root;
}

/**
 * Names of pristine clones present under `repos/`.
 *
 * @param root - Runtime root.
 * @returns Sorted repo names that are git repositories.
 */
export function listRepoNames(root: string): string[] {
  return listDirs(reposDir(root)).filter((n) => isGitRepo(repoPath(root, n)));
}

/**
 * Names of works present under `works/` (those with a `work.json`).
 *
 * @param root - Runtime root.
 * @returns Sorted work names.
 */
export function listWorkNames(root: string): string[] {
  return listDirs(worksDir(root)).filter((n) => exists(workManifest(root, n)));
}

/**
 * Read and parse a work's manifest.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The parsed `Work`.
 */
export function readWork(root: string, name: string): Work {
  const file = workManifest(root, name);
  if (!exists(file)) {
    if (!exists(workDir(root, name))) throw new MxError(`no such work: ${name}`, 'NO_WORK');
    throw new MxError(
      `work "${name}" has no work.json — recreate it with \`mx work new\``,
      'NO_MANIFEST',
    );
  }
  return readJson<Work>(file);
}

/**
 * Write a work's manifest.
 *
 * @param root - Runtime root.
 * @param work - The work to persist (its `name` selects the destination).
 */
export function writeWork(root: string, work: Work): void {
  writeJson(workManifest(root, work.name), work);
}

/**
 * Find a worktree entry in a work by repo name.
 *
 * @param work - The work to search.
 * @param repo - Repo name to match.
 * @returns The worktree, or null if not present.
 */
export function findWorktree(work: Work, repo: string): Worktree | null {
  return (work.worktrees ?? []).find((w) => w.repo === repo) ?? null;
}

/**
 * Count session-summary files in a work's `sessions/` folder. Only `.md`
 * files are counted; anything else (READMEs, dropped notes, hidden files)
 * is ignored. Returns 0 if the folder doesn't exist yet.
 *
 * Single source of truth used by both `listWorksInfo` and `statusRuntime`.
 *
 * @param root - Runtime root.
 * @param workName - Work folder name.
 * @returns Number of session files.
 */
export function countSessions(root: string, workName: string): number {
  const dir = path.join(workDir(root, workName), 'sessions');
  if (!exists(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md')).length;
}

/**
 * Infer the work and/or repo from the current working directory so `-n` can be
 * omitted. Comparison uses realpath to survive symlinked roots.
 *
 * @param root - Runtime root.
 * @returns The inferred work/repo (either may be null).
 */
export function inferContext(root: string): InferredContext {
  const cwd = realpath(process.cwd());
  const segmentsUnder = (base: string): string[] | null => {
    if (!exists(base)) return null;
    const rel = path.relative(realpath(base), cwd);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep);
  };
  const w = segmentsUnder(worksDir(root));
  if (w) return { work: w[0], repo: w[1] ?? null };
  const r = segmentsUnder(reposDir(root));
  if (r) return { work: null, repo: r[0] };
  return { work: null, repo: null };
}

/**
 * Result of scaffolding or adopting a runtime.
 */
export interface InitResult {
  /** Absolute runtime path. */
  runtime: string;
  /** Paths created or (re)stamped during this init run. */
  created: string[];
}

/**
 * Scaffold or adopt a runtime: ensure `repos/`, `works/`, and `.mx-root` exist,
 * stamp `CLAUDE.md`, and drop a stale runtime README.
 *
 * Idempotent: never clobbers existing `repos/`/`works/`. The runtime location is
 * not persisted anywhere — callers address it via `$MX_RUNTIME` / `--runtime`.
 *
 * @param target0 - Desired runtime path (resolved to absolute).
 * @param templatesDir - Directory holding the `CLAUDE.md` template to stamp.
 * @returns The runtime path and the list of paths created/stamped this run.
 */
export function initRuntime(target0: string, templatesDir: string): InitResult {
  const target = path.resolve(target0);
  const created: string[] = [];
  for (const d of [target, reposDir(target), worksDir(target)]) {
    if (!exists(d)) {
      fs.mkdirSync(d, { recursive: true });
      created.push(d);
    }
  }
  const marker = path.join(target, '.mx-root');
  if (!exists(marker)) {
    fs.writeFileSync(marker, '');
    created.push(marker);
  }
  created.push(stampClaudeMd(target, templatesDir));
  const ctxIndex = stampContextIndex(target, templatesDir);
  if (ctxIndex) created.push(ctxIndex);
  removeStaleRuntimeReadme(target);
  return { runtime: target, created };
}

/**
 * Result of re-stamping a runtime's templated files.
 */
export interface UpdateResult {
  /** Absolute runtime path. */
  runtime: string;
  /** Paths re-stamped during this update. */
  updated: string[];
}

/**
 * Ensure mx-owned structural directories inside a single work folder. Purely
 * additive and **non-destructive**: only creates missing directories; never
 * touches `work.json`, `.code-workspace`, worktree code, session files, or
 * anything else the user owns. Both `workNew` (initial creation) and
 * `updateRuntime` (backfill on existing runtimes) call this so the structural
 * contract lives in exactly one place.
 *
 * @param root - Runtime root.
 * @param workName - Work to scaffold inside.
 * @returns Paths newly created this call (empty if everything already existed).
 */
export function ensureWorkScaffolding(root: string, workName: string): string[] {
  const created: string[] = [];
  const sessions = path.join(workDir(root, workName), 'sessions');
  if (!exists(sessions)) {
    fs.mkdirSync(sessions, { recursive: true });
    created.push(sessions);
  }
  return created;
}

/**
 * Re-sync a runtime with the current mx version. The contract:
 *
 * - **mx-owned generated content is re-stamped:** root `CLAUDE.md` always;
 *   `context/INDEX.json` only when missing.
 * - **mx-owned structural directories are backfilled across every work**
 *   (e.g. `<work>/sessions/`) so existing runtimes get new scaffolding the
 *   same way fresh ones do. Future per-work or per-repo additions slot into
 *   `ensureWorkScaffolding` and will propagate automatically here.
 * - **User data is never touched:** `work.json` contents, `.code-workspace`,
 *   worktree code, session body files, context body files, and existing
 *   `INDEX.json` are all left exactly as-is.
 * - A stale runtime `README.md` (legacy) is removed if present.
 *
 * `repos/` is not modified.
 *
 * @param root - Runtime root.
 * @param templatesDir - Directory holding the templates to stamp.
 * @returns The runtime path and every file/directory created or re-stamped.
 */
export function updateRuntime(root: string, templatesDir: string): UpdateResult {
  const updated: string[] = [];
  updated.push(stampClaudeMd(root, templatesDir));
  const ctxIndex = stampContextIndex(root, templatesDir);
  if (ctxIndex) updated.push(ctxIndex);
  for (const workName of listWorkNames(root)) {
    updated.push(...ensureWorkScaffolding(root, workName));
  }
  removeStaleRuntimeReadme(root);
  return { runtime: root, updated };
}
