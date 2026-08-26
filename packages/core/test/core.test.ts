import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  nextFreePort,
  allocatedPorts,
  portSet,
  repoNameFromUrl,
  inferContext,
  discoverRuntime,
  initRuntime,
  syncRuntime,
  migrateRepoLayout,
  migrateRuntime,
  requireRuntime,
  readRuntimeVersion,
  writeRuntimeVersion,
  RUNTIME_VERSION,
  repoGitDir,
  runtimeBinDir,
  runtimeFilesDir,
  listRuntimeBins,
  hookScript,
  HOOK_EVENTS,
  readRepoConfig,
  repoConfigFile,
  readWork,
  writeWork,
  findWorktreeByName,
  worktreeName,
  workNew,
  worktreeAdd,
  worktreeRemove,
  worktreeSetBranch,
  worktreeList,
  portList,
  portUnset,
  archiveWork,
  unarchiveWork,
  workDestroy,
  listWorksInfo,
  repoAdd,
  repoNew,
  repoFetch,
  repoInfo,
  repoHealth,
  listRepoHealth,
  workHealth,
  listWorkHealth,
  statusRuntime,
  claudeProjectDirName,
  readSessionTitle,
  findSessionsByName,
  parseInitWorktreeSpec,
  renderBanner,
} from '../src/index';
import { compareVersions, maxVersion } from '../src/semver';
import { resolveBase } from '../src/git';
import type { Work } from '../src/types';

/**
 * Create a fresh temporary directory for a test, returning its path.
 *
 * @returns Absolute path to a unique temp directory.
 */
function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mx-test-'));
}

/**
 * Write a work folder + manifest under a runtime root.
 *
 * @param root - Runtime root.
 * @param work - Work manifest to persist.
 */
function seedWork(root: string, work: Work): void {
  fs.mkdirSync(path.join(root, 'works', work.name), { recursive: true });
  writeWork(root, work);
}

/**
 * Original cwd, restored after tests that chdir for inference checks.
 */
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe('compareVersions / maxVersion', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.5.0', '2.3.0')).toBe(1);
    expect(compareVersions('2.3.0', '2.5.0')).toBe(-1);
    expect(compareVersions('2.5.0', '2.5.0')).toBe(0);
    expect(compareVersions('3.0.0', '2.9.9')).toBe(1);
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1); // numeric, not lexical
    expect(compareVersions('2.1.1', '2.1.0')).toBe(1);
  });

  it('treats missing components as 0 and ignores pre-release/build suffixes', () => {
    expect(compareVersions('2', '2.0.0')).toBe(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
    expect(compareVersions('2.5.0-beta.1', '2.5.0')).toBe(0); // core triple only
  });

  it('maxVersion picks the highest regardless of input order, null when empty', () => {
    // The bug this guards: npm view output is not assumed ascending.
    expect(maxVersion(['2.0.0', '2.5.0', '2.1.1', '2.3.0', '2.4.0'])).toBe('2.5.0');
    expect(maxVersion(['2.5.0', '2.3.0'])).toBe('2.5.0');
    expect(maxVersion(['2.3.0'])).toBe('2.3.0');
    expect(maxVersion([])).toBeNull();
  });
});

describe('repoNameFromUrl', () => {
  it('strips path and .git suffix', () => {
    expect(repoNameFromUrl('git@host:dev/muze-ai.git')).toBe('muze-ai');
    expect(repoNameFromUrl('https://github.com/acme/widgets')).toBe('widgets');
    expect(repoNameFromUrl('/tmp/local/demo')).toBe('demo');
  });
});

describe('nextFreePort', () => {
  it('returns the base when nothing is used', () => {
    expect(nextFreePort(new Map())).toBe(3000);
  });

  it('skips used ports', () => {
    const used = new Map<number, string>([
      [3000, 'a'],
      [3001, 'b'],
    ]);
    expect(nextFreePort(used)).toBe(3002);
  });
});

describe('allocatedPorts + portSet', () => {
  it('scans every work and allocates a free port across works', () => {
    const root = tmp();
    seedWork(root, { name: 'a', description: '', worktrees: [{ repo: 'r', branch: 'a', ports: { web: 3000 } }] });
    seedWork(root, { name: 'b', description: '', worktrees: [{ repo: 'r', branch: 'b', ports: {} }] });

    const used = allocatedPorts(root);
    expect(used.has(3000)).toBe(true);

    // Auto-pick must avoid the 3000 already taken by work "a".
    const res = portSet(root, 'b', 'r', 'web');
    expect(res.port).toBe(3001);
  });

  it('rejects an explicit port already taken by another work', () => {
    const root = tmp();
    seedWork(root, { name: 'a', description: '', worktrees: [{ repo: 'r', branch: 'a', ports: { web: 3000 } }] });
    seedWork(root, { name: 'b', description: '', worktrees: [{ repo: 'r', branch: 'b', ports: {} }] });

    expect(() => portSet(root, 'b', 'r', 'api', 3000)).toThrowError(/already allocated/);
  });
});

describe('readWork / writeWork round-trip', () => {
  it('persists and reads back a manifest', () => {
    const root = tmp();
    const work: Work = {
      name: 'feat',
      description: 'hi',
      worktrees: [{ repo: 'r', branch: 'feat', ports: { web: 3000 } }],
    };
    seedWork(root, work);
    expect(readWork(root, 'feat')).toEqual(work);
  });
});

describe('discoverRuntime', () => {
  it('prefers --runtime, then $MX_RUNTIME, then the ~/mx default', () => {
    const saved = process.env.MX_RUNTIME;
    delete process.env.MX_RUNTIME;
    expect(discoverRuntime({})).toBe(path.join(os.homedir(), 'mx'));
    process.env.MX_RUNTIME = '/tmp/env-runtime';
    expect(discoverRuntime({})).toBe('/tmp/env-runtime');
    expect(discoverRuntime({ runtime: '/tmp/flag-runtime' })).toBe('/tmp/flag-runtime');
    if (saved === undefined) delete process.env.MX_RUNTIME;
    else process.env.MX_RUNTIME = saved;
  });
});

