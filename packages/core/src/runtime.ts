import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists, isGitRepo, listDirs, realpath } from './fsutil';
import { git } from './git';
import { readJson, writeJson } from './json';
import {
  stampClaudeMd,
  stampContextIndex,
  removeStaleRuntimeReadme,
  stampRuntimeHooks,
  stampRuntimeBins,
} from './templates';
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
 * Path to a runtime's `bin/` directory — runtime-wide utility executables mx
 * ships (and the user can add to) that are meant to be put on `PATH`. Distinct
 * from a work's own `works/<work>/bin/` (per-work executables).
 *
 * @param root - Runtime root.
 * @returns Absolute path to `<root>/bin`.
 */
export const runtimeBinDir = (root: string): string => path.join(root, 'bin');

/**
 * One executable in the runtime `bin/` directory.
 */
export interface RuntimeBin {
  /** File name (the command name once `bin/` is on `PATH`). */
  name: string;
  /** Absolute path to the file. */
  path: string;
  /** Whether the file currently has an executable bit set. */
  executable: boolean;
}

/**
 * List the runtime `bin/` directory's entries (regular files only, hidden
 * files skipped), sorted by name. Empty when the directory doesn't exist.
 *
 * @param root - Runtime root.
 * @returns One entry per bin, sorted by name.
 */
export function listRuntimeBins(root: string): RuntimeBin[] {
  const dir = runtimeBinDir(root);
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .map((n) => ({ name: n, full: path.join(dir, n), st: fs.statSync(path.join(dir, n)) }))
    .filter((e) => e.st.isFile())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, path: e.full, executable: (e.st.mode & 0o111) !== 0 }));
}

/**
 * Path to a pristine clone under `repos/`.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path.
 */
export const repoPath = (root: string, name: string): string => path.join(reposDir(root), name);

/**
 * Path to a repo's git clone — the `git/` subfolder inside the per-repo
 * container. The container (`repoPath`) holds the clone plus `repo.json`; the
 * actual git repository lives here. (Per-repo `hydrate.sh`/`health.sh` were
 * removed in v3 — those hooks are now central, in `<runtime>/hooks/`.)
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path to `repos/<name>/git`.
 */
export const repoGitDir = (root: string, name: string): string =>
  path.join(repoPath(root, name), 'git');

/**
 * Path to a repo's `repo.json` metadata file (`repos/<name>/repo.json`).
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path to `repos/<name>/repo.json`.
 */
export const repoConfigFile = (root: string, name: string): string =>
  path.join(repoPath(root, name), 'repo.json');

/**
 * Shape of a repo's `repo.json`. Intentionally minimal for now (`name`);
 * extensible later, and unknown keys are preserved across writes.
 */
export interface RepoConfig {
  /** Repo name (matches the container folder name). */
  name: string;
  /** Forward-compatible: unknown keys are preserved. */
  [key: string]: unknown;
}

/**
 * Read a repo's `repo.json`, or null when it doesn't exist yet.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns The parsed config, or null.
 */
export function readRepoConfig(root: string, name: string): RepoConfig | null {
  const f = repoConfigFile(root, name);
  if (!exists(f)) return null;
  return readJson<RepoConfig>(f);
}

/**
 * Write a repo's `repo.json`, preserving any other keys already present.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 */
export function writeRepoConfig(root: string, name: string): void {
  const existing = readRepoConfig(root, name) ?? {};
  writeJson(repoConfigFile(root, name), { ...existing, name });
}

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
 * Path to a work's `wt/` directory, which holds all of its worktrees.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Absolute path to `works/<name>/wt`.
 */
export const worktreesDir = (root: string, name: string): string =>
  path.join(workDir(root, name), 'wt');

/**
 * Path to a single worktree inside a work (`works/<name>/wt/<repo>`).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo name.
 * @returns Absolute path to the worktree directory.
 */
export const worktreePath = (root: string, name: string, repo: string): string =>
  path.join(worktreesDir(root, name), repo);

/**
 * Path to the runtime's central `hooks/` directory — the single hub of
 * lifecycle hooks (replacing v2's per-repo `hydrate.sh`/`health.sh` and per-work
 * `hooks/`). One executable per event; the user branches on `MX_*` env inside.
 *
 * @param root - Runtime root.
 * @returns Absolute path to `<root>/hooks`.
 */
export const runtimeHooksDir = (root: string): string => path.join(root, 'hooks');

/**
 * The lifecycle events mx fires, each mapping to one executable at
 * `<runtime>/hooks/<event>`. `pre-*` hooks run before the operation mutates
 * anything and abort it on a non-zero exit; `post-*` hooks run after success and
 * a non-zero exit is only a warning; `repo-health` augments `mx repo health`
 * with its stdout. The set is extensible — add an event here and a stamped
 * template, and wire the call site.
 */
