import {
  requireRuntime,
  inferContext,
  repoAdd,
  repoPath,
  stampRepoScripts,
  listReposInfo,
  repoFetch,
  repoInfo,
  repoHealth,
  listRepoHealth,
  repoRemove,
  MxError,
} from '@mx/core';
import type { RepoHealth } from '@mx/core';
import { emit, dim, bold, check, warn, tildify } from '../output';
import { templatesDir } from '../paths';
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
      // Stamp the repo's mx-owned scripts (setup.sh) into its container.
      stampRepoScripts(repoPath(root, res.name), templatesDir());
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
          console.log(`  ${dim(tildify(r.path))}`);
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
    case 'health': {
      // No -n → list mode (all repos, ✓/⚠ prefix). With -n (or cwd) → detail mode.
      const name = flags.name || ctxRepo;
      if (name) {
        const h = repoHealth(root, name);
        emit(() => renderHealthDetail(h), h);
      } else {
        const list = listRepoHealth(root);
        emit(() => renderHealthList(list), list);
      }
      return;
    }
    default:
      throw new MxError(`unknown repo command: ${action ?? '(none)'}`, 'BAD_ARGS');
  }
}

/**
 * Format an ISO timestamp as a coarse "N {units} ago" string suitable for an
 * at-a-glance health view (e.g. "2 hours ago", "6 days ago"). Returns "never"
 * when input is null.
 *
 * @param iso - ISO-8601 timestamp, or null.
 * @returns Human relative string.
 */
function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Render the list-mode `mx repo health` output: one line per repo,
 * prefixed with ✓ for healthy and ⚠ for any issues.
 *
 * @param list - One health snapshot per repo.
 */
function renderHealthList(list: RepoHealth[]): void {
  if (list.length === 0) {
    console.log(dim('no repos yet — `mx repo add <git-url>`'));
    return;
  }
  const nameW = Math.max(...list.map((h) => h.name.length));
  for (const h of list) {
    const marker = h.healthy ? check() : warn();
    const name = h.name.padEnd(nameW);
    const detail = h.healthy ? '' : `  ${dim(h.issues.join('; '))}`;
    console.log(`${marker} ${name}${detail}`);
  }
}

/**
 * Render the detail-mode `mx repo health` output: a structured per-metric
 * block with ✓/⚠ markers on each row, value column aligned so the markers
 * sit in a single vertical column.
 *
 * @param h - The repo health snapshot.
 */
function renderHealthDetail(h: RepoHealth): void {
  type Row = { label: string; value: string; marker?: string; hint?: string };
  const rows: Row[] = [];
  const addRow = (label: string, value: string, ok?: boolean, hint?: string): void => {
    const marker = ok === undefined ? undefined : ok ? check() : warn();
    rows.push({ label, value, marker, hint });
  };

  addRow('default branch', h.defaultBranch ?? '(unknown)');

  const currentBranchText = h.currentBranch ?? '(detached HEAD)';
  const branchOk = h.currentBranch !== null && h.isOnDefault;
  addRow(
    'current branch',
    currentBranchText,
    branchOk,
    branchOk
      ? undefined
      : h.currentBranch === null
        ? 'HEAD is detached'
        : `should be ${h.defaultBranch ?? '(default)'}`,
  );
  addRow(
    'uncommitted',
    `${h.uncommittedChanges} change${h.uncommittedChanges === 1 ? '' : 's'}`,
    h.uncommittedChanges === 0,
    h.uncommittedChanges === 0 ? undefined : 'commit or discard',
  );
  addRow(
    'untracked',
    `${h.untrackedFiles} file${h.untrackedFiles === 1 ? '' : 's'}`,
    h.untrackedFiles === 0,
  );
  addRow(
    'ahead of origin',
    h.aheadOfOrigin === null
      ? '(no upstream)'
      : `${h.aheadOfOrigin} commit${h.aheadOfOrigin === 1 ? '' : 's'}`,
    h.aheadOfOrigin === null ? undefined : h.aheadOfOrigin === 0,
  );
  addRow(
    'behind of origin',
    h.behindOfOrigin === null
      ? '(no upstream)'
      : `${h.behindOfOrigin} commit${h.behindOfOrigin === 1 ? '' : 's'}`,
    h.behindOfOrigin === null ? undefined : h.behindOfOrigin === 0,
    (h.behindOfOrigin ?? 0) > 0 ? `run \`mx repo -n ${h.name} fetch\`` : undefined,
  );
  addRow('last fetched', relativeTime(h.lastFetchedAt));
  const usedByCount = h.worktreesInWorks.length;
  rows.push({
    label: 'worktrees in works',
    value: String(usedByCount),
    hint: usedByCount ? `used by: ${h.worktreesInWorks.join(', ')}` : undefined,
  });

  // Align the marker column by padding values to the widest plain length.
  const labelW = Math.max(...rows.map((r) => r.label.length));
  const valueW = Math.max(...rows.map((r) => r.value.length));

  console.log(bold(h.name));
  for (const r of rows) {
    const label = dim(r.label.padEnd(labelW));
    const value = r.value.padEnd(valueW);
    const marker = r.marker ? `  ${r.marker}` : '   ';
    const hint = r.hint ? `  ${dim(r.hint)}` : '';
    console.log(`  ${label}  ${value}${marker}${hint}`);
  }

  // Repo-specific augmentation from the repo's health.sh, if any.
  if (h.extra) {
    console.log();
    console.log(`  ${dim('health.sh')}`);
    for (const line of h.extra.split('\n')) console.log(`    ${dim(line)}`);
  }
}