describe('inferContext', () => {
  it('infers work and repo from the cwd', () => {
    const root = tmp();
    // A real worktree has a work.json entry; the wt/<name> segment resolves to
    // its repo via the manifest (name may differ from repo).
    seedWork(root, {
      name: 'feat',
      description: '',
      worktrees: [{ repo: 'repoA', name: 'wt-a', branch: 'x', ports: {} }],
    });
    fs.mkdirSync(path.join(root, 'works', 'feat', 'wt', 'wt-a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'works', 'feat', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'repos', 'repoX'), { recursive: true });

    process.chdir(path.join(root, 'works', 'feat'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: null });

    // Worktrees live under <work>/wt/<name>; the repo is resolved from work.json
    // (here the worktree is named "wt-a" but belongs to repo "repoA").
    process.chdir(path.join(root, 'works', 'feat', 'wt', 'wt-a'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: 'repoA' });

    // A non-wt work subdir (scripts/, bin/, files/, tmp/, sessions/) implies no repo.
    process.chdir(path.join(root, 'works', 'feat', 'scripts'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: null });

    process.chdir(path.join(root, 'repos', 'repoX'));
    expect(inferContext(root)).toEqual({ work: null, repo: 'repoX' });

    process.chdir(os.tmpdir());
    expect(inferContext(root)).toEqual({ work: null, repo: null });
  });
});

describe('context registry stamping', () => {
  // Resolved once: real templates dir shipped in this repo (packages/core/test → repo root → templates).
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('initRuntime stamps context/INDEX.json with an empty array', () => {
    const runtime = path.join(tmp(), 'rt');
    const res = initRuntime(runtime, TEMPLATES_DIR);
    const indexPath = path.join(runtime, 'context', 'INDEX.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(res.created).toContain(indexPath);
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual([]);
  });

  it('initRuntime preserves an existing context/INDEX.json (user content)', () => {
    const runtime = path.join(tmp(), 'rt');
    fs.mkdirSync(path.join(runtime, 'context'), { recursive: true });
    const existing = [
      { path: 'auth/tokens', description: 'pre-existing entry — must not be clobbered' },
    ];
    fs.writeFileSync(path.join(runtime, 'context', 'INDEX.json'), JSON.stringify(existing));
    const res = initRuntime(runtime, TEMPLATES_DIR);
    const idx = JSON.parse(fs.readFileSync(path.join(runtime, 'context', 'INDEX.json'), 'utf8'));
    expect(idx).toEqual(existing);
    expect(res.created).not.toContain(path.join(runtime, 'context', 'INDEX.json'));
  });

  it('syncRuntime creates context/INDEX.json when the runtime has no context/ yet', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    // Simulate an "old" runtime without the context registry.
    fs.rmSync(path.join(runtime, 'context'), { recursive: true, force: true });
    const res = syncRuntime(runtime, TEMPLATES_DIR);
    const indexPath = path.join(runtime, 'context', 'INDEX.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(res.updated).toContain(indexPath);
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual([]);
  });

  it('syncRuntime preserves an existing context/INDEX.json', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    const existing = [
      { path: 'infra/cell/guide', description: 'how cell deploys work' },
    ];
    const indexPath = path.join(runtime, 'context', 'INDEX.json');
    fs.writeFileSync(indexPath, JSON.stringify(existing));
    const res = syncRuntime(runtime, TEMPLATES_DIR);
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual(existing);
    expect(res.updated).not.toContain(indexPath);
  });

  it('syncRuntime backfills missing per-work sessions/ without touching user data', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    // Create two works; simulate a "pre-v1.2.0" state by removing sessions/.
    workNew(runtime, 'feat-a');
    workNew(runtime, 'feat-b');
    const sessionsA = path.join(runtime, 'works', 'feat-a', 'sessions');
    const sessionsB = path.join(runtime, 'works', 'feat-b', 'sessions');
    fs.rmSync(sessionsA, { recursive: true });
    fs.rmSync(sessionsB, { recursive: true });
    expect(fs.existsSync(sessionsA)).toBe(false);
    expect(fs.existsSync(sessionsB)).toBe(false);

    // Capture user data BEFORE update so we can verify it's untouched.
    const manifestA = path.join(runtime, 'works', 'feat-a', 'work.json');
    const workspaceA = path.join(runtime, 'works', 'feat-a', 'feat-a.code-workspace');
    const manifestSnapshot = fs.readFileSync(manifestA, 'utf8');
    const workspaceSnapshot = fs.readFileSync(workspaceA, 'utf8');

    const res = syncRuntime(runtime, TEMPLATES_DIR);
    expect(fs.existsSync(sessionsA)).toBe(true);
    expect(fs.existsSync(sessionsB)).toBe(true);
    expect(res.updated).toContain(sessionsA);
    expect(res.updated).toContain(sessionsB);

    // User data untouched.
    expect(fs.readFileSync(manifestA, 'utf8')).toBe(manifestSnapshot);
    expect(fs.readFileSync(workspaceA, 'utf8')).toBe(workspaceSnapshot);
  });

  it('statusRuntime surfaces context entry count and per-work session count', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);

    // Seed context entries
    fs.writeFileSync(
      path.join(runtime, 'context', 'INDEX.json'),
      JSON.stringify([
        { path: 'auth/tokens', description: 'session token semantics' },
        { path: 'ops/runbook', description: 'how to deploy' },
        { path: 'infra/cell', description: 'cell topology' },
      ]),
    );

    // Two works, one with sessions on disk
    workNew(runtime, 'feat-a');
    workNew(runtime, 'feat-b');
    const sessionsA = path.join(runtime, 'works', 'feat-a', 'sessions');
    fs.writeFileSync(path.join(sessionsA, '2026-06-07-10-00-x.md'), '');
    fs.writeFileSync(path.join(sessionsA, '2026-06-07-11-00-y.md'), '');
    // Non-md file should not be counted
    fs.writeFileSync(path.join(sessionsA, 'README'), '');

    const status = statusRuntime(runtime);
    expect(status.context.entries).toBe(3);

    const a = status.works.find((w) => w.name === 'feat-a');
    const b = status.works.find((w) => w.name === 'feat-b');
    expect(a?.sessions).toBe(2);
    expect(b?.sessions).toBe(0);
  });

  it('statusRuntime defaults to active-only works but always exposes archivedWorksCount', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);

    workNew(runtime, 'feat-a');
    workNew(runtime, 'feat-b');
    workNew(runtime, 'feat-archived');
    // Cheap mark-as-archived directly on the manifest — no worktrees to remove.
    const archivedManifest = path.join(runtime, 'works', 'feat-archived', 'work.json');
    const m = JSON.parse(fs.readFileSync(archivedManifest, 'utf8'));
    m.isArchived = true;
    m.archived_at = '2026-06-01T00:00:00Z';
    fs.writeFileSync(archivedManifest, JSON.stringify(m));

    // Default: archived is hidden in the works array.
    const defaultStatus = statusRuntime(runtime);
    expect(defaultStatus.works.map((w) => w.name).sort()).toEqual(['feat-a', 'feat-b']);
    expect(defaultStatus.archivedWorksCount).toBe(1);

    // includeArchived: true → archived appears alongside active.
    const expanded = statusRuntime(runtime, { includeArchived: true });
    expect(expanded.works.map((w) => w.name).sort()).toEqual([
      'feat-a',
      'feat-archived',
      'feat-b',
    ]);
    expect(expanded.archivedWorksCount).toBe(1);

    // onlyArchived: true → only archived.
    const onlyArch = statusRuntime(runtime, { onlyArchived: true });
    expect(onlyArch.works.map((w) => w.name)).toEqual(['feat-archived']);
    expect(onlyArch.archivedWorksCount).toBe(1);
  });

  it('statusRuntime returns context.entries=0 when INDEX.json is missing or malformed', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    fs.rmSync(path.join(runtime, 'context', 'INDEX.json'));
    expect(statusRuntime(runtime).context.entries).toBe(0);

    // Recreate as not-an-array; should still return 0 (best-effort).
    fs.writeFileSync(
      path.join(runtime, 'context', 'INDEX.json'),
      JSON.stringify({ entries: [{ path: 'x', description: 'y' }] }),
    );
    expect(statusRuntime(runtime).context.entries).toBe(0);
  });

  it('syncRuntime does not re-create per-work sessions/ that already exists', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    workNew(runtime, 'feat');
    const sessions = path.join(runtime, 'works', 'feat', 'sessions');
    // Add a real session file; it must survive untouched.
    const note = path.join(sessions, '2026-06-06-12-00-existing.md');
    fs.writeFileSync(note, '# preexisting note\n');
    const before = fs.readFileSync(note, 'utf8');

    const res = syncRuntime(runtime, TEMPLATES_DIR);
    expect(res.updated).not.toContain(sessions);
    expect(fs.readFileSync(note, 'utf8')).toBe(before);
  });
});

