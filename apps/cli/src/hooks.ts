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
 * Outcome of running a stdout-capturing hook (e.g. `session-prompt`).
 */
export interface HookCapture {
  /** True if the hook file existed and was executed. */
  ran: boolean;
  /** True if it ran and exited 0 (also true when there was nothing to run). */
  ok: boolean;
  /** True if there is no hook file for this event. */
  missing: boolean;
  /** The hook's captured stdout, trailing whitespace trimmed; `''` when absent or it failed. */
  stdout: string;
}

/**
 * Run a hook and **capture** its stdout instead of inheriting it. Used by
 * stdout-driven hooks whose output mx consumes — currently `session-prompt`,
 * whose stdout becomes the initial prompt for a new Claude session opened by
 * `mx work open`. Never throws; a missing hook yields empty stdout, and a
 * non-zero exit is surfaced as a warning (non-porcelain) with its output ignored
 * so a broken hook can't inject a garbage prompt.
 *
 * @param root - Runtime root.
 * @param event - The stdout-capturing event to fire.
 * @param ctx - Working directory + event-specific env.
 * @param quiet - When true, suppress the warning on a non-zero exit (keeps `--porcelain` clean).
 * @returns The capture outcome including the hook's stdout.
 */
export function runHookCapture(
  root: string,
  event: HookEvent,
  ctx: HookContext,
  quiet: boolean,
): HookCapture {
  const script = hookScript(root, event);
  if (!existsSync(script)) return { ran: false, ok: true, missing: true, stdout: '' };
  const env = { ...process.env, MX_RUNTIME: root, MX_EVENT: event, ...ctx.env };
  const r = spawnSync(script, [], {
    cwd: ctx.cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = r.status === 0;
  if (r.status !== 0 && !quiet) {
    process.stderr.write(`${warn()} ${dim(`${event} hook exited non-zero — ignoring its output`)}\n`);
  }
  // Only trust stdout on a clean exit; trim the trailing newline the hook likely emits.
  const stdout = ok ? (r.stdout ?? '').replace(/\s+$/, '') : '';
  return { ran: true, ok, missing: false, stdout };
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
