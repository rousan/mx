/**
 * Work-folder health checks (`mx work health`) — purely local, no network.
 *
 * Where `repoHealth` audits a pristine clone, `workHealth` audits a work folder
 * against the mx contract: the root holds only mx-native files, the recorded
 * worktrees match what's on disk, and the work's allocated ports don't collide
 * with another work's (which can happen when `work.json` is hand-edited despite
 * mx owning it). Archived works carry stricter expectations — their worktrees
 * are gone and their ports freed — so the same snapshot flags an archived work
 * that still pins ports or has stray worktree directories.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists } from './fsutil';
import {
  hookScript,
  listWorkNames,
  readWork,
  workDir,
  workManifest,
  workspaceFile,
  worktreesDir,
  worktreePath,
  worktreeName,
} from './runtime';
import type { Work } from './types';

/**
 * One allocated port slot within a work, flattened for reporting.
 */
export interface WorkHealthPort {
  /** Worktree name that owns the port. */
  worktree: string;
  /** Service name the port is mapped to. */
  service: string;
  /** The port number. */
  port: number;
}

/**
 * A port collision between this work and another work's allocation — almost
 * always the result of a hand-edited `work.json`, since `mx port set` keeps
 * ports unique across all works.
 */
export interface WorkHealthPortConflict {
  /** The shared port number. */
  port: number;
  /** This work's worktree holding the port. */
  worktree: string;
  /** This work's service mapped to the port. */
  service: string;
  /** The other work that also allocates this port. */
  otherWork: string;
  /** The other work's `worktree/service` owner of the port. */
  otherOwner: string;
}

/**
 * Whether a recorded worktree is present on disk.
 */
export interface WorkHealthWorktree {
  /** Worktree name (the `wt/<name>` selector). */
  name: string;
  /** Repo the worktree is of. */
  repo: string;
  /** Branch recorded in `work.json`. */
  branch: string;
  /** True when `wt/<name>` exists on disk. */
  present: boolean;
}

/**
 * Health snapshot of a single work folder — purely local checks.
 */
export interface WorkHealth {
  /** Work name. */
  name: string;
  /** Absolute work-folder path. */
  path: string;
  /** True when the work is archived (`isArchived` in `work.json`). */
  archived: boolean;
  /** Each recorded worktree and whether it exists on disk. */
  worktrees: WorkHealthWorktree[];
  /** Every port the work allocates, flattened across its worktrees. */
  ports: WorkHealthPort[];
  /** Entries in the work root that aren't mx-native (ad-hoc files/dirs). */
  strayEntries: string[];
  /** Ports that collide with another work's allocation. */
  portConflicts: WorkHealthPortConflict[];
  /** True when no health checks flagged an issue. */
  healthy: boolean;
  /** Human-readable description of each issue; empty when `healthy`. */
  issues: string[];
  /**
   * Captured stdout of the central `work-health` hook (trimmed), or null when
   * there's no hook, it produced no output, or it failed. Purely informational
   * — it doesn't affect `healthy`/`issues`.
   */
  extra: string | null;
}

/**
 * Names allowed directly in a work-folder root besides the mx-owned
 * subdirectories. The `.code-workspace` is name-derived so it's computed per
 * work rather than listed here.
 */
const MX_NATIVE_ROOT_FILES = new Set(['work.json', 'CLAUDE.md']);

/**
 * mx-owned subdirectories of a work folder (see `ensureWorkScaffolding`).
 */
const MX_NATIVE_ROOT_DIRS = new Set(['wt', 'scripts', 'files', 'tmp', 'sessions']);

/**
 * Flatten every port allocated across all works into `port -> "work/worktree/service"`
 * entries, so a work's ports can be checked against everyone else's. Unlike
 * `allocatedPorts`, this keeps the full origin (including the work name) and
 * every duplicate, which is exactly what collision detection needs.
 *
 * @param root - Runtime root.
 * @returns One entry per allocated (work, worktree, service) port slot.
 */
function allPortSlots(
  root: string,
): { work: string; worktree: string; service: string; port: number }[] {
  const slots: { work: string; worktree: string; service: string; port: number }[] = [];
  for (const name of listWorkNames(root)) {
    let work: Work;
    try {
      work = readWork(root, name);
    } catch {
      continue;
    }
    for (const wt of work.worktrees ?? []) {
      const wtName = worktreeName(wt);
      for (const [service, port] of Object.entries(wt.ports ?? {})) {
        slots.push({ work: name, worktree: wtName, service, port: Number(port) });
      }
    }
  }
  return slots;
}

/**
 * Run the central `work-health` hook for a work and capture its stdout.
 *
 * Runs `<runtime>/hooks/work-health` with the work folder as the working
 * directory; work context is passed via `MX_*` env vars. Returns the trimmed
 * output, or null when there's no hook, it produced nothing, or it exited
 * non-zero (best-effort — a broken hook never breaks the health report).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Trimmed hook stdout, or null.
 */