describe('resolveBase', () => {
  it('resolves a bare branch name via the origin fallback in a fresh clone', () => {
    const src = tmp();
    const run = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
    run(src, ['init', '-q', '-b', 'main']);
    run(src, ['config', 'user.email', 't@t.t']);
    run(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    run(src, ['add', '-A']);
    run(src, ['commit', '-qm', 'init']);
    run(src, ['branch', 'feature-base']);

    const clone = path.join(tmp(), 'clone');
    execFileSync('git', ['clone', '-q', src, clone], { stdio: 'ignore' });

    // "feature-base" only exists as origin/feature-base in the fresh clone.
    expect(resolveBase(clone, 'feature-base')).toMatch(/^[0-9a-f]{40}$/);
    expect(resolveBase(clone, 'main')).toMatch(/^[0-9a-f]{40}$/);
    expect(resolveBase(clone, 'no-such-ref')).toBeNull();
  });
});

describe('archive / unarchive / destroy lifecycle', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  /**
   * Build a runtime with a pristine clone and a single work with one worktree
   * on a branch named after the work. Returns the runtime root and the source
   * git repo path (so tests can mutate branches there to simulate "branch gone").
   */
  function fixture(): { root: string; src: string; repoName: string; workName: string } {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);

    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, src, 'app');
    workNew(root, 'feat', 'a feature');
    worktreeAdd(root, 'feat', 'app', { branch: 'feat' });
    return { root, src, repoName: 'app', workName: 'feat' };
  }

  it('workNew creates an empty sessions/ folder', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    const sessions = path.join(res.path, 'sessions');
    expect(fs.existsSync(sessions)).toBe(true);
    expect(fs.statSync(sessions).isDirectory()).toBe(true);
    expect(fs.readdirSync(sessions)).toEqual([]);
  });

  it('archive removes worktrees, empties .code-workspace folders, sets isArchived + archived_at', () => {
    const { root, workName } = fixture();
    const wtDir = path.join(root, 'works', workName, 'wt', 'app');
    const wsFile = path.join(root, 'works', workName, `${workName}.code-workspace`);
    expect(fs.existsSync(wtDir)).toBe(true);
    expect(JSON.parse(fs.readFileSync(wsFile, 'utf8')).folders).toHaveLength(1);

    const res = archiveWork(root, workName);
    expect(res.removedWorktrees).toEqual(['app']);
    expect(fs.existsSync(wtDir)).toBe(false);
    expect(JSON.parse(fs.readFileSync(wsFile, 'utf8')).folders).toEqual([]);
    const w = readWork(root, workName);
    expect(w.isArchived).toBe(true);
    expect(w.archived_at).toBe(res.archived_at);
    // worktree entry retained in manifest so unarchive can rebuild from it.
    expect(w.worktrees.map((wt) => wt.repo)).toEqual(['app']);
  });

  it('archive refuses when already archived', () => {
    const { root, workName } = fixture();
    archiveWork(root, workName);
    expect(() => archiveWork(root, workName)).toThrow(/already archived/);
  });

  it('archive refuses on uncommitted changes', () => {
    const { root, workName } = fixture();
    const wt = path.join(root, 'works', workName, 'wt', 'app');
    fs.writeFileSync(path.join(wt, 'dirty.txt'), 'unstaged work');
    expect(() => archiveWork(root, workName)).toThrow(/uncommitted changes/);
    // Work remains active.
    expect(readWork(root, workName).isArchived).not.toBe(true);
  });

  it('unarchive restores worktrees from recorded branches and clears archived state', () => {
    const { root, workName } = fixture();
    archiveWork(root, workName);
    const res = unarchiveWork(root, workName);
    expect(res.restored).toHaveLength(1);
    expect(res.restored[0]).toMatchObject({ repo: 'app', branch: 'feat' });
    expect(fs.existsSync(path.join(root, 'works', workName, 'wt', 'app'))).toBe(true);

    const wsFile = path.join(root, 'works', workName, `${workName}.code-workspace`);
    expect(JSON.parse(fs.readFileSync(wsFile, 'utf8')).folders).toHaveLength(1);

    const w = readWork(root, workName);
    expect(w.isArchived).toBe(false);
    expect(w.archived_at).toBeUndefined();
  });

  it('unarchive errors with a branch-list hint when the recorded branch is gone', () => {
    const { root, workName } = fixture();
    archiveWork(root, workName);
    // Delete the feature branch from the pristine clone so unarchive can't find it.
    runGit(path.join(root, 'repos', 'app', 'git'), ['branch', '-D', 'feat']);
    let err: unknown;
    try {
      unarchiveWork(root, workName);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const msg = (err as Error).message;
    expect(msg).toMatch(/branch\(es\) not found/);
    expect(msg).toMatch(/app=feat/);
    expect(msg).toMatch(/unarchive app=<branch>/);
  });

  it('unarchive applies repo=branch overrides and updates the manifest', () => {
    const { root, workName } = fixture();
    // Create a distinct branch in the pristine clone for the override.
    // (`main` is checked out there, so git won't allow a worktree-add of `main`.)
    runGit(path.join(root, 'repos', 'app', 'git'), ['branch', 'alt']);
    archiveWork(root, workName);
    runGit(path.join(root, 'repos', 'app', 'git'), ['branch', '-D', 'feat']);
    const res = unarchiveWork(root, workName, { app: 'alt' });
    expect(res.restored[0].branch).toBe('alt');
    const w = readWork(root, workName);
    expect(w.isArchived).toBe(false);
    expect(w.worktrees[0].branch).toBe('alt');
  });

  it('unarchive refuses when the work is not archived', () => {
    const { root, workName } = fixture();
    expect(() => unarchiveWork(root, workName)).toThrow(/not archived/);
  });

  it('destroy without --force errors and leaves everything intact', () => {
    const { root, workName } = fixture();
    expect(() => workDestroy(root, workName)).toThrow(/Use `mx work archive`/);
    expect(fs.existsSync(path.join(root, 'works', workName))).toBe(true);
  });

  it('destroy --force removes the work folder', () => {
    const { root, workName } = fixture();
    const res = workDestroy(root, workName, { force: true });
    expect(res.removedWorktrees).toEqual(['app']);
    expect(fs.existsSync(path.join(root, 'works', workName))).toBe(false);
  });

  it('listWorksInfo filters archived by default and respects --all / --archived', () => {
    const { root } = fixture();
    // Add a second work and archive it.
    workNew(root, 'feat2');
    worktreeAdd(root, 'feat2', 'app', { branch: 'feat2' });
    archiveWork(root, 'feat2');

    expect(listWorksInfo(root).map((w) => w.name)).toEqual(['feat']);
    expect(listWorksInfo(root, { includeArchived: true }).map((w) => w.name).sort()).toEqual([
      'feat',
      'feat2',
    ]);
    const onlyArchived = listWorksInfo(root, { onlyArchived: true });
    expect(onlyArchived.map((w) => w.name)).toEqual(['feat2']);
    expect(onlyArchived[0].isArchived).toBe(true);
    expect(onlyArchived[0].archived_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('worktreeSetBranch', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  /**
   * Build a runtime with a pristine clone and a work holding one worktree of
   * `app` on branch `feat`. Returns the runtime root and the worktree path so
   * tests can `git checkout` inside it to simulate a manual branch switch.
   */
  function fixture(): { root: string; wtDir: string; workName: string } {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);

    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, src, 'app');
    workNew(root, 'feat', 'a feature');
    worktreeAdd(root, 'feat', 'app', { branch: 'feat' });
    return { root, wtDir: path.join(root, 'works', 'feat', 'wt', 'app'), workName: 'feat' };
  }

  it('records the worktree live branch after a manual checkout', () => {
    const { root, wtDir } = fixture();
    // Simulate the user switching branches by hand inside the worktree.
    runGit(wtDir, ['checkout', '-q', '-b', 'other']);
    const res = worktreeSetBranch(root, 'feat', 'app');
    expect(res).toMatchObject({ branch: 'other', previous: 'feat', changed: true });
    expect(readWork(root, 'feat').worktrees[0].branch).toBe('other');
  });

  it('is idempotent when the branch already matches (changed=false)', () => {
    const { root } = fixture();
    const res = worktreeSetBranch(root, 'feat', 'app');
    expect(res).toMatchObject({ branch: 'feat', previous: 'feat', changed: false });
    expect(readWork(root, 'feat').worktrees[0].branch).toBe('feat');
  });

  it('accepts a matching guard argument', () => {
    const { root, wtDir } = fixture();
    runGit(wtDir, ['checkout', '-q', '-b', 'other']);
    const res = worktreeSetBranch(root, 'feat', 'app', 'other');
    expect(res.branch).toBe('other');
  });

  it('rejects a guard argument that does not match the live branch', () => {
    const { root } = fixture();
    // Worktree is on `feat`, but the caller claims `wrong`.
    expect(() => worktreeSetBranch(root, 'feat', 'app', 'wrong')).toThrow(/is on "feat", not "wrong"/);
    // Nothing was written.
    expect(readWork(root, 'feat').worktrees[0].branch).toBe('feat');
  });

  it('errors on an unknown worktree', () => {
    const { root } = fixture();
    expect(() => worktreeSetBranch(root, 'feat', 'nope')).toThrow(/no worktree named "nope"/);
  });

  it('errors when the worktree is in detached HEAD', () => {
    const { root, wtDir } = fixture();
    const sha = execFileSync('git', ['-C', wtDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    runGit(wtDir, ['checkout', '-q', sha]); // detach
    expect(() => worktreeSetBranch(root, 'feat', 'app')).toThrow(/detached HEAD/);
  });

  it('errors when the worktree is not on disk (archived work)', () => {
    const { root } = fixture();
    archiveWork(root, 'feat');
    expect(() => worktreeSetBranch(root, 'feat', 'app')).toThrow(/not on disk/);
  });
});

describe('renderBanner (mx divider)', () => {
  it('returns exactly `rows` lines, none wider than `cols`', () => {
    const rows = 24;
    const cols = 80;
    const lines = renderBanner('IN REVIEWS', cols, rows).split('\n');
    expect(lines).toHaveLength(rows);
    expect(Math.max(...lines.map((l) => [...l].length))).toBeLessThanOrEqual(cols);
  });

  it('draws the text with block characters', () => {
    const out = renderBanner('HI', 80, 24);
    expect(out).toContain('█');
  });

  it('is blank for empty text (no block characters)', () => {
    const out = renderBanner('', 80, 24);
    expect(out).not.toContain('█');
    expect(out.split('\n')).toHaveLength(24);
  });

  it('does not throw on unsupported characters (fall back to ?)', () => {
    expect(() => renderBanner('A~B', 80, 24)).not.toThrow();
    expect(renderBanner('A~B', 80, 24)).toContain('█');
  });

  it('scales down to still fit a very small terminal', () => {
    const cols = 20;
    const rows = 10;
    const lines = renderBanner('PR REVIEWS', cols, rows).split('\n');
    expect(lines).toHaveLength(rows);
  });

  it('stacks on a literal \\n and fills more height than the same text on one line', () => {
    const filled = (s: string): number =>
      renderBanner(s, 200, 50).split('\n').filter((l) => l.includes('█')).length;
    // Two stacked words use more vertical band than one wide single line.
    expect(filled('IN\\nREVIEWS')).toBeGreaterThan(filled('IN REVIEWS'));
  });

  it('stacks on a real newline the same as the literal \\n', () => {
    expect(renderBanner('A\nB', 120, 40)).toBe(renderBanner('A\\nB', 120, 40));
  });

  it('respects spaces literally (does not collapse runs)', () => {
    // Extra spaces widen the line, so at a fixed size the scale differs.
    expect(renderBanner('A B', 60, 20)).not.toBe(renderBanner('A   B', 60, 20));
  });
});

describe('parseInitWorktreeSpec (mx work new initial worktrees)', () => {
  it('parses a bare repo with no branch or base', () => {
    expect(parseInitWorktreeSpec('app')).toEqual({ repo: 'app' });
  });

  it('parses <repo>:<branch>', () => {
    expect(parseInitWorktreeSpec('app:hotfix')).toEqual({ repo: 'app', branch: 'hotfix' });
    expect(parseInitWorktreeSpec('app:feature-x')).toEqual({ repo: 'app', branch: 'feature-x' });
  });

  it('parses <repo>:<branch>:<base>', () => {
    expect(parseInitWorktreeSpec('muze-ai:feat:app_ib_dev')).toEqual({
      repo: 'muze-ai',
      branch: 'feat',
      base: 'app_ib_dev',
    });
  });

  it('treats an empty branch segment as "default branch" (app::base)', () => {
    expect(parseInitWorktreeSpec('app::develop')).toEqual({ repo: 'app', base: 'develop' });
  });

  it('treats trailing empty segments as "fall back to default"', () => {
    expect(parseInitWorktreeSpec('app:')).toEqual({ repo: 'app' });
    expect(parseInitWorktreeSpec('app::')).toEqual({ repo: 'app' });
  });

  it('rejects an empty repo or too many segments', () => {
    expect(() => parseInitWorktreeSpec(':branch')).toThrow(/bad repo spec/);
    expect(() => parseInitWorktreeSpec('')).toThrow(/bad repo spec/);
    expect(() => parseInitWorktreeSpec('a:b:c:d')).toThrow(/bad repo spec/);
  });
});

describe('claudeSessions (mx work open session discovery)', () => {
  /**
   * Write a minimal Claude transcript file for a test fixture at
   * <projectsRoot>/<projectDir>/<sid>.jsonl.
   *
   * @param projectsRoot - Fake Claude projects root (temp dir).
   * @param projectDir - Encoded project dir name the transcript lives under.
   * @param sid - Session id (becomes the filename and is echoed in records).
   * @param titles - custom-title values applied in order (last = current name); empty for an unnamed session.
   * @param cwd - The cwd recorded on the transcript's message line.
   * @returns Absolute path to the written transcript.
   */
  function writeTranscript(
    projectsRoot: string,
    projectDir: string,
    sid: string,
    titles: string[],
    cwd: string,
  ): string {
    const dir = path.join(projectsRoot, projectDir);
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
      JSON.stringify({ type: 'user', cwd, sessionId: sid, message: 'hi' }),
      ...titles.map((t) => JSON.stringify({ type: 'custom-title', customTitle: t, sessionId: sid })),
    ];
    const file = path.join(dir, `${sid}.jsonl`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
  }

  it('claudeProjectDirName replaces / and . (and other non [A-Za-z0-9-]) with -', () => {
    expect(claudeProjectDirName('/Users/rousan.ali/mx/works/dev-mx')).toBe(
      '-Users-rousan-ali-mx-works-dev-mx',
    );
    expect(claudeProjectDirName('/private/tmp/a_b.c')).toBe('-private-tmp-a-b-c');
  });

  it('readSessionTitle returns the LAST custom-title (a rename wins)', () => {
    const root = tmp();
    const work = '/w/feat';
    const proj = claudeProjectDirName(work);
    const file = writeTranscript(root, proj, 'sid1', ['auto-name', 'feat'], work);
    expect(readSessionTitle(file)).toBe('feat');
  });

  it('readSessionTitle returns null for an unnamed or missing transcript', () => {
    const root = tmp();
    const work = '/w/feat';
    const proj = claudeProjectDirName(work);
    const file = writeTranscript(root, proj, 'sid1', [], work);
    expect(readSessionTitle(file)).toBeNull();
    expect(readSessionTitle(path.join(root, 'nope.jsonl'))).toBeNull();
  });

  it('findSessionsByName matches EXACTLY (excludes numbered variants) and is scoped to the work', () => {
    const root = tmp();
    const work = '/Users/x/mx/works/feat';
    const proj = claudeProjectDirName(work);
    writeTranscript(root, proj, 'sid-base', ['feat'], work);
    writeTranscript(root, proj, 'sid-two', ['feat-2'], work); // numbered variant, must NOT match
    // A same-named session under a DIFFERENT work's project dir must be ignored.
    const other = '/Users/x/mx/works/other';
    writeTranscript(root, claudeProjectDirName(other), 'sid-other', ['feat'], other);

    const matches = findSessionsByName(root, work, 'feat');
    expect(matches.map((m) => m.id)).toEqual(['sid-base']);
  });

  it('findSessionsByName returns [] when the project dir does not exist', () => {
    const root = tmp();
    expect(findSessionsByName(root, '/w/never-opened', 'x')).toEqual([]);
  });

  it('findSessionsByName returns all duplicates newest-first (the ambiguous case)', () => {
    const root = tmp();
    const work = '/w/dup';
    const proj = claudeProjectDirName(work);
    const older = writeTranscript(root, proj, 'sid-old', ['dup'], work);
    const newer = writeTranscript(root, proj, 'sid-new', ['dup'], work);
    // Force a deterministic mtime ordering (older < newer).
    fs.utimesSync(older, new Date(1000), new Date(1000));
    fs.utimesSync(newer, new Date(2000), new Date(2000));

    const matches = findSessionsByName(root, work, 'dup');
    expect(matches.map((m) => m.id)).toEqual(['sid-new', 'sid-old']);
  });
});

describe('no per-work SessionStart context-index hook (v3)', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('workNew does not stamp a .claude/settings.json hook', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    expect(fs.existsSync(path.join(res.path, '.claude', 'settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(res.path, '.claude'))).toBe(false);
  });

  it('syncRuntime does not create a .claude/settings.json hook', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    workNew(root, 'feat');
    const res = syncRuntime(root, TEMPLATES_DIR);
    const settingsPath = path.join(root, 'works', 'feat', '.claude', 'settings.json');
    expect(res.updated).not.toContain(settingsPath);
    expect(fs.existsSync(settingsPath)).toBe(false);
  });
});

describe('runtime files directory', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('initRuntime creates an empty files/ store', () => {
    const root = path.join(tmp(), 'rt');
    const res = initRuntime(root, TEMPLATES_DIR);
    const filesDir = runtimeFilesDir(root);
    expect(res.created).toContain(filesDir);
    expect(fs.existsSync(filesDir)).toBe(true);
    expect(fs.statSync(filesDir).isDirectory()).toBe(true);
    // Empty by default — agents own the contents.
    expect(fs.readdirSync(filesDir)).toEqual([]);
  });

  it('syncRuntime backfills files/ when missing (predates the feature)', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const filesDir = runtimeFilesDir(root);
    fs.rmSync(filesDir, { recursive: true, force: true });
    expect(fs.existsSync(filesDir)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(filesDir);
    expect(fs.existsSync(filesDir)).toBe(true);
  });

  it('syncRuntime leaves an existing files/ and its contents untouched', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const filesDir = runtimeFilesDir(root);
    const secret = path.join(filesDir, 'creds.env');
    fs.writeFileSync(secret, 'API_TOKEN=abc123\n');
    const res = syncRuntime(root, TEMPLATES_DIR);
    // Already present -> not reported as created, and the content is preserved.
    expect(res.updated).not.toContain(filesDir);
    expect(fs.readFileSync(secret, 'utf8')).toBe('API_TOKEN=abc123\n');
  });
});

describe('runtime bin directory', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('initRuntime stamps bin/ with the shipped utility bins, executable', () => {
    const root = path.join(tmp(), 'rt');
    const res = initRuntime(root, TEMPLATES_DIR);
    const binDir = runtimeBinDir(root);
    expect(res.created).toContain(binDir);
    const bins = listRuntimeBins(root);
    const names = bins.map((b) => b.name);
    // Whatever ships in templates/bin should land here (currently dcs + lcs).
    expect(names).toContain('dcs');
    expect(names).toContain('lcs');
    expect(names).toEqual([...names].sort()); // sorted
    expect(bins.every((b) => b.executable)).toBe(true);
  });

  it('listRuntimeBins is empty when there is no bin/ directory', () => {
    const root = tmp(); // bare dir, never inited
    expect(listRuntimeBins(root)).toEqual([]);
  });

  it('syncRuntime backfills bin/ when missing', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const binDir = runtimeBinDir(root);
    // Simulate a pre-bin runtime: remove bin/ entirely.
    fs.rmSync(binDir, { recursive: true, force: true });
    expect(fs.existsSync(binDir)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(path.join(binDir, 'dcs'));
    expect(fs.existsSync(path.join(binDir, 'dcs'))).toBe(true);
  });

  it('syncRuntime re-stamps shipped bins (overwrites) but leaves user bins alone', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const binDir = runtimeBinDir(root);
    const tmplDcs = fs.readFileSync(path.join(TEMPLATES_DIR, 'bin', 'dcs'), 'utf8');
    // Edit a shipped bin (dcs) and add a user-owned bin (mytool).
    fs.writeFileSync(path.join(binDir, 'dcs'), 'edited\n');
    fs.writeFileSync(path.join(binDir, 'mytool'), 'user-content\n');

    const res = syncRuntime(root, TEMPLATES_DIR);
    // Shipped bin is mx-owned: always re-stamped back to the template content.
    expect(res.updated).toContain(path.join(binDir, 'dcs'));
    expect(fs.readFileSync(path.join(binDir, 'dcs'), 'utf8')).toBe(tmplDcs);
    // User bin is never touched.
    expect(res.updated).not.toContain(path.join(binDir, 'mytool'));
    expect(fs.readFileSync(path.join(binDir, 'mytool'), 'utf8')).toBe('user-content\n');
  });
});

