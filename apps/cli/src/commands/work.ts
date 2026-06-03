import {
  requireRuntime,
  inferContext,
  workNew,
  listWorksInfo,
  workInfo,
  workDescribe,
  workPath,
  worktreeAdd,
  worktreeList,
  worktreeRemove,
  workDestroy,
  portSet,
  portUnset,
  portList,
  MxError,
} from '@mx/core';
import { emit } from '../output';
import type { Flags } from '../args';

/**
 * Require a non-empty string argument, throwing a usage `MxError` otherwise.
 *
 * @param v - The candidate value.
 * @param msg - Usage message to surface when missing.
 * @returns The value, narrowed to a non-empty string.
 */
function need(v: string | undefined | null, msg: string): string {
  if (v == null || v === '') throw new MxError(msg, 'BAD_ARGS');
  return v;
}

/**
 * Dispatch the `mx work` subcommands. `new`/`ls` are component-level; all other
 * actions target a work via `-n` or infer it from the cwd.
 *
 * @param positionals - Positional args (positionals[1] is the work action).
 * @param flags - Parsed flags.
 */
export function dispatchWork(positionals: string[], flags: Flags): void {
  const action = positionals[1];

  if (action === 'new') {
    const root = requireRuntime({ runtime: flags.runtime });
    const name = need(positionals[2], 'usage: mx work new <name> [--description <text>]');
    const res = workNew(root, name, flags.description ?? '');
    emit(() => {
      console.log(`created work ${res.name}`);
      console.log(`  ${res.path}`);
    }, res);
    return;
  }

  if (action === 'ls') {
    const root = requireRuntime({ runtime: flags.runtime });
    const works = listWorksInfo(root);
    emit(() => {
      for (const w of works) {
        console.log(
          `${w.name}  (${w.worktrees} worktree${w.worktrees === 1 ? '' : 's'})${w.description ? `  — ${w.description}` : ''}`,
        );
      }
    }, works);
    return;
  }

  // All remaining work actions target an existing work via -n <name>, or the
  // work inferred from the cwd when you're inside a work folder / worktree.
  const root = requireRuntime({ runtime: flags.runtime });
  const name = need(
    flags.name || inferContext(root).work,
    `which work? pass -n <name> or run inside a work folder (mx work -n <name> ${action ?? '<command>'})`,
  );

  switch (action) {
    case 'info': {
      const work = workInfo(root, name);
      emit(() => console.log(JSON.stringify(work, null, 2)), work);
      return;
    }
    case 'path': {
      const res = workPath(root, name);
      emit(() => console.log(res.path), res);
      return;
    }
    case 'describe': {
      const text = need(positionals[2], 'usage: mx work -n <name> describe <text>');
      const work = workDescribe(root, name, text);
      emit(() => console.log(`updated description of ${name}`), work);
      return;
    }
    case 'worktree':
      return workWorktree(root, name, positionals, flags);
    case 'port':
      return workPort(root, name, positionals);
    case 'destroy': {
      const res = workDestroy(root, name);
      emit(
        () =>
          console.log(
            `destroyed work ${name} (worktrees removed: ${res.removedWorktrees.join(', ') || 'none'}; branches kept)`,
          ),
        res,
      );
      return;
    }
    default:
      throw new MxError(`unknown work command: ${action ?? '(none)'}`, 'BAD_ARGS');
  }
}

/**
 * Handle `mx work -n <name> worktree add|ls|rm`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param positionals - Positional args (positionals[2] is the worktree action).
 * @param flags - Parsed flags (provides --branch/--base for add).
 */
function workWorktree(root: string, name: string, positionals: string[], flags: Flags): void {
  const sub = positionals[2];
  switch (sub) {
    case 'add': {
      const repo = need(
        positionals[3],
        'usage: mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>]',
      );
      const res = worktreeAdd(root, name, repo, { branch: flags.branch, base: flags.base });
      emit(() => console.log(`added worktree ${res.repo} [${res.branch}] -> ${res.path}`), res);
      return;
    }
    case 'ls': {
      const list = worktreeList(root, name);
      emit(() => {
        for (const wt of list) {
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${s}:${p}`)
            .join(', ');
          console.log(`${wt.repo}  [${wt.branch}]${ports ? `  (${ports})` : ''}`);
        }
      }, list);
      return;
    }
    case 'rm': {
      const repo = need(positionals[3], 'usage: mx work -n <name> worktree rm <repo>');
      const res = worktreeRemove(root, name, repo);
      emit(() => console.log(`removed worktree ${res.repo} from ${name} (branch ${res.branch} kept)`), res);
      return;
    }
    default:
      throw new MxError(`unknown worktree command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}

/**
 * Handle `mx work -n <name> port set|unset|ls`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param positionals - Positional args (positionals[2] is the port action).
 */
function workPort(root: string, name: string, positionals: string[]): void {
  const sub = positionals[2];
  switch (sub) {
    case 'set': {
      const usage = 'usage: mx work -n <name> port set <repo> <service> [<port>]';
      const repo = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const portArg = positionals[5];
      let port: number | undefined;
      if (portArg != null) {
        port = Number(portArg);
        if (!Number.isInteger(port)) throw new MxError(`invalid port: ${portArg}`, 'BAD_ARGS');
      }
      const res = portSet(root, name, repo, service, port);
      emit(() => console.log(`${res.repo}.${res.service} -> ${res.port}`), res);
      return;
    }
    case 'unset': {
      const usage = 'usage: mx work -n <name> port unset <repo> <service>';
      const repo = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const res = portUnset(root, name, repo, service);
      emit(() => console.log(`unset ${res.repo}.${res.service} (was ${res.released})`), res);
      return;
    }
    case 'ls': {
      const map = portList(root, name);
      emit(() => {
        for (const [repo, ports] of Object.entries(map)) {
          for (const [service, port] of Object.entries(ports)) {
            console.log(`${repo}.${service} -> ${port}`);
          }
        }
      }, map);
      return;
    }
    default:
      throw new MxError(`unknown port command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}
