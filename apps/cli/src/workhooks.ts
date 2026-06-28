import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { workHookScript, workPath, type WorkHookEvent } from '@mx/core';

/**
 * Outcome of running a per-work lifecycle hook.
 */
export interface WorkHookOutcome {
  /** True if the script existed and was executed. */
  ran: boolean;
  /** True if it ran and exited 0 (also true when there was nothing to run). */
  ok: boolean;
  /** True if the work has no script for this event (nothing was run). */
  missing: boolean;
}

/**
 * Run a work's lifecycle hook for an archive/unarchive event, if present. The
 * script runs with the work folder as its working directory and receives the
 * event name and work path as positional args (`$1`, `$2`) plus `MX_*`
 * environment variables.
 *
 * Never throws: a missing script is a no-op. The caller decides what a non-zero
 * exit means — `pre-*` callers abort the operation (`HOOK_FAILED`), `post-*`
 * callers only warn (the operation already happened).
 *
 * @param root - Runtime root.
 * @param work - Work name.
 * @param event - Lifecycle event whose script to run.
 * @param quiet - When true, suppress the script's stdio (keeps `--porcelain` clean).
 * @returns Whether the script ran and succeeded.
 */
export function runWorkHook(
  root: string,
  work: string,
  event: WorkHookEvent,
  quiet: boolean,
): WorkHookOutcome {
  const script = workHookScript(root, work, event);
  if (!existsSync(script)) return { ran: false, ok: true, missing: true };
  const wp = workPath(root, work).path;
  const env = {
    ...process.env,
    MX_RUNTIME: root,
    MX_WORK: work,
    MX_WORK_PATH: wp,
    MX_EVENT: event,
  };
  const r = spawnSync(script, [event, wp], {
    cwd: wp,
    env,
    stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
  });
  return { ran: true, ok: r.status === 0, missing: false };
}