describe('repoNew (local repo)', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('creates a local repo on main with a committed README and no remote', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = repoNew(root, 'exp');
    expect(res.name).toBe('exp');
    expect(res.remote).toBeNull();
    expect(res.branch).toBe('main');
    expect(res.path).toBe(path.join(root, 'repos', 'exp'));
    // Clone lives at repos/<name>/git, on main, with an initial commit.
    const gitdir = repoGitDir(root, 'exp');
    expect(fs.existsSync(path.join(gitdir, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(gitdir, 'README.md'))).toBe(true);
    const log = execFileSync('git', ['-C', gitdir, 'log', '--oneline'], { encoding: 'utf8' });
    expect(log.trim().split('\n')).toHaveLength(1);
    expect(repoInfo(root, 'exp').branch).toBe('main');
  });

  it('refuses an existing repo and rejects an invalid name', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoNew(root, 'exp');
    expect(() => repoNew(root, 'exp')).toThrow(/already exists/);
    expect(() => repoNew(root, 'a/b')).toThrow(/invalid repo name/);
  });

  it('a fresh local repo supports a work + worktree (forks main onto a branch)', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoNew(root, 'exp');
    workNew(root, 'exp');
    const wt = worktreeAdd(root, 'exp', 'exp', {}); // branch defaults to work name
    expect(wt.branch).toBe('exp');
    expect(fs.existsSync(path.join(wt.path, 'README.md'))).toBe(true); // forked from main
    const branch = execFileSync('git', ['-C', wt.path, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(branch).toBe('exp');
    // Pristine stays on main, so `mx repo health` won't flag a detached HEAD.
    expect(repoInfo(root, 'exp').branch).toBe('main');
  });

  it('--no-readme makes an empty initial commit so main still exists', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = repoNew(root, 'bare', { readme: false });
    expect(res.branch).toBe('main');
    const gitdir = repoGitDir(root, 'bare');
    expect(fs.existsSync(path.join(gitdir, 'README.md'))).toBe(false);
    // main exists (the commit created it), so a worktree can fork it.
    workNew(root, 'bare');
    expect(() => worktreeAdd(root, 'bare', 'bare', {})).not.toThrow();
  });
});

