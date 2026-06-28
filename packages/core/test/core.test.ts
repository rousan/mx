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
  workHookScript,
  WORK_HOOK_EVENTS,
  readWork,
  writeWork,
  workNew,
  worktreeAdd,
  archiveWork,
  unarchiveWork,
  workDestroy,
  listWorksInfo,
  repoAdd,
  repoFetch,
  repoInfo,
  repoHealth,
  stampRepoScripts,
  listRepoHealth,
  statusRuntime,
} from '../src/index';
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
    fs.mkdirSync(path.join(root, 'works', 'feat', 'wt', 'repoA'), { recursive: true });
    fs.mkdirSync(path.join(root, 'works', 'feat', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'repos', 'repoX'), { recursive: true });

    process.chdir(path.join(root, 'works', 'feat'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: null });

    // Worktrees live under <work>/wt/<repo> — that's where a repo is inferred.
    process.chdir(path.join(root, 'works', 'feat', 'wt', 'repoA'));
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

describe('per-work context-index hook', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('workNew stamps a .claude/settings.json SessionStart hook for the index', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    const settingsPath = path.join(res.path, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const cmd = s.hooks.SessionStart[0].hooks[0].command;
    expect(cmd).toContain(path.join(root, 'context', 'INDEX.json'));
  });

  it('syncRuntime backfills the hook for an existing work, without clobbering edits', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    workNew(root, 'feat');
    const settingsPath = path.join(root, 'works', 'feat', '.claude', 'settings.json');
    // Simulate a pre-hook work: remove .claude, then verify sync recreates it.
    fs.rmSync(path.join(root, 'works', 'feat', '.claude'), { recursive: true, force: true });
    expect(fs.existsSync(settingsPath)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(settingsPath);
    expect(fs.existsSync(settingsPath)).toBe(true);

    // Non-clobbering: a user edit survives a second sync.
    fs.writeFileSync(settingsPath, '{"hooks":{}}\n');
    const res2 = syncRuntime(root, TEMPLATES_DIR);
    expect(res2.updated).not.toContain(settingsPath);
    expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{"hooks":{}}\n');
  });
});

describe('per-work bin directory', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('workNew creates an empty bin/ directory', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    const bin = path.join(res.path, 'bin');
    expect(fs.statSync(bin).isDirectory()).toBe(true);
    expect(fs.readdirSync(bin)).toEqual([]); // starts empty
  });

  it('syncRuntime backfills bin/ for an existing work, preserving its contents', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    workNew(root, 'feat');
    const bin = path.join(root, 'works', 'feat', 'bin');
    // Simulate a pre-bin work: remove bin/, then verify sync recreates it.
    fs.rmSync(bin, { recursive: true, force: true });
    expect(fs.existsSync(bin)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(bin);
    expect(fs.existsSync(bin)).toBe(true);

    // Non-destructive: a binary already in bin/ survives a second sync.
    fs.writeFileSync(path.join(bin, 'tool'), 'x');
    const res2 = syncRuntime(root, TEMPLATES_DIR);
    expect(res2.updated).not.toContain(bin);
    expect(fs.existsSync(path.join(bin, 'tool'))).toBe(true);
  });
});

describe('per-work lifecycle hooks', () => {
  const TEMPLATES_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'templates');

  it('workNew stamps the four archive/unarchive hook scripts, executable no-ops', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const res = workNew(root, 'feat');
    expect(fs.existsSync(path.join(res.path, 'hooks'))).toBe(true);
    expect(WORK_HOOK_EVENTS).toEqual([
      'pre-archive',
      'post-archive',
      'pre-unarchive',
      'post-unarchive',
    ]);
    for (const event of WORK_HOOK_EVENTS) {
      const hook = workHookScript(root, 'feat', event);
      expect(fs.existsSync(hook)).toBe(true);
      expect((fs.statSync(hook).mode & 0o111) !== 0).toBe(true); // has an exec bit
      const body = fs.readFileSync(hook, 'utf8');
      expect(body).toContain(`mx ${event} hook`);
      expect(body.trimEnd().endsWith('exit 0')).toBe(true); // no-op by default
    }
  });

  it('pre-hooks document the abort contract; post-hooks document warn-only', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    workNew(root, 'feat');
    const pre = fs.readFileSync(workHookScript(root, 'feat', 'pre-archive'), 'utf8');
    const post = fs.readFileSync(workHookScript(root, 'feat', 'post-archive'), 'utf8');
    expect(pre).toContain('ABORTS');
    expect(pre).toContain('HOOK_FAILED');
    expect(post).toContain('cannot undo');
  });

  it('syncRuntime backfills hooks/ for an existing work, without clobbering edits', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    workNew(root, 'feat');
    // Simulate a pre-hooks work: remove hooks/, then verify sync recreates it.
    fs.rmSync(path.join(root, 'works', 'feat', 'hooks'), { recursive: true, force: true });
    const preArchive = workHookScript(root, 'feat', 'pre-archive');
    expect(fs.existsSync(preArchive)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(preArchive);
    expect(fs.existsSync(preArchive)).toBe(true);

    // Non-clobbering: a user edit survives a second sync.
    fs.writeFileSync(preArchive, '#!/usr/bin/env bash\nexit 1\n');
    const res2 = syncRuntime(root, TEMPLATES_DIR);
    expect(res2.updated).not.toContain(preArchive);
    expect(fs.readFileSync(preArchive, 'utf8')).toBe('#!/usr/bin/env bash\nexit 1\n');
  });
});

