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
  stampRepoScripts,
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
 * Path to a pristine clone under `repos/`.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path.
 */
export const repoPath = (root: string, name: string): string => path.join(reposDir(root), name);

/**
 * Path to a repo's git clone — the `git/` subfolder inside the per-repo
 * container. The container (`repoPath`) holds the clone plus mx-owned per-repo
 * tooling (e.g. `setup.sh`, `health.sh`); the actual git repository lives here.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path to `repos/<name>/git`.
 */
export const repoGitDir = (root: string, name: string): string =>
  path.join(repoPath(root, name), 'git');

/**
 * Path to a repo's per-worktree setup hook (`repos/<name>/setup.sh`), run after
 * a worktree is created for that repo.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path to the repo's `setup.sh`.
 */
export const repoSetupScript = (root: string, name: string): string =>
  path.join(repoPath(root, name), 'setup.sh');

/**
 * Path to a repo's health hook (`repos/<name>/health.sh`), whose stdout
 * augments `mx repo health` output.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @returns Absolute path to the repo's `health.sh`.
 */
export const repoHealthScript = (root: string, name: string): string =>
  path.join(repoPath(root, name), 'health.sh');

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
 * The runtime layout version this build of mx supports. A runtime's `VERSION`
 * file must match this for commands to run; `mx migrate` upgrades older
 * runtimes up to it. Tracks the CLI major version (CLI 2.x ⇄ runtime v2).
 */
export const RUNTIME_VERSION = 2;

/**
 * Path to a runtime's `VERSION` file.
 *
 * @param root - Runtime root.
 * @returns Absolute path to `<root>/VERSION`.
 */
export const versionFile = (root: string): string => path.join(root, 'VERSION');

/**
 * Read a runtime's layout version. A runtime with no `VERSION` file predates
 * versioning and is treated as **v1** (legacy).
 *
 * @param root - Runtime root.
 * @returns The integer runtime version (>= 1).
 */
export function readRuntimeVersion(root: string): number {
  const f = versionFile(root);
  if (!exists(f)) return 1;
  const raw = fs.readFileSync(f, 'utf8').trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new MxError(`invalid runtime VERSION file (${JSON.stringify(raw)}) at ${f}`, 'BAD_VERSION');
  }
  return n;
}

/**
 * Write a runtime's layout version.
 *
 * @param root - Runtime root.
 * @param version - Integer version to record.
 */
export function writeRuntimeVersion(root: string, version: number): void {
  fs.writeFileSync(versionFile(root), `${version}\n`);
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
 * @returns Absolute container paths of the repos migrated this run.
 */
export function migrateRepoLayout(root: string): string[] {
  const migrated: string[] = [];
  for (const name of listDirs(reposDir(root))) {
    const container = repoPath(root, name);
    const gitdir = repoGitDir(root, name);
    if (isGitRepo(gitdir)) continue; // already container layout
    if (!isGitRepo(container)) continue; // not a flat clone — nothing to migrate
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
  if (!exists(versionFile(target))) {
    writeRuntimeVersion(target, RUNTIME_VERSION);
    created.push(versionFile(target));
  }
  created.push(stampClaudeMd(target, templatesDir));
  const ctxIndex = stampContextIndex(target, templatesDir);
  if (ctxIndex) created.push(ctxIndex);
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
 * @returns Paths newly created this call (empty if everything already existed).
 */
export function ensureWorkScaffolding(root: string, workName: string): string[] {
  const created: string[] = [];
  const wd = workDir(root, workName);
  const sessions = path.join(wd, 'sessions');
  if (!exists(sessions)) {
    fs.mkdirSync(sessions, { recursive: true });
    created.push(sessions);
  }
  // Per-work Claude Code settings: a SessionStart hook that loads the runtime's
  // context-registry index into every session launched in this work folder.
  // Claude Code reads .claude/settings.json only from the session's launch dir
  // (no upward walk) and mx sessions launch here, so it must be per-work — not
  // at the runtime root. Stamp-if-missing: it's user-editable afterwards.
  const settings = path.join(wd, '.claude', 'settings.json');
  if (!exists(settings)) {
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    fs.writeFileSync(settings, workClaudeSettings(root));
    created.push(settings);
  }
  return created;
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
  // Backfill mx-owned per-repo scripts (e.g. setup.sh) for every pristine repo.
  for (const repo of listRepoNames(root)) {
    updated.push(...stampRepoScripts(repoPath(root, repo), templatesDir));
  }
  removeStaleRuntimeReadme(root);
  return { runtime: root, updated };
}
