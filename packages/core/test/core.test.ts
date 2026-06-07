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
  updateRuntime,
  readWork,
  writeWork,
  workNew,
  worktreeAdd,
  archiveWork,
  unarchiveWork,
  workDestroy,
  listWorksInfo,
  repoAdd,
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
    fs.mkdirSync(path.join(root, 'works', 'feat', 'repoA'), { recursive: true });
    fs.mkdirSync(path.join(root, 'repos', 'repoX'), { recursive: true });

    process.chdir(path.join(root, 'works', 'feat'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: null });

    process.chdir(path.join(root, 'works', 'feat', 'repoA'));
    expect(inferContext(root)).toEqual({ work: 'feat', repo: 'repoA' });

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

  it('updateRuntime creates context/INDEX.json when the runtime has no context/ yet', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    // Simulate an "old" runtime without the context registry.
    fs.rmSync(path.join(runtime, 'context'), { recursive: true, force: true });
    const res = updateRuntime(runtime, TEMPLATES_DIR);
    const indexPath = path.join(runtime, 'context', 'INDEX.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(res.updated).toContain(indexPath);
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual([]);
  });

  it('updateRuntime preserves an existing context/INDEX.json', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    const existing = [
      { path: 'infra/cell/guide', description: 'how cell deploys work' },
    ];
    const indexPath = path.join(runtime, 'context', 'INDEX.json');
    fs.writeFileSync(indexPath, JSON.stringify(existing));
    const res = updateRuntime(runtime, TEMPLATES_DIR);
    expect(JSON.parse(fs.readFileSync(indexPath, 'utf8'))).toEqual(existing);
    expect(res.updated).not.toContain(indexPath);
  });

  it('updateRuntime backfills missing per-work sessions/ without touching user data', () => {
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

    const res = updateRuntime(runtime, TEMPLATES_DIR);
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

  it('updateRuntime does not re-create per-work sessions/ that already exists', () => {
    const runtime = path.join(tmp(), 'rt');
    initRuntime(runtime, TEMPLATES_DIR);
    workNew(runtime, 'feat');
    const sessions = path.join(runtime, 'works', 'feat', 'sessions');
    // Add a real session file; it must survive untouched.
    const note = path.join(sessions, '2026-06-06-12-00-existing.md');
    fs.writeFileSync(note, '# preexisting note\n');
    const before = fs.readFileSync(note, 'utf8');

    const res = updateRuntime(runtime, TEMPLATES_DIR);
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
    const wtDir = path.join(root, 'works', workName, 'app');
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
    const wt = path.join(root, 'works', workName, 'app');
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
    expect(fs.existsSync(path.join(root, 'works', workName, 'app'))).toBe(true);

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
    runGit(path.join(root, 'repos', 'app'), ['branch', '-D', 'feat']);
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
    runGit(path.join(root, 'repos', 'app'), ['branch', 'alt']);
    archiveWork(root, workName);
    runGit(path.join(root, 'repos', 'app'), ['branch', '-D', 'feat']);
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
