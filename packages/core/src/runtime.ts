import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists, isGitRepo, listDirs, realpath } from './fsutil';
import { readJson, writeJson } from './json';
import { runtimePointerPath, stampClaudeMd, removeStaleRuntimeReadme } from './templates';
import type { Work, Worktree, RuntimeOpts, InferredContext } from './types';

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
 * Resolve the runtime path via flag, then `$MX_RUNTIME`, then the `.mx-runtime`
 * pointer.
 *
 * @param opts - Resolution options carrying an explicit `--runtime` flag.
 * @returns Absolute runtime path.
 */
export function discoverRuntime(opts: RuntimeOpts = {}): string {
  let p = opts.runtime || process.env.MX_RUNTIME || null;
  if (!p) {
    const ptr = runtimePointerPath();
    if (exists(ptr)) p = fs.readFileSync(ptr, 'utf8').trim() || null;
  }
  if (!p) {
    throw new MxError(
      'no runtime found — set --runtime <path>, $MX_RUNTIME, or run `mx init`',
      'NO_RUNTIME',
    );
  }
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
 * stamp `CLAUDE.md`, drop a stale runtime README, and record the pointer.
 *
 * Idempotent: never clobbers existing `repos/`/`works/`.
 *
 * @param target0 - Desired runtime path (resolved to absolute).
 * @returns The runtime path and the list of paths created/stamped this run.
 */
export function initRuntime(target0: string): InitResult {
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
  created.push(stampClaudeMd(target));
  removeStaleRuntimeReadme(target);
  fs.writeFileSync(runtimePointerPath(), target + '\n');
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
 * Re-stamp the runtime `CLAUDE.md` from the current template and drop a stale
 * runtime README. Leaves `repos/` and `works/` untouched.
 *
 * @param root - Runtime root.
 * @returns The runtime path and the re-stamped files.
 */
export function updateRuntime(root: string): UpdateResult {
  const dest = stampClaudeMd(root);
  removeStaleRuntimeReadme(root);
  return { runtime: root, updated: [dest] };
}