export const HOOK_EVENTS = [
  'pre-work-archive',
  'post-work-archive',
  'pre-work-unarchive',
  'post-work-unarchive',
  'pre-worktree-create',
  'post-worktree-create',
  'pre-worktree-remove',
  'post-worktree-remove',
  'pre-repo-fetch',
  'post-repo-fetch',
  'repo-health',
] as const;

/**
 * A single lifecycle hook event name.
 */
export type HookEvent = (typeof HOOK_EVENTS)[number];

/**
 * Path to a single lifecycle hook executable (`<runtime>/hooks/<event>`).
 *
 * @param root - Runtime root.
 * @param event - Lifecycle event the hook handles.
 * @returns Absolute path to the hook file.
 */
export const hookScript = (root: string, event: HookEvent): string =>
  path.join(runtimeHooksDir(root), event);

/**
 * The runtime layout version this build of mx supports. A runtime's `VERSION`
 * file must match this for commands to run; `mx migrate` upgrades older
 * runtimes up to it. Tracks the CLI major version (CLI 2.x ⇄ runtime v2).
 */
export const RUNTIME_VERSION = 3;

/**
 * Shape of the runtime config file (`<runtime>/mx.json`). Intentionally open —
 * `version` is the only field mx requires today; more runtime-level config can
 * be added over time without changing the file's identity.
 */
export interface MxConfig {
  /** Runtime layout version (>= 1). */
  version: number;
  /** Forward-compatible: unknown keys are preserved across writes. */
  [key: string]: unknown;
}

/**
 * Path to a runtime's config file.
 *
 * @param root - Runtime root.
 * @returns Absolute path to `<root>/mx.json`.
 */
export const mxConfigFile = (root: string): string => path.join(root, 'mx.json');

/**
 * Read a runtime's `mx.json`, or null when it doesn't exist (a runtime with no
 * `mx.json` predates versioning and is treated as legacy v1).
 *
 * @param root - Runtime root.
 * @returns The parsed config, or null if absent.
 */
export function readMxConfig(root: string): MxConfig | null {
  const f = mxConfigFile(root);
  if (!exists(f)) return null;
  return readJson<MxConfig>(f);
}

/**
 * Read a runtime's layout version from `mx.json`. A runtime with no `mx.json`
 * predates versioning and is treated as **v1** (legacy).
 *
 * @param root - Runtime root.
 * @returns The integer runtime version (>= 1).
 */
export function readRuntimeVersion(root: string): number {
  const cfg = readMxConfig(root);
  if (!cfg) return 1;
  const n = cfg.version;
  if (!Number.isInteger(n) || (n as number) < 1) {
    throw new MxError(`invalid version in ${mxConfigFile(root)}: ${JSON.stringify(n)}`, 'BAD_VERSION');
  }
  return n;
}

/**
 * Record a runtime's layout version in `mx.json`, preserving any other config
 * keys already present.
 *
 * @param root - Runtime root.
 * @param version - Integer version to record.
 */
export function writeRuntimeVersion(root: string, version: number): void {
  const existing = readMxConfig(root) ?? {};
  writeJson(mxConfigFile(root), { ...existing, version });
}

/**
 * Human-readable message for a runtime/CLI version mismatch — points forward to
 * `mx migrate` when the runtime is older, or to a CLI upgrade when it's newer.
 *
 * @param actual - The runtime's recorded version.
 * @returns The message string.
 */
function versionMismatchMessage(actual: number): string {
  if (actual > RUNTIME_VERSION) {
    return `runtime is v${actual}, newer than this mx supports (v${RUNTIME_VERSION}). Upgrade your mx CLI: \`npm i -g @roulabs/mx@latest\`.`;
  }
  return `runtime is v${actual} but this mx supports runtime v${RUNTIME_VERSION}. Run \`mx migrate\` to upgrade the runtime.`;
}

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
  // Version gate: every runtime-touching command runs through here, so a
  // mismatched runtime is rejected centrally. `mx migrate` opts out so it can
  // upgrade an older runtime.
  if (!opts.allowVersionMismatch) {
    const v = readRuntimeVersion(root);
    if (v !== RUNTIME_VERSION) {
      throw new MxError(versionMismatchMessage(v), 'RUNTIME_VERSION_MISMATCH');
    }
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
  return listDirs(reposDir(root)).filter((n) => isGitRepo(repoGitDir(root, n)));
}