describe('work scaffolding has no per-work bin/', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('workNew does not create a per-work bin/ (use scripts/ instead)', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    expect(fs.existsSync(path.join(res.path, 'bin'))).toBe(false);
    expect(fs.existsSync(path.join(res.path, 'scripts'))).toBe(true);
  });
});

describe('multiple worktrees of one repo', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  /** A runtime with one local repo "app" and an empty work "feat". */
  function fixture(): { root: string } {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);
    repoAdd(root, src, 'app');
    workNew(root, 'feat');
    return { root };
  }

  it('every worktree records name (= repo by default) and lives at wt/<name>', () => {
    const { root } = fixture();
    const res = worktreeAdd(root, 'feat', 'app', { branch: 'b1' });
    expect(res.name).toBe('app');
    expect(res.path).toBe(path.join(root, 'works', 'feat', 'wt', 'app'));
    const wt = readWork(root, 'feat').worktrees[0];
    expect(wt.name).toBe('app'); // explicit even when == repo
    expect(worktreeName(wt)).toBe('app');
  });

  it('a second worktree of the same repo needs a distinct name', () => {
    const { root } = fixture();
    worktreeAdd(root, 'feat', 'app', { branch: 'b1' });
    // Same repo, no name → collides on the default name and errors with a hint.
    expect(() => worktreeAdd(root, 'feat', 'app', { branch: 'b2' })).toThrow(/give the new one a name/);
    // With a distinct name it succeeds, at its own dir, on its own branch.
    const res = worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b2' });
    expect(res.name).toBe('app-2');
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app-2', 'f.txt'))).toBe(true);
    const wts = readWork(root, 'feat').worktrees;
    expect(wts.map((w) => worktreeName(w)).sort()).toEqual(['app', 'app-2']);
    expect(wts.every((w) => w.repo === 'app')).toBe(true);
    // Reusing an existing name errors too.
    expect(() => worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b3' })).toThrow(/already has a worktree named/);
  });

  it('rejects an invalid worktree name', () => {
    const { root } = fixture();
    expect(() => worktreeAdd(root, 'feat', 'app', { name: 'a/b' })).toThrow(/invalid worktree name/);
  });

  it('rm targets one worktree by name, leaving the other', () => {
    const { root } = fixture();
    worktreeAdd(root, 'feat', 'app', { branch: 'b1' });
    worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b2' });
    const res = worktreeRemove(root, 'feat', 'app-2');
    expect(res.name).toBe('app-2');
    expect(res.repo).toBe('app');
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app-2'))).toBe(false);
    expect(worktreeList(root, 'feat').map((w) => worktreeName(w))).toEqual(['app']);
  });

  it('ports are independent per worktree (same service name, distinct ports)', () => {
    const { root } = fixture();
    worktreeAdd(root, 'feat', 'app', { branch: 'b1' });
    worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b2' });
    const p1 = portSet(root, 'feat', 'app', 'web');
    const p2 = portSet(root, 'feat', 'app-2', 'web');
    expect(p1.port).not.toBe(p2.port); // not a self-collision across worktrees
    expect(p2.name).toBe('app-2');
    // portList is keyed by worktree name, so the two don't clobber each other.
    const list = portList(root, 'feat');
    expect(list['app'].web).toBe(p1.port);
    expect(list['app-2'].web).toBe(p2.port);
    // Re-setting the same slot is idempotent (no self-collision).
    expect(portSet(root, 'feat', 'app', 'web', p1.port).port).toBe(p1.port);
    portUnset(root, 'feat', 'app-2', 'web');
    expect(portList(root, 'feat')['app-2'].web).toBeUndefined();
  });

  it('archive then unarchive restores every worktree at its name and branch', () => {
    const { root } = fixture();
    worktreeAdd(root, 'feat', 'app', { branch: 'b1' });
    worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b2' });
    portSet(root, 'feat', 'app-2', 'web', 4321);

    const arch = archiveWork(root, 'feat');
    expect(arch.removedWorktrees.sort()).toEqual(['app', 'app-2']);
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app'))).toBe(false);
    // Archive FREES the ports — the archived manifest carries none, so the
    // number is reusable while archived.
    expect(readWork(root, 'feat').worktrees.every((w) => Object.keys(w.ports).length === 0)).toBe(true);
    expect([...allocatedPorts(root).values()].length).toBe(0);

    const un = unarchiveWork(root, 'feat');
    expect(un.restored.map((r) => r.name).sort()).toEqual(['app', 'app-2']);
    const byName = Object.fromEntries(un.restored.map((r) => [r.name, r]));
    expect(byName['app-2'].branch).toBe('b2');
    expect(byName['app-2'].ports).toEqual({}); // freed on archive; re-allocate via hook
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app-2', 'f.txt'))).toBe(true);
    // Branch is correct in each restored worktree.
    const b = execFileSync('git', ['-C', byName['app-2'].path, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(b).toBe('b2');
  });

  it('back-compat: a name-less (v2-style) work.json still works', () => {
    const { root } = fixture();
    // Hand-write a v2-shape entry (no `name`) + create its worktree on disk.
    const work = readWork(root, 'feat');
    runGit(repoGitDir(root, 'app'), ['worktree', 'add', '-q', '-b', 'b1',
      path.join(root, 'works', 'feat', 'wt', 'app')]);
    work.worktrees.push({ repo: 'app', branch: 'b1', ports: { web: 3999 } } as never);
    writeWork(root, work);

    const wt = readWork(root, 'feat').worktrees[0];
    expect(wt.name).toBeUndefined();
    expect(worktreeName(wt)).toBe('app'); // defaults to repo
    expect(findWorktreeByName(readWork(root, 'feat'), 'app')?.repo).toBe('app');
    expect(portList(root, 'feat')['app'].web).toBe(3999); // keyed by effective name
    // A second worktree of the same repo can still be added alongside it.
    const res = worktreeAdd(root, 'feat', 'app', { name: 'app-2', branch: 'b2' });
    expect(res.name).toBe('app-2');
  });
});

describe('central hooks hub', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('initRuntime stamps hooks/ with every shipped event, executable', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    expect(fs.existsSync(path.join(root, 'hooks'))).toBe(true);
    for (const event of HOOK_EVENTS) {
      const hook = hookScript(root, event);
      expect(fs.existsSync(hook)).toBe(true);
      expect((fs.statSync(hook).mode & 0o111) !== 0).toBe(true); // executable
      expect(fs.readFileSync(hook, 'utf8')).toContain(`mx hook: ${event}`);
    }
    // Includes the renamed/centralized events.
    expect(HOOK_EVENTS).toContain('post-worktree-create');
    expect(HOOK_EVENTS).toContain('repo-health');
  });

  it('syncRuntime backfills hooks/ stamp-if-missing, never clobbering user logic', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const hook = hookScript(root, 'post-worktree-create');
    fs.rmSync(hook);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(hook);
    expect(fs.existsSync(hook)).toBe(true);
    // A user edit survives a second sync (hooks are never overwritten).
    fs.writeFileSync(hook, '#!/usr/bin/env bash\nexit 1\n');
    const res2 = syncRuntime(root, TEMPLATES_DIR);
    expect(res2.updated).not.toContain(hook);
    expect(fs.readFileSync(hook, 'utf8')).toBe('#!/usr/bin/env bash\nexit 1\n');
  });

  it('workNew no longer creates a per-work hooks/ directory', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    expect(fs.existsSync(path.join(res.path, 'hooks'))).toBe(false);
  });
});

