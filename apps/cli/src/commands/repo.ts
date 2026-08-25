import {
  requireRuntime,
  inferContext,
  repoAdd,
  repoNew,
  repoGitDir,
  listReposInfo,
  repoFetch,
  repoInfo,
  repoHealth,
  listRepoHealth,
  repoRemove,
  workNew,
  worktreeAdd,
  MxError,
} from '@mx/core';
import type { RepoHealth } from '@mx/core';
import { emit, dim, bold, check, warn, tildify } from '../output';
import { openWorkInTerminal } from './work';
import { runPreHook, runPostHook } from '../hooks';
import type { Flags } from '../args';

/**
 * Run a repo fetch wrapped in its pre/post hooks. The pre-hook can veto the
 * fetch (throws `HOOK_FAILED`); the post-hook is best-effort.
 *
 * @param root - Runtime root.
 * @param name - Repo name.
 * @param porcelain - Quiet hook stdio when true.
 * @returns The fetch result.
 */
function fetchWithHooks(root: string, name: string, porcelain: boolean): ReturnType<typeof repoFetch> {
  const gitDir = repoGitDir(root, name);
  const env = { MX_REPO: name, MX_REPO_PATH: repoInfo(root, name).path, MX_GIT_DIR: gitDir };
  runPreHook(root, 'pre-repo-fetch', { cwd: gitDir, env }, porcelain);
  const res = repoFetch(root, name);
  runPostHook(root, 'post-repo-fetch', { cwd: gitDir, env }, porcelain);
  return res;
}

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
      const res = repoAdd(root, url, flags.name); // also writes repo.json
      emit(() => console.log(`${check()} cloned ${bold(res.name)} ${dim(`→ ${res.path}`)}`), res);
      return;
    }
    case 'new': {
      // Create a fresh local repo (no remote) — for quick experiments you don't
      // want to push anywhere. With --quick it also spins up a `dev-<name>` work
      // and a worktree on `develop`, so a throwaway app is one command (add -o to
      // open it in a Terminal).
      const name = need(
        positionals[2],
        'usage: mx repo new <name> [--quick] [-o] [--description <t>]',
      );
      const res = repoNew(root, name); // also writes repo.json

      if (!flags.quick) {
        emit(() => {
          console.log(`${check()} created repo ${bold(res.name)} ${dim('(local, no remote)')}`);
          console.log(`  ${dim(res.path)}`);
          console.log(`  ${dim(`next: mx repo new ${res.name} --quick -o (or add it to a work yourself)`)}`);
        }, res);
        return;
      }

      // --quick: scaffold a `dev-<name>` work and a worktree of the new repo on
      // the `develop` branch in one shot. The pristine clone holds `main`, so the
      // worktree forks `main` onto `develop` (git won't check out `main` twice).
      const workName = `dev-${name}`;
      const workRes = workNew(root, workName, flags.description ?? '');
      const wtRes = worktreeAdd(root, workName, name, { branch: 'develop' });
      runPostHook(
        root,
        'post-worktree-create',
        {
          cwd: wtRes.path,
          env: {
            MX_WORK: workName,
            MX_REPO: name,
            MX_WORKTREE_NAME: wtRes.name,
            MX_BRANCH: wtRes.branch,
            MX_BASE: '',
            MX_WORKTREE_PATH: wtRes.path,
            MX_WORK_PATH: workRes.path,
            MX_GIT_DIR: repoGitDir(root, name),
          },
        },
        flags.porcelain,
      );
      let opened = false;
      if (flags.open) {
        try {
          // Ensure the new work's tmux session and open it in a terminal — same
          // path as `mx work new -o`. Best-effort: a window failure is a warning,
          // `mx work -n <work> attach` still works in-place.
          openWorkInTerminal(root, workRes.name, workRes.path, flags);
          opened = true;
        } catch (e) {
          const msg = e instanceof MxError ? e.message : String(e);
          process.stderr.write(
            `${warn()} ${dim(`could not open a terminal: ${msg}`)}\n` +
              `${dim(`  run \`mx work -n ${workRes.name} attach\` in a terminal instead.`)}\n`,
          );
        }
      }
      emit(() => {
        console.log(`${check()} created repo ${bold(res.name)} ${dim('(local, no remote)')}`);
        console.log(`${check()} created work ${bold(workRes.name)} ${dim(`→ ${workRes.path}`)}`);
        console.log(
          `${check()} added worktree ${bold(wtRes.repo)} ${dim(`[${wtRes.branch}]`)} ${dim(`→ ${wtRes.path}`)}`,
        );
        if (opened) console.log(`${check()} opened ${dim('(Terminal)')}`);
      }, { repo: res, work: workRes, worktree: wtRes, opened });
      return;
    }
    case 'ls': {
      const repos = listReposInfo(root);
      emit(() => {
        if (repos.length === 0) {
          console.log(dim('no repos yet — `mx repo add <git-url>`'));
          return;
        }
        // Same clean shape as `mx work ls`: bold name, dim path, dim detail,
        // a blank line between entries.
        for (let i = 0; i < repos.length; i++) {
          if (i > 0) console.log();
          const r = repos[i];
          console.log(`• ${bold(r.name)}`);
          console.log(`  ${dim(tildify(r.path))}`);
          console.log(`  ${dim(`${r.branch}  ${r.remote ?? '(no remote)'}`)}`);
        }
      }, repos);
      return;
    }
    case 'path': {
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name> or run inside a repo (mx repo -n <name> path)',
      );
      // Raw path — meant for shell substitution, no styling. repoInfo throws
      // NO_REPO if the repo doesn't exist.
      const res = repoInfo(root, name);
      emit(() => console.log(res.path), { name: res.name, path: res.path });
      return;
    }
    case 'fetch': {
      // `mx repo fetch --all` (or `mx repo --all fetch`): fetch every repo,
      // one by one, continuing past any individual failure.
      if (flags.all) {
        const names = listReposInfo(root).map((r) => r.name);
        if (names.length === 0) {
          emit(() => console.log(dim('no repos yet — `mx repo add <git-url>`')), []);
          return;
        }
        const out: unknown[] = [];
        const lines: string[] = [];
        for (const n of names) {
          try {
            const r = fetchWithHooks(root, n, flags.porcelain);
            out.push(r);
            lines.push(
              `${check()} ${bold(r.name)} ${dim(`— ${r.remoteBranches.length} branch(es) on origin, now on ${r.branch}`)}`,
            );
          } catch (e) {
            const msg = e instanceof MxError ? e.message : String(e);
            out.push({ name: n, error: msg });
            lines.push(`${warn()} ${bold(n)} ${dim(`— ${msg}`)}`);
          }
        }
        emit(() => lines.forEach((l) => console.log(l)), out);
        return;
      }
      const name = need(
        flags.name || ctxRepo,
        'which repo? pass -n <name>, run inside a repo, or use --all (mx repo -n <name> fetch)',
      );
      const res = fetchWithHooks(root, name, flags.porcelain);
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
      // With -n (or cwd) → one repo's detail block. Without → the same detail
      // block for every repo, one after another (so both views match).
      const name = flags.name || ctxRepo;
      if (name) {
        const h = repoHealth(root, name);
        emit(() => renderHealthDetail(h), h);
      } else {
        const list = listRepoHealth(root);
        emit(() => {
          if (list.length === 0) {
            console.log(dim('no repos yet — `mx repo add <git-url>`'));
            return;
          }
          list.forEach((h, i) => {
            if (i > 0) console.log();
            renderHealthDetail(h);
          });
        }, list);
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
 * Render the detail-mode `mx repo health` output: a structured per-metric
 * block with ✓/⚠ markers on each row, value column aligned so the markers
 * sit in a single vertical column.
 *
 * @param h - The repo health snapshot.
 * @param indent - Left padding prefixed to every line (used by `mx health` to
 *   nest each block under its section header). Blank lines stay blank.
 */
export function renderHealthDetail(h: RepoHealth, indent = ''): void {
  const log = (s = ''): void => console.log(s === '' ? '' : indent + s);
  type Row = { label: string; value: string; marker?: string; hint?: string };
  const rows: Row[] = [];
  // Tracks whether any checked row (or the hook `extra`) flagged a problem, so
  // the name line can carry an at-a-glance ✓/⚠ for the whole block.
  let anyWarn = false;
  const addRow = (label: string, value: string, ok?: boolean, hint?: string): void => {
    const marker = ok === undefined ? undefined : ok ? check() : warn();
    if (ok === false) anyWarn = true;
    rows.push({ label, value, marker, hint });
  };

  // Only health metrics (rows that carry a ✓/⚠) are shown — informational
  // fields like default branch, last fetched, and worktree count live in
  // `mx repo info`. `current branch` is the metric: ✓ when it matches the
  // default. With no remote (no origin/HEAD, e.g. a `mx repo new` repo) there's
  // no default to compare against, so any branch is fine — only a detached HEAD
  // is flagged. Matches `@mx/core`, which adds an issue only when a default exists.
  const currentBranchText = h.currentBranch ?? '(detached HEAD)';
  const branchOk = h.currentBranch !== null && (h.defaultBranch === null || h.isOnDefault);
  addRow(
    'current branch',
    currentBranchText,
    branchOk,
    h.currentBranch === null
      ? 'HEAD is detached'
      : h.defaultBranch !== null && !h.isOnDefault
        ? `should be ${h.defaultBranch}`
        : undefined,
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
  // Freshness metric — only meaningful for a repo with a remote (a local
  // `repo new` repo, with no origin/HEAD, never fetches). ✓ when fetched within
  // the last 24h, ⚠ stale otherwise (or never).
  if (h.defaultBranch !== null) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const fetchedAt = h.lastFetchedAt ? Date.parse(h.lastFetchedAt) : null;
    const fresh = fetchedAt !== null && Date.now() - fetchedAt < DAY_MS;
    addRow(
      'last fetched',
      relativeTime(h.lastFetchedAt),
      fresh,
      fresh ? undefined : `stale — run \`mx repo -n ${h.name} fetch\``,
    );
  }

  // The central repo-health hook output becomes a trailing `extra` row, always
  // shown: the convention is that a healthy hook says nothing — empty output or
  // a bare "ok"/"OK" renders ✓ "OK"; anything else renders ⚠ with the message
  // and flags the block.
  const extraText = (h.extra ?? '').replace(/\s+$/, '');
  const extraOk = extraText === '' || extraText.toLowerCase() === 'ok';
  const extraLines = extraOk ? [] : extraText.split('\n');
  if (!extraOk) anyWarn = true;

  // Show only metric rows (those carrying a ✓/⚠); this also drops ahead/behind
  // when there's no upstream to compare against. `extra` is always shown below.
  const metricRows = rows.filter((r) => r.marker !== undefined);
  const labelW = Math.max(...metricRows.map((r) => r.label.length), 5);
  const valueW = Math.max(0, ...metricRows.map((r) => r.value.length));

  log(`${bold(h.name)}  ${anyWarn ? warn() : check()}`);
  for (const r of metricRows) {
    const label = dim(r.label.padEnd(labelW));
    const value = r.value.padEnd(valueW);
    const marker = r.marker ? `  ${r.marker}` : '   ';
    const hint = r.hint ? `  ${dim(r.hint)}` : '';
    log(`  ${label}  ${value}${marker}${hint}`);
  }
  // Extra row: ✓ "OK" when the hook reported healthy, ⚠ + message when it did not.
  const extraValue = (extraOk ? 'OK' : extraLines[0]).padEnd(valueW);
  log(`  ${dim('extra'.padEnd(labelW))}  ${dim(extraValue)}  ${extraOk ? check() : warn()}`);
  for (const line of extraLines.slice(1)) log(`  ${' '.repeat(labelW)}  ${dim(line)}`);
}
