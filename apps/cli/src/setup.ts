import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { repoSetupScript, workPath } from '@mx/core';

/**
 * Inputs for running a repo's per-worktree setup hook.
 */
export interface SetupContext {
  /** Runtime root. */
  root: string;
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Absolute path to the worktree just created. */
  worktreePath: string;
  /** Branch the worktree is on. */
  branch: string;
  /** Base ref the worktree was forked from, if any. */
  base?: string;
}

/**
 * Outcome of a setup-hook run.
 */
export interface SetupOutcome {
  /** True if the script existed and was executed. */
  ran: boolean;
  /** True if it ran and exited 0 (also true when there was nothing to run). */
  ok: boolean;
  /** True if the repo has no `setup.sh` (nothing was run). */
  missing: boolean;
}

/**
 * Run a repo's `setup.sh` for a freshly-created worktree. The script runs with
 * the worktree as its working directory and receives context as both positional
 * args (`$1` worktree path, `$2` branch) and `MX_*` environment variables.
 *
 * Never throws: a missing script is a no-op; a non-zero exit is reported via the
 * outcome so the caller can warn without unwinding the (already created)
 * worktree.
 *
 * @param ctx - Worktree/setup context.
 * @param quiet - When true, suppress the script's stdio (keeps `--porcelain` clean).
 * @returns Whether the script ran and succeeded.
 */
export function runWorktreeSetup(ctx: SetupContext, quiet: boolean): SetupOutcome {
  const script = repoSetupScript(ctx.root, ctx.repo);
  if (!existsSync(script)) return { ran: false, ok: true, missing: true };
  const env = {
    ...process.env,
    MX_RUNTIME: ctx.root,
    MX_WORK: ctx.work,
    MX_REPO: ctx.repo,
    MX_WORKTREE_PATH: ctx.worktreePath,
    MX_BRANCH: ctx.branch,
    MX_BASE: ctx.base ?? '',
    MX_WORK_PATH: workPath(ctx.root, ctx.work).path,
  };
  const r = spawnSync(script, [ctx.worktreePath, ctx.branch], {
    cwd: ctx.worktreePath,
    env,
    stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
  });
  return { ran: true, ok: r.status === 0, missing: false };
}
