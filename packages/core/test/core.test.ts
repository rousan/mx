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