describe('repo.json + central repo-health hook', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  function srcRepo(): string {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    runGit(src, ['commit', '-qm', 'init', '--allow-empty']);
    return src;
  }

  it('repoAdd writes repo.json and no per-repo scripts', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app');
    expect(fs.existsSync(repoConfigFile(root, 'app'))).toBe(true);
    expect(readRepoConfig(root, 'app')?.name).toBe('app');
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'hydrate.sh'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'health.sh'))).toBe(false);
  });

  it('syncRuntime backfills repo.json for a repo that lacks it', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app');
    fs.rmSync(repoConfigFile(root, 'app'));
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(repoConfigFile(root, 'app'));
    expect(readRepoConfig(root, 'app')?.name).toBe('app');
  });

  it('repoHealth.extra captures the central repo-health hook stdout', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app');
    // The shipped repo-health hook is a no-op (no stdout) → null.
    expect(repoHealth(root, 'app').extra).toBeNull();
    // Replace it with one that prints; its output is captured.
    const hook = hookScript(root, 'repo-health');
    fs.writeFileSync(hook, '#!/usr/bin/env bash\necho "node_modules: present"\n');
    fs.chmodSync(hook, 0o755);
    expect(repoHealth(root, 'app').extra).toBe('node_modules: present');
  });
});

describe('runtime versioning + migrate', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  it('readRuntimeVersion defaults to 1 when no mx.json, else reads the value', () => {
    const root = tmp();
    expect(readRuntimeVersion(root)).toBe(1); // legacy: no mx.json
    writeRuntimeVersion(root, 5);
    expect(readRuntimeVersion(root)).toBe(5);
  });

  it('initRuntime stamps mx.json with version = RUNTIME_VERSION on a fresh runtime', () => {
    const root = path.join(tmp(), 'rt');
    const res = initRuntime(root, TEMPLATES_DIR);
    expect(readRuntimeVersion(root)).toBe(RUNTIME_VERSION);
    expect(res.created).toContain(path.join(root, 'mx.json'));
  });

  it('writeRuntimeVersion preserves other mx.json keys', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'mx.json'), 'utf8'));
    cfg.custom = 'keep-me';
    fs.writeFileSync(path.join(root, 'mx.json'), JSON.stringify(cfg));
    writeRuntimeVersion(root, 7);
    const after = JSON.parse(fs.readFileSync(path.join(root, 'mx.json'), 'utf8'));
    expect(after.version).toBe(7);
    expect(after.custom).toBe('keep-me');
  });

  it('initRuntime refuses to adopt an existing runtime of a different version', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    writeRuntimeVersion(root, 1); // simulate a legacy runtime
    expect(() => initRuntime(root, TEMPLATES_DIR)).toThrow(/mx migrate/);
  });

  it('requireRuntime gates on version mismatch, unless allowVersionMismatch', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    expect(requireRuntime({ runtime: root })).toBe(root); // matches RUNTIME_VERSION

    writeRuntimeVersion(root, RUNTIME_VERSION - 1);
    expect(() => requireRuntime({ runtime: root })).toThrow(/mx migrate/);
    // migrate's bypass:
    expect(requireRuntime({ runtime: root, allowVersionMismatch: true })).toBe(root);
  });

  it('migrateRuntime upgrades a v1 runtime through to the current version', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    // Build a legacy v1 state: flat clone + worktree, VERSION=1.
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);
    const flat = path.join(root, 'repos', 'app');
    execFileSync('git', ['clone', '-q', src, flat], { stdio: 'ignore' });
    seedWork(root, {
      name: 'feat',
      description: '',
      worktrees: [{ repo: 'app', branch: 'feat', ports: {} }],
    });
    const flatWt = path.join(root, 'works', 'feat', 'app');
    runGit(flat, ['worktree', 'add', '-q', '-b', 'feat', flatWt]);
    writeRuntimeVersion(root, 1);

    const res = migrateRuntime(root, TEMPLATES_DIR);
    expect(res.from).toBe(1);
    expect(res.to).toBe(RUNTIME_VERSION);
    expect(res.applied).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
    expect(readRuntimeVersion(root)).toBe(RUNTIME_VERSION);
    // v1→v2: container layout + worktree moved into wt/.
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'git', '.git'))).toBe(true);
    const movedWt = path.join(root, 'works', 'feat', 'wt', 'app');
    expect(fs.existsSync(flatWt)).toBe(false);
    expect(fs.existsSync(movedWt)).toBe(true);
    const branch = execFileSync('git', ['-C', movedWt, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(branch).toBe('feat');
    // v2→v3: central hooks stamped + repo.json created + work.json name backfilled.
    expect(fs.existsSync(hookScript(root, 'post-worktree-create'))).toBe(true);
    expect(readRepoConfig(root, 'app')?.name).toBe('app');
    expect(readWork(root, 'feat').worktrees[0].name).toBe('app'); // backfilled

    // Idempotent: already current → no-op.
    expect(migrateRuntime(root, TEMPLATES_DIR).applied).toEqual([]);
  });

  it('v2→v3 removes default per-repo scripts but keeps customized ones with a warning', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    runGit(src, ['commit', '-qm', 'init', '--allow-empty']);
    execFileSync('git', ['clone', '-q', src, path.join(root, 'repos', 'app', 'git')], {
      stdio: 'ignore',
    });
    // A default hydrate.sh (boilerplate only) and a customized health.sh.
    const hydrate = path.join(root, 'repos', 'app', 'hydrate.sh');
    const health = path.join(root, 'repos', 'app', 'health.sh');
    fs.writeFileSync(hydrate, '#!/usr/bin/env bash\nset -euo pipefail\necho "Hydrate is done"\n');
    fs.writeFileSync(health, '#!/usr/bin/env bash\nset -euo pipefail\necho "$(redis-cli ping)"\n');
    writeRuntimeVersion(root, 2);

    const res = migrateRuntime(root, TEMPLATES_DIR);
    expect(res.to).toBe(3);
    // Default removed; customized kept + warned.
    expect(fs.existsSync(hydrate)).toBe(false);
    expect(fs.existsSync(health)).toBe(true);
    expect(res.warnings.some((w) => w.includes('health.sh'))).toBe(true);
    expect(readRepoConfig(root, 'app')?.name).toBe('app');
  });

  it('v2→v3 removes a default .claude/settings.json hook but keeps a customized one', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    // Two works: one with the mx-default SessionStart hook, one customized.
    seedWork(root, { name: 'def', description: '', worktrees: [] });
    seedWork(root, { name: 'cust', description: '', worktrees: [] });
    const defSettings = path.join(root, 'works', 'def', '.claude', 'settings.json');
    const custSettings = path.join(root, 'works', 'cust', '.claude', 'settings.json');
    const indexPath = path.join(root, 'context', 'INDEX.json');
    const defaultHook = {
      hooks: {
        SessionStart: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `echo '# mx context registry'; cat '${indexPath}' 2>/dev/null`,
              },
            ],
          },
        ],
      },
    };
    fs.mkdirSync(path.dirname(defSettings), { recursive: true });
    fs.writeFileSync(defSettings, JSON.stringify(defaultHook, null, 2) + '\n');
    fs.mkdirSync(path.dirname(custSettings), { recursive: true });
    fs.writeFileSync(custSettings, '{"hooks":{},"env":{"FOO":"bar"}}\n');
    writeRuntimeVersion(root, 2);

    const res = migrateRuntime(root, TEMPLATES_DIR);
    expect(res.to).toBe(3);
    // Default hook removed, and the now-empty .claude/ wrapper too.
    expect(fs.existsSync(defSettings)).toBe(false);
    expect(fs.existsSync(path.dirname(defSettings))).toBe(false);
    expect(res.changed).toContain(defSettings);
    // Customized settings preserved, with a warning.
    expect(fs.existsSync(custSettings)).toBe(true);
    expect(res.warnings.some((w) => w.includes('settings.json'))).toBe(true);
  });

  it('migrateRuntime --dry-run plans the changes but mutates nothing', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);
    const flat = path.join(root, 'repos', 'app');
    execFileSync('git', ['clone', '-q', src, flat], { stdio: 'ignore' });
    seedWork(root, {
      name: 'feat',
      description: '',
      worktrees: [{ repo: 'app', branch: 'feat', ports: {} }],
    });
    const flatWt = path.join(root, 'works', 'feat', 'app');
    runGit(flat, ['worktree', 'add', '-q', '-b', 'feat', flatWt]);
    writeRuntimeVersion(root, 1);
    // initRuntime already stamped a v3 hooks/ — remove it to simulate a true v1
    // runtime so the v2→v3 hook-stamp shows up in the plan.
    fs.rmSync(path.join(root, 'hooks'), { recursive: true, force: true });

    const plan = migrateRuntime(root, TEMPLATES_DIR, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.from).toBe(1);
    expect(plan.applied).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ]);
    // The plan names real targets across both steps (the v2→v3 repo.json step
    // can't be previewed here — in a chained v1→v3 dry run the repos aren't
    // moved to git/ yet, so listRepoNames sees none; that's fine for v2→v3).
    expect(plan.changed).toContain(path.join(root, 'works', 'feat', 'wt', 'app'));
    expect(plan.changed).toContain(hookScript(root, 'post-worktree-create'));
    // ...but NOTHING was actually moved or stamped, and VERSION is untouched.
    expect(readRuntimeVersion(root)).toBe(1);
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'git'))).toBe(false);
    expect(fs.existsSync(flatWt)).toBe(true);
    expect(fs.existsSync(hookScript(root, 'post-worktree-create'))).toBe(false);

    // A real run afterwards still works (dry run left nothing half-done).
    const real = migrateRuntime(root, TEMPLATES_DIR);
    expect(real.dryRun).toBe(false);
    expect(readRuntimeVersion(root)).toBe(RUNTIME_VERSION);
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app'))).toBe(true);
  });

  it('migrateRuntime --dry-run on an already-current runtime is a clean no-op', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const plan = migrateRuntime(root, TEMPLATES_DIR, { dryRun: true });
    expect(plan.applied).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.dryRun).toBe(true);
  });

  it('migrateRuntime rejects a runtime newer than the CLI supports', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    writeRuntimeVersion(root, RUNTIME_VERSION + 1);
    expect(() => migrateRuntime(root, TEMPLATES_DIR)).toThrow(/Upgrade your mx CLI/);
  });
});