function runWorkHealthHook(root: string, name: string): string | null {
  const script = hookScript(root, 'work-health');
  if (!exists(script)) return null;
  try {
    const out = execFileSync(script, [], {
      cwd: workDir(root, name),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        MX_RUNTIME: root,
        MX_EVENT: 'work-health',
        MX_WORK: name,
        MX_WORK_PATH: workDir(root, name),
      },
    });
    const trimmed = out.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * List entries in a work-folder root that aren't mx-native. mx reserves the
 * root for `work.json`, the `.code-workspace`, the work `CLAUDE.md`, and the
 * mx-owned subdirectories; everything else is ad-hoc and belongs under
 * `files/` / `tmp/` / `scripts/`. Dot-prefixed entries are tolerated (the
 * documented exception for tooling files like an MCP connection file).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Sorted list of stray entry basenames (empty when the root is clean).
 */
function strayRootEntries(root: string, name: string): string[] {
  const wd = workDir(root, name);
  const workspaceBase = path.basename(workspaceFile(root, name));
  const stray: string[] = [];
  for (const entry of fs.readdirSync(wd)) {
    if (entry.startsWith('.')) continue; // tooling/hidden files are exempt
    if (entry === workspaceBase) continue;
    if (MX_NATIVE_ROOT_FILES.has(entry)) continue;
    if (MX_NATIVE_ROOT_DIRS.has(entry)) continue;
    stray.push(entry);
  }
  return stray.sort();
}

/**
 * Compute a `WorkHealth` snapshot for a single work folder.
 *
 * Purely local — no network, no git. Checks: stray (non-mx-native) entries in
 * the work root; cross-work port collisions; and archive invariants (an
 * archived work should have no worktrees on disk and no ports allocated, an
 * active work should have each recorded worktree present).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns The health snapshot.
 */
export function workHealth(root: string, name: string): WorkHealth {
  const wd = workDir(root, name);
  if (!exists(workManifest(root, name))) {
    throw new MxError(`no such work: ${name}`, 'NO_WORK');
  }
  const work = readWork(root, name);
  const archived = work.isArchived === true;

  const worktrees: WorkHealthWorktree[] = (work.worktrees ?? []).map((wt) => {
    const wtName = worktreeName(wt);
    return {
      name: wtName,
      repo: wt.repo,
      branch: wt.branch,
      present: exists(worktreePath(root, name, wtName)),
    };
  });

  const ports: WorkHealthPort[] = (work.worktrees ?? []).flatMap((wt) => {
    const wtName = worktreeName(wt);
    return Object.entries(wt.ports ?? {}).map(([service, port]) => ({
      worktree: wtName,
      service,
      port: Number(port),
    }));
  });

  // Cross-work port collisions: any other work allocating one of our ports.
  const portConflicts: WorkHealthPortConflict[] = [];
  const others = allPortSlots(root).filter((s) => s.work !== name);
  for (const p of ports) {
    for (const o of others) {
      if (o.port === p.port) {
        portConflicts.push({
          port: p.port,
          worktree: p.worktree,
          service: p.service,
          otherWork: o.work,
          otherOwner: `${o.worktree}/${o.service}`,
        });
      }
    }
  }

  const strayEntries = strayRootEntries(root, name);

  const issues: string[] = [];
  for (const s of strayEntries) {
    issues.push(`stray entry in work root: ${s} (move it under files/, tmp/, or scripts/)`);
  }
  for (const c of portConflicts) {
    issues.push(
      `port ${c.port} (${c.worktree}/${c.service}) also allocated by work ${c.otherWork} (${c.otherOwner})`,
    );
  }
  if (archived) {
    // Archive frees ports and removes worktrees — flag anything left behind.
    if (ports.length > 0) {
      issues.push(
        `archived work still pins ${ports.length} port${ports.length === 1 ? '' : 's'} (should be freed)`,
      );
    }
    const present = worktrees.filter((w) => w.present);
    if (present.length > 0) {
      issues.push(
        `archived work has ${present.length} worktree${present.length === 1 ? '' : 's'} on disk (should be removed): ${present
          .map((w) => w.name)
          .join(', ')}`,
      );
    }
    // A leftover wt/ dir with stray contents.
    const wtDir = worktreesDir(root, name);
    if (exists(wtDir) && fs.readdirSync(wtDir).length > 0 && present.length === 0) {
      issues.push('archived work has leftover entries under wt/');
    }
  } else {
    // Active work: every recorded worktree should exist on disk.
    const missing = worktrees.filter((w) => !w.present);
    for (const m of missing) {
      issues.push(`worktree "${m.name}" recorded but missing on disk (wt/${m.name})`);
    }
  }

  return {
    name,
    path: wd,
    archived,
    worktrees,
    ports,
    strayEntries,
    portConflicts,
    healthy: issues.length === 0,
    issues,
    extra: runWorkHealthHook(root, name),
  };
}

/**
 * Options for `listWorkHealth`.
 */
export interface ListWorkHealthOpts {
  /** Include archived works alongside active ones (default: active only). */
  includeArchived?: boolean;
}

/**
 * Compute a `WorkHealth` snapshot for every work in the runtime.
 *
 * Active works only by default; pass `includeArchived` to add archived ones.
 *
 * @param root - Runtime root.
 * @param opts - Listing options.
 * @returns One health snapshot per work, in `listWorkNames` order.
 */
export function listWorkHealth(root: string, opts: ListWorkHealthOpts = {}): WorkHealth[] {
  const out: WorkHealth[] = [];
  for (const name of listWorkNames(root)) {
    let h: WorkHealth;
    try {
      h = workHealth(root, name);
    } catch {
      continue; // skip a work whose manifest can't be read
    }
    if (h.archived && opts.includeArchived !== true) continue;
    out.push(h);
  }
  return out;
}
