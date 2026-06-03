import {
  requireRuntime,
  inferContext,
  repoAdd,
  listReposInfo,
  repoFetch,
  repoInfo,
  repoRemove,
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
 * Dispatch the `mx repo` subcommands. Targeted actions accept the repo via
 * `-n`, or infer it from the cwd when inside a repo/worktree.
 *
 * @param positionals - Positional args (positionals[1] is the repo action).
 * @param flags - Parsed flags.
 */
export function dispatchRepo(positionals: string[], flags: Flags): void {
  const action = positionals[1];
  const root = requireRuntime({ runtime: flags.runtime });
  // For targeted actions, -n may be omitted when inside a repo's worktree or clone.
  const ctxRepo = inferContext(root).repo;

  switch (action) {
    case 'add': {
      const url = need(positionals[2], 'usage: mx repo add <git-url> [--name <n>]');
      const res = repoAdd(root, url, flags.name);
      emit(() => console.log(`cloned ${res.name} -> ${res.path}`), res);
      return;
    }
    case 'ls': {
      const repos = listReposInfo(root);
      emit(() => {
        for (const r of repos) console.log(`${r.name}  [${r.branch}]  ${r.remote ?? '(no remote)'}`);
      }, repos);
      return;
    }
    case 'fetch': {
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name> or run inside a repo (mx repo -n <name> fetch)',
      );
      const res = repoFetch(root, name);
      emit(
        () =>
          console.log(
            `fetched ${res.name} — ${res.remoteBranches.length} branch(es) on origin, now on ${res.branch}`,
          ),
        res,
      );
      return;
    }
    case 'info': {
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name> or run inside a repo (mx repo -n <name> info)',
      );
      const res = repoInfo(root, name);
      emit(() => {
        console.log(
          `${res.name}\n  path:   ${res.path}\n  branch: ${res.branch}\n  remote: ${res.remote ?? '(none)'}`,
        );
        console.log(
          `  used by works: ${res.worktreesInWorks.length ? res.worktreesInWorks.join(', ') : '(none)'}`,
        );
      }, res);
      return;
    }
    case 'rm': {
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name> or run inside a repo (mx repo -n <name> rm)',
      );
      const res = repoRemove(root, name);
      emit(() => console.log(`removed repo ${res.name}`), res);
      return;
    }
    default:
      throw new MxError(`unknown repo command: ${action ?? '(none)'}`, 'BAD_ARGS');
  }
}