describe('per-repo hydrate script', () => {
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

  it('stampRepoScripts writes an executable hydrate.sh, idempotently', () => {
    const dir = tmp();
    const dest = path.join(dir, 'hydrate.sh');
    const created = stampRepoScripts(dir, TEMPLATES_DIR);
    expect(created).toContain(dest);
    expect(fs.existsSync(dest)).toBe(true);
    expect((fs.statSync(dest).mode & 0o111) !== 0).toBe(true); // has an exec bit
    // Idempotent + non-clobbering: a second call stamps nothing.
    expect(stampRepoScripts(dir, TEMPLATES_DIR)).toEqual([]);
  });

  it('syncRuntime backfills hydrate.sh + health.sh for existing repos', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app'); // core repoAdd clones only — no scripts yet
    const hydrate = path.join(root, 'repos', 'app', 'hydrate.sh');
    const health = path.join(root, 'repos', 'app', 'health.sh');
    expect(fs.existsSync(hydrate)).toBe(false);
    const res = syncRuntime(root, TEMPLATES_DIR);
    expect(res.updated).toContain(hydrate);
    expect(res.updated).toContain(health);
    expect(fs.existsSync(hydrate)).toBe(true);
    expect(fs.existsSync(health)).toBe(true);
  });

  it('repoHealth.extra captures health.sh stdout (null when absent)', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    repoAdd(root, srcRepo(), 'app');
    expect(repoHealth(root, 'app').extra).toBeNull(); // no health.sh yet
    const hs = path.join(root, 'repos', 'app', 'health.sh');
    fs.writeFileSync(hs, '#!/usr/bin/env bash\necho "node_modules: present"\n');
    fs.chmodSync(hs, 0o755);
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

  it('migrateRuntime upgrades a v1 runtime to the container layout and bumps VERSION', () => {
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

    const res = migrateRuntime(root);
    expect(res.from).toBe(1);
    expect(res.to).toBe(RUNTIME_VERSION);
    expect(res.applied).toEqual([{ from: 1, to: 2 }]);
    expect(readRuntimeVersion(root)).toBe(2);
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'git', '.git'))).toBe(true);
    // The worktree moved into wt/ and relinked; the flat path is gone.
    const movedWt = path.join(root, 'works', 'feat', 'wt', 'app');
    expect(fs.existsSync(flatWt)).toBe(false);
    expect(fs.existsSync(movedWt)).toBe(true);
    const branch = execFileSync('git', ['-C', movedWt, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(branch).toBe('feat');

    // Idempotent: already current → no-op.
    expect(migrateRuntime(root).applied).toEqual([]);
  });

  it('migrateRuntime --dry-run plans the same changes but mutates nothing', () => {
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

    const plan = migrateRuntime(root, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.from).toBe(1);
    expect(plan.applied).toEqual([{ from: 1, to: 2 }]);
    // The plan names the real targets...
    expect(plan.changed).toContain(path.join(root, 'repos', 'app'));
    expect(plan.changed).toContain(path.join(root, 'works', 'feat', 'wt', 'app'));
    // ...but NOTHING was actually moved or stamped, and VERSION is untouched.
    expect(readRuntimeVersion(root)).toBe(1);
    expect(fs.existsSync(path.join(root, 'repos', 'app', 'git'))).toBe(false);
    expect(fs.existsSync(flatWt)).toBe(true);
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'hooks'))).toBe(false);

    // A real run afterwards still works (dry run left nothing half-done).
    const real = migrateRuntime(root);
    expect(real.dryRun).toBe(false);
    expect(readRuntimeVersion(root)).toBe(2);
    expect(fs.existsSync(path.join(root, 'works', 'feat', 'wt', 'app'))).toBe(true);
  });

  it('migrateRuntime --dry-run on an already-current runtime is a clean no-op', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    const plan = migrateRuntime(root, { dryRun: true });
    expect(plan.applied).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.dryRun).toBe(true);
  });

  it('migrateRuntime rejects a runtime newer than the CLI supports', () => {
    const root = path.join(tmp(), 'rt');
    initRuntime(root, TEMPLATES_DIR);
    writeRuntimeVersion(root, RUNTIME_VERSION + 1);
    expect(() => migrateRuntime(root)).toThrow(/Upgrade your mx CLI/);
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