describe('repo container layout + migration', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  function srcRepo(): string {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);
    return src;
  }

  it('repoAdd clones into repos/<name>/git; repoInfo.path is the container', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app');
    expect(fs.existsSync(path.join(repoGitDir(root, 'app'), '.git'))).toBe(true);
    expect(repoInfo(root, 'app').path).toBe(path.join(root, 'repos', 'app'));
    expect(repoInfo(root, 'app').branch).toBe('main');
  });

  it('migrateRepoLayout moves a legacy flat clone into git/ and relinks worktrees', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    // Simulate the OLD layout: clone directly into repos/app (flat) + a worktree.
    const flat = path.join(root, 'repos', 'app');
    execFileSync('git', ['clone', '-q', srcRepo(), flat], { stdio: 'ignore' });
    const wt = path.join(root, 'works', 'feat', 'app');
    fs.mkdirSync(path.join(root, 'works', 'feat'), { recursive: true });
    runGit(flat, ['worktree', 'add', '-q', '-b', 'feat', wt]);
    expect(fs.existsSync(path.join(flat, '.git'))).toBe(true);

    const migrated = migrateRepoLayout(root);
    expect(migrated).toEqual([path.join(root, 'repos', 'app')]);

    // Clone now lives under git/; the container no longer holds .git directly.
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'git', '.git'))).toBe(true);
    expect(fs.existsSync(path.join(flat, '.git'))).toBe(false);

    // The pre-existing worktree relinked and still resolves to its branch.
    const branch = execFileSync('git', ['-C', wt, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(branch).toBe('feat');

    // Idempotent: a second run migrates nothing.
    expect(migrateRepoLayout(root)).toEqual([]);
  });
});

describe('repoFetch', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  const sha = (cwd: string, ref: string) =>
    execFileSync('git', ['-C', cwd, 'rev-parse', ref], { encoding: 'utf8' }).trim();

  /** Source repo on `main` with one commit; pristine clone added to a runtime. */
  function fixture(): { root: string; src: string; clone: string; name: string } {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);

    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, src, 'app');
    return { root, src, clone: path.join(root, 'repos', 'app', 'git'), name: 'app' };
  }

  // Advance origin/main by one commit on the source repo.
  function advanceSrc(src: string): void {
    fs.writeFileSync(path.join(src, 'g.txt'), 'y');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'second']);
  }

  it('fast-forwards the currently checked-out branch to origin', () => {
    const { root, src, clone, name } = fixture();
    advanceSrc(src);
    repoFetch(root, name);
    // Pristine is on main (its current branch), so main matches origin/main.
    expect(sha(clone, 'main')).toBe(sha(clone, 'refs/remotes/origin/main'));
    expect(sha(clone, 'main')).toBe(sha(src, 'main'));
  });

  it('fast-forwards the base branch even when a different branch is checked out', () => {
    const { root, src, clone, name } = fixture();
    // Move the pristine off the default branch onto one with no upstream.
    runGit(clone, ['checkout', '-q', '-b', 'wip']);
    const wipBefore = sha(clone, 'wip');
    advanceSrc(src); // origin/main advances

    repoFetch(root, name);

    // Base (main) is fast-forwarded to origin/main even though it isn't checked
    // out — so a worktree forked from `main` gets the latest.
    expect(sha(clone, 'main')).toBe(sha(clone, 'refs/remotes/origin/main'));
    expect(sha(clone, 'main')).toBe(sha(src, 'main'));
    // The unrelated, upstream-less current branch is left untouched.
    expect(sha(clone, 'wip')).toBe(wipBefore);
  });
});

