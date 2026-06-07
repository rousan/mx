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
import { emit, dim, bold, check } from '../output';
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
      emit(() => console.log(`${check()} cloned ${bold(res.name)} ${dim(`→ ${res.path}`)}`), res);
      return;
    }
    case 'ls': {
      const repos = listReposInfo(root);
      emit(() => {
        if (repos.length === 0) {
          console.log(dim('no repos yet — `mx repo add <git-url>`'));
          return;
        }
        const nameW = Math.max(...repos.map((r) => r.name.length));
        const branchW = Math.max(...repos.map((r) => r.branch.length));
        for (const r of repos) {
          const name = r.name.padEnd(nameW);
          const branch = dim(r.branch.padEnd(branchW));
          const remote = dim(r.remote ?? '(no remote)');
          console.log(`• ${name}  ${branch}  ${remote}`);
        }
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
            `${check()} fetched ${bold(res.name)} ${dim(`— ${res.remoteBranches.length} branch(es) on origin, now on ${res.branch}`)}`,
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
        console.log(bold(res.name));
        console.log(`  ${dim('path  ')}  ${dim(res.path)}`);
        console.log(`  ${dim('branch')}  ${dim(res.branch)}`);
        console.log(`  ${dim('remote')}  ${dim(res.remote ?? '(none)')}`);
        const usedBy = res.worktreesInWorks.length
          ? res.worktreesInWorks.join(', ')
          : '(none)';
        console.log(`  ${dim('used  ')}  ${dim(usedBy)}`);
      }, res);
      return;
    }
    case 'rm': {
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name> or run inside a repo (mx repo -n <name> rm)',
      );
      const res = repoRemove(root, name);
      emit(() => console.log(`${check()} removed repo ${bold(res.name)}`), res);
      return;
    }
    default:
      throw new MxError(`unknown repo command: ${action ?? '(none)'}`, 'BAD_ARGS');
  }
}