/**
 * Migrate any pristine repos still using the legacy flat layout
 * (`repos/<name>` is itself the git clone) to the container layout
 * (`repos/<name>/git` holds the clone). For each migrated repo, the clone is
 * moved into a `git/` subfolder and `git worktree repair` is run so existing
 * worktrees — whose `.git` files point at the old main-repo location — relink
 * to the new path.
 *
 * Idempotent: repos already on the container layout are skipped, as are
 * directories that aren't git repos at all. Best-effort `worktree repair`
 * (a failure there doesn't abort the move).
 *
 * @param root - Runtime root.
 * @param opts - Migration options.
 * @param opts.dryRun - When set, nothing is moved; the returned list is exactly
 *   the repos that would be migrated.
 * @returns Absolute container paths of the repos migrated this run.
 */
export function migrateRepoLayout(root: string, opts: { dryRun?: boolean } = {}): string[] {
  const dry = opts.dryRun === true;
  const migrated: string[] = [];
  for (const name of listDirs(reposDir(root))) {
    const container = repoPath(root, name);
    const gitdir = repoGitDir(root, name);
    if (isGitRepo(gitdir)) continue; // already container layout
    if (!isGitRepo(container)) continue; // not a flat clone — nothing to migrate
    if (dry) {
      migrated.push(container);
      continue;
    }
    // Move the clone into a `git/` subfolder. Can't move a dir into its own
    // child in one step, so stage via a sibling temp dir first.
    const tmp = path.join(reposDir(root), `.${name}.mxmig`);
    if (exists(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
    fs.renameSync(container, tmp);
    fs.mkdirSync(container, { recursive: true });
    fs.renameSync(tmp, gitdir);
    // Relink worktrees whose .git now points at the old main-repo location.
    try {
      git(['-C', gitdir, 'worktree', 'repair']);
    } catch {
      /* best-effort: a repair failure shouldn't abort the migration */
    }
    migrated.push(container);
  }
  return migrated;
}

/**
 * Migrate works from the legacy flat worktree layout (`works/<work>/<repo>`) to
 * the container layout (`works/<work>/wt/<repo>`). Each worktree is relocated
 * with `git worktree move` (falling back to a plain move + `git worktree
 * repair`), and the work's `.code-workspace` folder paths are rewritten from
 * `<repo>` to `wt/<repo>`. Archived works (no worktree dirs on disk) and
 * already-migrated worktrees are skipped.
 *
 * Run after `migrateRepoLayout` so each repo's clone is already at its container
 * `git/` and worktrees are relinked to it.
 *
 * @param root - Runtime root.
 * @param opts - Migration options.
 * @param opts.dryRun - When set, nothing is moved or rewritten; the returned
 *   list is exactly the paths that would change.
 * @returns Absolute paths relocated/rewritten this run.
 */
export function migrateWorkLayout(root: string, opts: { dryRun?: boolean } = {}): string[] {
  const dry = opts.dryRun === true;
  const changed: string[] = [];
  for (const name of listWorkNames(root)) {
    let work: Work;
    try {
      work = readWork(root, name);
    } catch {
      continue;
    }
    const wd = workDir(root, name);
    const wtDir = path.join(wd, 'wt');
    for (const wt of work.worktrees ?? []) {
      const flat = path.join(wd, wt.repo);
      const dest = path.join(wtDir, wt.repo);
      if (exists(dest) || !exists(flat)) continue; // already moved, or archived
      if (dry) {
        changed.push(dest);
        continue;
      }
      fs.mkdirSync(wtDir, { recursive: true });
      try {
        git(['-C', repoGitDir(root, wt.repo), 'worktree', 'move', flat, dest]);
      } catch {
        // Fallback: relocate the directory and re-link via repair.
        fs.renameSync(flat, dest);
        try {
          git(['-C', repoGitDir(root, wt.repo), 'worktree', 'repair', dest]);
        } catch {
          /* best-effort */
        }
      }
      changed.push(dest);
    }
    // Rewrite workspace folder paths "<repo>" -> "wt/<repo>".
    const wsFile = workspaceFile(root, name);
    if (exists(wsFile)) {
      const ws = readJson<{ folders?: { name?: string; path: string }[] }>(wsFile);
      const repos = new Set((work.worktrees ?? []).map((w) => w.repo));
      let touched = false;
      for (const f of ws.folders ?? []) {
        if (f.path && !f.path.startsWith('wt/') && repos.has(f.path)) {
          if (!dry) f.path = `wt/${f.path}`;
          touched = true;
        }
      }
      if (touched) {
        if (!dry) writeJson(wsFile, ws);
        changed.push(wsFile);
      }
    }
  }
  return changed;
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
 * The effective identifier of a worktree within its work — its `name` when set,
 * otherwise the repo name. This is the `wt/<…>` directory segment and the
 * selector for `worktree rm` / `port` / hooks.
 *
 * @param wt - The worktree entry.
 * @returns The effective worktree name.
 */
export function worktreeName(wt: Worktree): string {
  return wt.name ?? wt.repo;
}

/**
 * Find the **first** worktree entry in a work that uses a given repo. Use this
 * for repo-level questions ("is this repo used by the work?"); a work may now
 * hold several worktrees of the same repo, so prefer `findWorktreeByName` when
 * you mean a specific worktree.
 *
 * @param work - The work to search.
 * @param repo - Repo name to match.
 * @returns The first matching worktree, or null.
 */
export function findWorktree(work: Work, repo: string): Worktree | null {
  return (work.worktrees ?? []).find((w) => w.repo === repo) ?? null;
}

/**
 * Find a worktree entry by its effective name (the `wt/<name>` selector).
 *
 * @param work - The work to search.
 * @param name - Worktree name to match (defaults compared against the repo name).
 * @returns The matching worktree, or null.
 */
export function findWorktreeByName(work: Work, name: string): Worktree | null {
  return (work.worktrees ?? []).find((w) => worktreeName(w) === name) ?? null;
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
  // Worktrees live under <work>/wt/<name>, so the third segment is the worktree
  // NAME (which may differ from the repo). Resolve it to a repo via work.json;
  // other work subdirs (scripts/, files/, tmp/, sessions/) imply no repo.
  if (w) {
    const work = w[0];
    let repo: string | null = null;
    if (w[1] === 'wt' && w[2]) {
      try {
        repo = findWorktreeByName(readWork(root, work), w[2])?.repo ?? null;
      } catch {
        repo = null;
      }
    }
    return { work, repo };
  }
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
  // Adopting an existing runtime: it must already be this CLI's version —
  // otherwise init would stamp current-version templates onto an older layout.
  if (exists(path.join(target, '.mx-root'))) {
    const v = readRuntimeVersion(target);
    if (v !== RUNTIME_VERSION) {
      throw new MxError(
        `cannot init: existing runtime at ${target} is v${v}, but this mx supports v${RUNTIME_VERSION}. ` +
          (v < RUNTIME_VERSION ? 'Run `mx migrate` to upgrade it.' : 'Upgrade your mx CLI.'),
        'RUNTIME_VERSION_MISMATCH',
      );
    }
  }
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
  if (!exists(mxConfigFile(target))) {
    writeRuntimeVersion(target, RUNTIME_VERSION);
    created.push(mxConfigFile(target));
  }
  created.push(stampClaudeMd(target, templatesDir));
  const ctxIndex = stampContextIndex(target, templatesDir);
  if (ctxIndex) created.push(ctxIndex);
  created.push(...stampRuntimeHooks(target, templatesDir));
  created.push(...stampRuntimeBins(target, templatesDir));
  removeStaleRuntimeReadme(target);
  return { runtime: target, created };
}

/**
 * Result of re-stamping a runtime's templated files (`mx sync`).
 */
export interface SyncResult {
  /** Absolute runtime path. */
  runtime: string;
  /** Paths re-stamped during this sync. */
  updated: string[];
}

/**
 * Ensure mx-owned structural directories inside a single work folder. Purely
 * additive and **non-destructive**: only creates missing directories; never
 * touches `work.json`, `.code-workspace`, worktree code, session files, or
 * anything else the user owns. Both `workNew` (initial creation) and
 * `syncRuntime` (backfill on existing runtimes) call this so the structural
 * contract lives in exactly one place.
 *
 * @param root - Runtime root.
 * @param workName - Work to scaffold inside.
 * @param opts - Scaffolding options.
 * @param opts.dryRun - When set, nothing is written; the returned list is
 *   exactly what would be created (for `mx migrate --dry-run`).
 * @returns Paths newly created this call (empty if everything already existed).
 */
export function ensureWorkScaffolding(
  root: string,
  workName: string,
  opts: { dryRun?: boolean } = {},
): string[] {
  const dry = opts.dryRun === true;
  const created: string[] = [];
  const wd = workDir(root, workName);
  // mx-owned work subdirectories. `wt/` holds worktrees; the rest separate
  // user/agent scratch from the mx-native work root (see the work CLAUDE.md):
  //   scripts/ — ad-hoc per-work scripts (also fine for per-work binaries)
  //   files/   — artifacts to keep
  //   tmp/     — throwaway scratch (may be deleted anytime)
  //   sessions/— session summaries
  // (Lifecycle hooks are NOT per-work in v3 — they live centrally in
  //  <runtime>/hooks/ and branch on $MX_WORK / $MX_REPO inside.)
  for (const d of ['wt', 'scripts', 'files', 'tmp', 'sessions']) {
    const p = path.join(wd, d);
    if (!exists(p)) {
      if (!dry) fs.mkdirSync(p, { recursive: true });
      created.push(p);
    }
  }
  // Work-specific CLAUDE.md (stamp-if-missing; user-editable). Loads alongside
  // the runtime CLAUDE.md for sessions started in this work folder.
  const claudeMd = path.join(wd, 'CLAUDE.md');
  if (!exists(claudeMd)) {
    if (!dry) fs.writeFileSync(claudeMd, workClaudeMd(workName));
    created.push(claudeMd);
  }
  // Per-work Claude Code settings: a SessionStart hook that loads the runtime's
  // context-registry index into every session launched in this work folder.
  // Claude Code reads .claude/settings.json only from the session's launch dir
  // (no upward walk) and mx sessions launch here, so it must be per-work — not
  // at the runtime root. Stamp-if-missing: it's user-editable afterwards.
  const settings = path.join(wd, '.claude', 'settings.json');
  if (!exists(settings)) {
    if (!dry) {
      fs.mkdirSync(path.dirname(settings), { recursive: true });
      fs.writeFileSync(settings, workClaudeSettings(root));
    }
    created.push(settings);
  }
  return created;
}

/**
 * Default contents for a work's `CLAUDE.md` — an explanatory comment and
 * otherwise empty, so it adds no active rules until the user fills it in.
 *
 * @param name - Work name (interpolated into the guidance).
 * @returns The default work `CLAUDE.md` text.
 */
function workClaudeMd(name: string): string {
  return `<!--
Work-specific CLAUDE.md for "${name}".

This file loads alongside the runtime's CLAUDE.md (the mx rules) for every Claude
session started in this work folder. Put rules and context specific to THIS work
here: what you're building, conventions, gotchas, which repo is your lane, etc.
mx never overwrites this file after creating it — it's yours to edit.

Keep ad-hoc files OUT of the work root (it holds mx-native files). Use:
  files/    artifacts worth keeping
  tmp/      throwaway scratch — may be deleted at any time, no guarantees
  scripts/  ad-hoc scripts for this work
-->
`;
}

/**
 * Build the per-work `.claude/settings.json` contents: a `SessionStart` hook
 * that prints the runtime's context-registry index so every session has the
 * catalog in context from the start (deterministic, unlike CLAUDE.md prose).
 * The runtime's absolute INDEX path is baked in, so this is generated
 * programmatically rather than copied from a static template.
 *
 * @param root - Runtime root.
 * @returns The settings JSON text (with a trailing newline).
 */
function workClaudeSettings(root: string): string {
  const contextDir = path.join(root, 'context');
  const indexPath = path.join(contextDir, 'INDEX.json');
  const command =
    `echo '# mx context registry — open ${contextDir}/<path>.md for relevant entries:'; ` +
    `cat '${indexPath}' 2>/dev/null`;
  const settings = {
    hooks: {
      SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    },
  };
  return JSON.stringify(settings, null, 2) + '\n';
}

/**
 * Re-sync a runtime's mx-owned generated content with the current mx version
 * (`mx sync`) — a **same-major, non-breaking** refresh. The contract:
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
 * Cross-version **layout** changes are out of scope here — those live in
 * `migrateRuntime` (`mx migrate`). `repos/` clones are not modified.
 *
 * @param root - Runtime root.
 * @param templatesDir - Directory holding the templates to stamp.
 * @returns The runtime path and every file/directory created or re-stamped.
 */
export function syncRuntime(root: string, templatesDir: string): SyncResult {
  const updated: string[] = [];
  updated.push(stampClaudeMd(root, templatesDir));
  const ctxIndex = stampContextIndex(root, templatesDir);
  if (ctxIndex) updated.push(ctxIndex);
  for (const workName of listWorkNames(root)) {
    updated.push(...ensureWorkScaffolding(root, workName));
  }
  // Backfill repo.json for every repo that predates it.
  for (const repo of listRepoNames(root)) {
    if (!exists(repoConfigFile(root, repo))) {
      writeRepoConfig(root, repo);
      updated.push(repoConfigFile(root, repo));
    }
  }
  // Backfill the central hooks/ (stamp-if-missing) and the runtime bin/.
  updated.push(...stampRuntimeHooks(root, templatesDir));
  updated.push(...stampRuntimeBins(root, templatesDir));
  removeStaleRuntimeReadme(root);
  return { runtime: root, updated };
}