describe('repoHealth / listRepoHealth', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  /**
   * Build a fixture: source repo with one initial commit on main + a feature
   * branch, plus a runtime with a pristine clone added. Returns the runtime
   * root, the source repo path, the pristine clone path, and the repo name.
   */
  function fixture(): { root: string; src: string; clone: string; name: string } {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    fs.writeFileSync(path.join(src, 'f.txt'), 'x');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'init']);
    runGit(src, ['branch', 'feature-x']);

    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, src, 'app');
    return { root, src, clone: path.join(root, 'repos', 'app', 'git'), name: 'app' };
  }

  it('a freshly cloned pristine repo is healthy', () => {
    const { root, name } = fixture();
    const h = repoHealth(root, name);
    expect(h.healthy).toBe(true);
    expect(h.issues).toEqual([]);
    expect(h.currentBranch).toBe('main');
    expect(h.defaultBranch).toBe('main');
    expect(h.isOnDefault).toBe(true);
    expect(h.uncommittedChanges).toBe(0);
    expect(h.untrackedFiles).toBe(0);
    expect(h.aheadOfOrigin).toBe(0);
    expect(h.behindOfOrigin).toBe(0);
    expect(h.worktreesInWorks).toEqual([]);
  });

  it('flags uncommitted changes and untracked files', () => {
    const { root, clone, name } = fixture();
    // Modify the tracked file → uncommitted change.
    fs.writeFileSync(path.join(clone, 'f.txt'), 'modified');
    // Add a new untracked file.
    fs.writeFileSync(path.join(clone, 'new-untracked.txt'), 'x');
    const h = repoHealth(root, name);
    expect(h.healthy).toBe(false);
    expect(h.uncommittedChanges).toBe(1);
    expect(h.untrackedFiles).toBe(1);
    expect(h.issues.some((i) => i.includes('uncommitted'))).toBe(true);
    expect(h.issues.some((i) => i.includes('untracked'))).toBe(true);
  });

  it('flags being off the default branch', () => {
    const { root, clone, name } = fixture();
    // The pristine also has a `feature-x` branch since clone pulled it.
    runGit(clone, ['checkout', '-q', 'feature-x']);
    const h = repoHealth(root, name);
    expect(h.healthy).toBe(false);
    expect(h.currentBranch).toBe('feature-x');
    expect(h.defaultBranch).toBe('main');
    expect(h.isOnDefault).toBe(false);
    expect(h.issues.some((i) => i.includes('on feature-x') && i.includes('default: main'))).toBe(
      true,
    );
  });

  it('flags commits behind origin after the source repo advances', () => {
    const { root, src, clone, name } = fixture();
    // Advance the source repo on main, then fetch into the clone — the clone
    // now lags by one commit.
    fs.writeFileSync(path.join(src, 'g.txt'), 'y');
    runGit(src, ['add', '-A']);
    runGit(src, ['commit', '-qm', 'second']);
    runGit(clone, ['fetch', '-q', 'origin']);
    const h = repoHealth(root, name);
    expect(h.healthy).toBe(false);
    expect(h.behindOfOrigin).toBe(1);
    expect(h.aheadOfOrigin).toBe(0);
    expect(h.issues.some((i) => i.includes('1 commit behind'))).toBe(true);
    expect(h.lastFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('populates worktreesInWorks when a work uses the repo', () => {
    const { root, name } = fixture();
    workNew(root, 'feat');
    worktreeAdd(root, 'feat', name, { branch: 'feat' });
    const h = repoHealth(root, name);
    expect(h.worktreesInWorks).toEqual(['feat']);
  });

  it('listRepoHealth returns one snapshot per pristine clone', () => {
    const { root } = fixture();
    // Add a second repo to the same runtime.
    const src2 = path.join(tmp(), 'src2');
    fs.mkdirSync(src2, { recursive: true });
    runGit(src2, ['init', '-q', '-b', 'main']);
    runGit(src2, ['config', 'user.email', 't@t.t']);
    runGit(src2, ['config', 'user.name', 't']);
    runGit(src2, ['commit', '-qm', 'init', '--allow-empty']);
    repoAdd(root, src2, 'worker');

    const list = listRepoHealth(root);
    expect(list.map((h) => h.name).sort()).toEqual(['app', 'worker']);
    expect(list.every((h) => h.healthy)).toBe(true);
  });
});

describe('workHealth / listWorkHealth', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');
  const runGit = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, stdio: 'ignore' });

  /**
   * Build a runtime with one pristine clone and one active work that has a
   * single worktree on its own branch. Returns the runtime root + repo name.
   */
  function fixture(): { root: string; src: string } {
    const src = path.join(tmp(), 'src');
    fs.mkdirSync(src, { recursive: true });
    runGit(src, ['init', '-q', '-b', 'main']);
    runGit(src, ['config', 'user.email', 't@t.t']);
    runGit(src, ['config', 'user.name', 't']);
    runGit(src, ['commit', '-qm', 'init', '--allow-empty']);
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, src, 'app');
    workNew(root, 'feat', 'a feature');
    worktreeAdd(root, 'feat', 'app', { branch: 'feat' });
    return { root, src };
  }

  it('a clean active work is healthy', () => {
    const { root } = fixture();
    const h = workHealth(root, 'feat');
    expect(h.healthy).toBe(true);
    expect(h.archived).toBe(false);
    expect(h.worktrees).toEqual([
      { name: 'app', repo: 'app', branch: 'feat', present: true },
    ]);
    expect(h.strayEntries).toEqual([]);
    expect(h.portConflicts).toEqual([]);
  });

  it('flags a stray (non-mx-native) entry in the work root but tolerates dotfiles', () => {
    const { root } = fixture();
    fs.writeFileSync(path.join(root, 'works', 'feat', 'NOTES.md'), 'x');
    fs.writeFileSync(path.join(root, 'works', 'feat', '.app-mcp'), 'x'); // tooling dotfile, exempt
    const h = workHealth(root, 'feat');
    expect(h.strayEntries).toEqual(['NOTES.md']);
    expect(h.healthy).toBe(false);
    expect(h.issues.some((i) => i.includes('NOTES.md'))).toBe(true);
  });

  it('detects a cross-work port collision (e.g. from a hand-edited work.json)', () => {
    const { root } = fixture();
    portSet(root, 'feat', 'app', 'web'); // allocates 3000
    workNew(root, 'feat2');
    worktreeAdd(root, 'feat2', 'app', { branch: 'feat2' });
    // Hand-edit feat2 to collide on the same port.
    const w2 = readWork(root, 'feat2');
    w2.worktrees[0].ports = { web: 3000 };
    writeWork(root, w2);

    const h = workHealth(root, 'feat2');
    expect(h.portConflicts).toHaveLength(1);
    expect(h.portConflicts[0]).toMatchObject({ port: 3000, otherWork: 'feat' });
    expect(h.healthy).toBe(false);
  });

  it('flags an active work whose recorded worktree is missing on disk', () => {
    const { root } = fixture();
    // Remove the worktree dir behind mx's back.
    fs.rmSync(path.join(root, 'works', 'feat', 'wt', 'app'), { recursive: true, force: true });
    const h = workHealth(root, 'feat');
    expect(h.worktrees[0].present).toBe(false);
    expect(h.healthy).toBe(false);
    expect(h.issues.some((i) => i.includes('missing on disk'))).toBe(true);
  });

  it('archive frees ports and removes worktrees, so an archived work is healthy', () => {
    const { root } = fixture();
    portSet(root, 'feat', 'app', 'web');
    archiveWork(root, 'feat');
    const h = workHealth(root, 'feat');
    expect(h.archived).toBe(true);
    expect(h.ports).toEqual([]);
    expect(h.worktrees[0].present).toBe(false);
    expect(h.healthy).toBe(true);
  });

  it('flags an archived work that still pins ports (hand-edited)', () => {
    const { root } = fixture();
    archiveWork(root, 'feat');
    const w = readWork(root, 'feat');
    w.worktrees[0].ports = { web: 9999 };
    writeWork(root, w);
    const h = workHealth(root, 'feat');
    expect(h.healthy).toBe(false);
    expect(h.issues.some((i) => i.includes('should be freed'))).toBe(true);
  });

  it('the work-health hook stdout is captured into extra', () => {
    const { root } = fixture();
    const hook = hookScript(root, 'work-health');
    fs.writeFileSync(hook, '#!/usr/bin/env bash\necho "work=$MX_WORK"\n');
    fs.chmodSync(hook, 0o755);
    const h = workHealth(root, 'feat');
    expect(h.extra).toBe('work=feat');
  });

  it('listWorkHealth excludes archived by default, includes them with includeArchived', () => {
    const { root } = fixture();
    workNew(root, 'feat2');
    archiveWork(root, 'feat2');
    expect(listWorkHealth(root).map((h) => h.name)).toEqual(['feat']);
    expect(listWorkHealth(root, { includeArchived: true }).map((h) => h.name).sort()).toEqual([
      'feat',
      'feat2',
    ]);
  });
});

describe('tmux session naming', () => {
  it('mxSessionName prefixes with mx/ and sanitizes tmux-hostile characters', async () => {
    const { mxSessionName, sanitizeTmuxName, isMxSessionName, MX_SESSION_PREFIX } = await import(
      '../src/tmux'
    );
    expect(mxSessionName('feature-a')).toBe('mx/feature-a');
    // colons and dots are tmux target separators — must be replaced.
    expect(mxSessionName('a.b:c')).toBe('mx/a-b-c');
    expect(sanitizeTmuxName('x y')).toBe('x-y');
    expect(isMxSessionName('mx/feature-a')).toBe(true);
    expect(isMxSessionName('some-other')).toBe(false);
    expect(MX_SESSION_PREFIX).toBe('mx/');
  });
});

describe('contextIndexStatus', () => {
  it('reports size, entry count, and near/over-limit flags against the @import cap', async () => {
    const { contextIndexStatus, CLAUDE_IMPORT_LIMIT } = await import('../src/context');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-ctxidx-'));
    fs.mkdirSync(path.join(root, 'context'), { recursive: true });
    const write = (s: string): void => fs.writeFileSync(path.join(root, 'context', 'INDEX.json'), s);
    const idxFile = path.join(root, 'context', 'INDEX.json');

    // Missing index → exists:false, no flags.
    let st = contextIndexStatus(root);
    expect(st).toMatchObject({ exists: false, chars: 0, entries: null, nearLimit: false, overLimit: false });
    expect(st.path).toBe(idxFile);

    // Small valid array → parsed entry count, well under the limit.
    write(JSON.stringify([{ path: 'a' }, { path: 'b' }, { path: 'c' }]));
    st = contextIndexStatus(root);
    expect(st).toMatchObject({ exists: true, entries: 3, nearLimit: false, overLimit: false });
    expect(st.chars).toBeGreaterThan(0);

    // Just over the limit → overLimit (and therefore also nearLimit).
    write('x'.repeat(CLAUDE_IMPORT_LIMIT + 1));
    st = contextIndexStatus(root);
    expect(st.overLimit).toBe(true);
    expect(st.nearLimit).toBe(true);
    expect(st.entries).toBeNull(); // not a JSON array → uncountable

    // Between 85% and 100% → nearLimit but not over.
    write('y'.repeat(Math.floor(CLAUDE_IMPORT_LIMIT * 0.9)));
    st = contextIndexStatus(root);
    expect(st.nearLimit).toBe(true);
    expect(st.overLimit).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('findSessionsByName (resume-by-work-name)', () => {
  it('finds sessions whose display name equals the work, newest-first, exact-match only', async () => {
    const { findSessionsByName, claudeProjectDirName } = await import('../src/claudeSessions');
    const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-cs-'));
    const workPath = '/tmp/mx/works/feat';
    const dir = path.join(projectsRoot, claudeProjectDirName(workPath));
    fs.mkdirSync(dir, { recursive: true });
    const writeSession = (id: string, title: string, mtime: number): void => {
      const f = path.join(dir, `${id}.jsonl`);
      fs.writeFileSync(f, JSON.stringify({ type: 'custom-title', customTitle: title }) + '\n');
      fs.utimesSync(f, mtime, mtime);
    };
    // Two sessions named "feat" (older + newer), one named "feat-2" (must NOT match), one unnamed.
    writeSession('aaaaaaaa-0000-0000-0000-000000000001', 'feat', 1000);
    writeSession('bbbbbbbb-0000-0000-0000-000000000002', 'feat', 2000);
    writeSession('cccccccc-0000-0000-0000-000000000003', 'feat-2', 3000);
    fs.writeFileSync(path.join(dir, 'dddddddd-0000-0000-0000-000000000004.jsonl'), '{}\n');

    const found = findSessionsByName(projectsRoot, workPath, 'feat');
    // exact "feat" only — the "feat-2" and unnamed sessions are excluded
    expect(found.map((s) => s.id)).toEqual([
      'bbbbbbbb-0000-0000-0000-000000000002', // newest first
      'aaaaaaaa-0000-0000-0000-000000000001',
    ]);
    // resolveClaudeCommand resumes found[0] — the most recent named session.
    expect(found[0].name).toBe('feat');

    // No project dir / no match → empty (resolveClaudeCommand then creates).
    expect(findSessionsByName(projectsRoot, '/tmp/mx/works/other', 'other')).toEqual([]);

    fs.rmSync(projectsRoot, { recursive: true, force: true });
  });
});
