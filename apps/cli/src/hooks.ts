import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { hookScript, MxError, type HookEvent } from '@mx/core';
import { dim, warn } from './output';

/**
 * Outcome of attempting to run a lifecycle hook.
 */
export interface HookOutcome {
  /** True if the hook file existed and was executed. */
  ran: boolean;
  /** True if it ran and exited 0 (also true when there was nothing to run). */
  ok: boolean;
  /** True if there is no hook file for this event (nothing was run). */
  missing: boolean;
}

/**
 * Context passed to a hook: its working directory and the `MX_*` environment it
 * should see (beyond `MX_RUNTIME` / `MX_EVENT`, which are added automatically).
 */
export interface HookContext {
  /** Working directory the hook runs in. */
  cwd: string;
  /** Event-specific `MX_*` variables (omit empties or pass `''`). */
  env: Record<string, string>;
}

/**
 * Run the central hook for an event if present. The hook is `<runtime>/hooks/<event>`,
 * executed (any shebang) with `ctx.cwd` as the working directory and the merged
 * `MX_*` environment. Never throws — a missing hook is a no-op; the caller
 * decides what a non-zero exit means.
 *
 * @param root - Runtime root.
 * @param event - Lifecycle event to fire.
 * @param ctx - Working directory + event-specific env.
 * @param quiet - When true, suppress the hook's stdio (keeps `--porcelain` clean).
 * @returns Whether the hook ran and succeeded.
 */
export function runHook(root: string, event: HookEvent, ctx: HookContext, quiet: boolean): HookOutcome {
  const script = hookScript(root, event);
  if (!existsSync(script)) return { ran: false, ok: true, missing: true };
  const env = { ...process.env, MX_RUNTIME: root, MX_EVENT: event, ...ctx.env };
  const r = spawnSync(script, [], {
    cwd: ctx.cwd,
    env,
    stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit',
  });
  return { ran: true, ok: r.status === 0, missing: false };
}

/**
 * Run a `pre-*` hook and **abort the operation** (throw `HOOK_FAILED`) if it
 * exits non-zero — the veto point before anything is mutated.
 *
 * @param root - Runtime root.
 * @param event - The `pre-*` event.
 * @param ctx - Hook context.
 * @param quiet - Suppress stdio when true.
 */
export function runPreHook(root: string, event: HookEvent, ctx: HookContext, quiet: boolean): void {
  const o = runHook(root, event, ctx, quiet);
  if (o.ran && !o.ok) {
    throw new MxError(`${event} hook exited non-zero — operation aborted`, 'HOOK_FAILED');
  }
}

/**
 * Run a `post-*` hook (best-effort): a non-zero exit is reported as a warning,
 * never an error — the operation already happened.
 *
 * @param root - Runtime root.
 * @param event - The `post-*` event.
 * @param ctx - Hook context.
 * @param porcelain - When true, run quietly and skip the warning line.
 * @returns The hook outcome.
 */
export function runPostHook(
  root: string,
  event: HookEvent,
  ctx: HookContext,
  porcelain: boolean,
): HookOutcome {
  const o = runHook(root, event, ctx, porcelain);
  if (o.ran && !o.ok && !porcelain) {
    process.stderr.write(`${warn()} ${dim(`${event} hook exited non-zero (operation already applied)`)}\n`);
  }
  return o;
}
