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
  worktreePath,
  repoGitDir,
  workDestroy,
  archiveWork,
  unarchiveWork,
  portSet,
  portUnset,
  portList,
  MxError,
} from '@mx/core';
import { existsSync } from 'node:fs';
import { emit, dim, bold, check, warn, confirmYesNo, tildify } from '../output';
import { openWorkLayout } from '../open';
import { runPreHook, runPostHook } from '../hooks';
import type { Flags } from '../args';

/**
 * Build the `MX_*` env for a worktree-related hook.
 *
 * @param name - Work name.
 * @param repo - Repo name.
 * @param wtName - Worktree name (the `wt/<name>` selector).
 * @param branch - Worktree branch.
 * @param worktreePathAbs - Absolute worktree path.
 * @param workFolder - Absolute work folder path.
 * @param gitDir - Repo pristine clone path.
 * @param base - Base ref, if any.
 * @returns The `MX_*` env map.
 */
function worktreeHookEnv(
  name: string,
  repo: string,
  wtName: string,
  branch: string,
  worktreePathAbs: string,
  workFolder: string,
  gitDir: string,
  base = '',
): Record<string, string> {
  return {
    MX_WORK: name,
    MX_REPO: repo,
    MX_WORKTREE_NAME: wtName,
    MX_BRANCH: branch,
    MX_BASE: base,
    MX_WORKTREE_PATH: worktreePathAbs,
    MX_WORK_PATH: workFolder,
    MX_GIT_DIR: gitDir,
  };
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
 * Dispatch the `mx work` subcommands. `new`/`ls` are component-level; all other
 * actions target a work via `-n` or infer it from the cwd.
 *
 * @param positionals - Positional args (positionals[1] is the work action).
 * @param flags - Parsed flags.
 */
export function dispatchWork(positionals: string[], flags: Flags): void {
  // `mx work -n <name> -o` (no explicit action) is shorthand for `… open`.
  let action = positionals[1];
  if (!action && flags.open) action = 'open';

  if (action === 'new') {
    const root = requireRuntime({ runtime: flags.runtime });
    const name = need(positionals[2], 'usage: mx work new <name> [--description <text>] [-o|--open]');
    const res = workNew(root, name, flags.description ?? '');
    emit(() => {
      console.log(`${check()} created work ${bold(res.name)}`);
      console.log(`  ${dim(res.path)}`);
    }, res);
    if (flags.open) {
      // Best-effort: the work is already created, so a window-management
      // failure (or a non-macOS host) is a warning, never a hard error.
      try {
        openWorkLayout(res.path);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(`${warn()} ${dim(`could not open layout: ${msg}`)}\n`);
      }
    }
    return;
  }

  if (action === 'ls') {
    const root = requireRuntime({ runtime: flags.runtime });
    // Default: active works only. --all expands to include archived;
    // --archived narrows to archived-only.
    const works = listWorksInfo(root, {
      includeArchived: flags.all,
      onlyArchived: flags.archived,
    });
    emit(() => {
      // Human mode: detailed per-work view — header line with name + chip +
      // counts; then optional description; then indented worktree rows with
      // branches and ports. Active works first, archived after; alphabetical
      // within each group. Porcelain consumers see the raw order above.
      const ordered = [
        ...works.filter((w) => w.isArchived !== true),
        ...works.filter((w) => w.isArchived === true),
      ];
      if (ordered.length === 0) {
        console.log(dim('no works yet — `mx work new <name>`'));
        return;
      }
      for (let i = 0; i < ordered.length; i++) {
        if (i > 0) console.log();
        const w = ordered[i];
        const wts = w.worktrees ?? [];

        const chip = w.isArchived === true
          ? `  ${dim(`[archived ${(w.archived_at ?? '').slice(0, 10)}]`)}`
          : '';
        // Active work names anchor with bold; archived ones recede with dim
        // so the eye lands on active works first. The bullet is the list
        // marker.
        const styledName = w.isArchived === true ? dim(w.name) : bold(w.name);
        console.log(`• ${styledName}${chip}`);
        console.log(`  ${dim(tildify(w.path))}`);

        if (w.description) {
          console.log(`  ${dim(`— ${w.description}`)}`);
        }

        if (wts.length === 0) {
          console.log(`  ${dim('(no worktrees)')}`);
        } else {
          // Row label is the worktree name; annotate the repo when it differs.
          const wlabel = (t: (typeof wts)[number]): string => {
            const n = t.name ?? t.repo;
            return n === t.repo ? n : `${n} (${t.repo})`;
          };
          const labelW = Math.max(...wts.map((t) => wlabel(t).length));
          for (const t of wts) {
            // All worktree row content sits at the dim tier so the bold work
            // name above is the only "loud" element in the block.
            const label = dim(wlabel(t).padEnd(labelW));
            const branch = dim(`[${t.branch}]`);
            const ports = Object.entries(t.ports ?? {})
              .map(([s, p]) => `${dim(`${s}:${p}`)}`)
              .join('  ');
            const portsCol = ports ? `  ${ports}` : '';
            console.log(`  ${label}  ${branch}${portsCol}`);
          }
        }
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
      emit(() => {
        const archivedChip = work.isArchived === true
          ? `  ${dim(`[archived ${(work.archived_at ?? '').slice(0, 10)}]`)}`
          : '';
        const styledName = work.isArchived === true ? dim(work.name) : bold(work.name);
        console.log(`${styledName}${archivedChip}`);
        if (work.description) console.log(`  ${dim('description')}  ${dim(work.description)}`);
        const wts = work.worktrees ?? [];
        console.log(`  ${dim('worktrees  ')}  ${dim(`${wts.length}`)}`);
        for (const wt of wts) {
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${dim(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          const wn = wt.name ?? wt.repo;
          const label = wn === wt.repo ? wt.repo : `${wn} (${wt.repo})`;
          console.log(`      ${dim(label)}  ${dim(`[${wt.branch}]`)}${portsCol}`);
        }
      }, work);
      return;
    }
    case 'path': {
      // Raw path — meant for shell substitution, no styling.
      const res = workPath(root, name);
      emit(() => console.log(res.path), res);
      return;
    }
    case 'open': {
      // Open an existing work's dev layout (same as `mx work new -o`): a
      // fullscreen Terminal in the work folder + the editor on the workspace.
      const res = workPath(root, name); // throws NO_WORK if it doesn't exist
      try {
        openWorkLayout(res.path);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(`${warn()} ${dim(`could not open layout: ${msg}`)}\n`);
        return;
      }
      emit(
        () => console.log(`${check()} opened ${bold(name)} ${dim('(Terminal)')}`),
        { work: name, opened: true },
      );
      return;
    }
    case 'describe': {
      const text = need(positionals[2], 'usage: mx work -n <name> describe <text>');
      const work = workDescribe(root, name, text);
      emit(() => console.log(`${check()} updated description of ${bold(name)}`), work);
      return;
    }
    case 'worktree':
      return workWorktree(root, name, positionals, flags);
    case 'port':
      return workPort(root, name, positionals);
    case 'destroy': {
      if (flags.force && !flags.porcelain) {
        // Loud reminder right before the irreversible step. Goes to stderr so
        // --porcelain consumers stay clean even if --force is set.
        process.stderr.write(
          `${warn()} ${dim(`permanently removing work "${name}" — folder and any session summaries will be deleted (branches kept). This cannot be undone.`)}\n`,
        );
      }
      const res = workDestroy(root, name, { force: flags.force });
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} destroyed work ${bold(name)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
      }, res);
      return;
    }
    case 'archive': {
      // Confirm first — before any real work. The user can pre-confirm with
      // --yes (required when stdin isn't a TTY or in --porcelain mode).
      if (!flags.yes) {
        if (flags.porcelain || !process.stdin.isTTY) {
          throw new MxError(
            `archive requires confirmation — pass --yes when running non-interactively or with --porcelain`,
            'NEED_CONFIRMATION',
          );
        }
        process.stderr.write(`${warn()} About to archive work ${bold(name)}.\n`);
        process.stderr.write(
          `${dim(`  Worktrees will be removed; folder, work.json, branches, and sessions/ are preserved.`)}\n`,
        );
        process.stderr.write(
          `${dim(`  Make sure any pending session summary is written into works/${name}/sessions/ first.`)}\n`,
        );
        process.stderr.write('\n');
        if (!confirmYesNo('Proceed? (y/N) ')) {
          process.stderr.write(`${dim('Aborted.')}\n`);
          return;
        }
      }
      // pre-work-archive hook runs while worktrees are still intact; a non-zero
      // exit vetoes the archive. Skip it when the work is already archived so a
      // side-effecting hook never fires on a no-op — core throws ALREADY_ARCHIVED.
      const archiveHookEnv = { MX_WORK: name, MX_WORK_PATH: workPath(root, name).path };
      if (workInfo(root, name).isArchived !== true) {
        runPreHook(root, 'pre-work-archive', { cwd: archiveHookEnv.MX_WORK_PATH, env: archiveHookEnv }, flags.porcelain);
      }
      const res = archiveWork(root, name);
      runPostHook(root, 'post-work-archive', { cwd: archiveHookEnv.MX_WORK_PATH, env: archiveHookEnv }, flags.porcelain);
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} archived work ${bold(name)}`);
        console.log(`  ${dim(`at ${res.archived_at}`)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
      }, res);
      return;
    }
    case 'unarchive': {
      // Positionals after `unarchive` are `repo=branch` overrides for repos
      // whose recorded branch is gone. Without overrides, unarchive uses the
      // branches recorded in work.json.
      const overrides: Record<string, string> = {};
      for (const tok of positionals.slice(2)) {
        const eq = tok.indexOf('=');
        if (eq <= 0 || eq === tok.length - 1) {
          throw new MxError(
            `bad override: "${tok}" — expected <worktree>=<branch>`,
            'BAD_ARGS',
          );
        }
        overrides[tok.slice(0, eq)] = tok.slice(eq + 1);
      }
      // pre-work-unarchive hook runs before any worktree is re-created; a
      // non-zero exit vetoes it. Skip when the work isn't archived so a
      // side-effecting hook never fires on a no-op — core throws NOT_ARCHIVED.
      const unarchiveHookEnv = { MX_WORK: name, MX_WORK_PATH: workPath(root, name).path };
      if (workInfo(root, name).isArchived === true) {
        runPreHook(root, 'pre-work-unarchive', { cwd: unarchiveHookEnv.MX_WORK_PATH, env: unarchiveHookEnv }, flags.porcelain);
      }
      const res = unarchiveWork(root, name, overrides);
      runPostHook(root, 'post-work-unarchive', { cwd: unarchiveHookEnv.MX_WORK_PATH, env: unarchiveHookEnv }, flags.porcelain);
      emit(() => {
        console.log(`${check()} unarchived work ${bold(name)}`);
        for (const r of res.restored) {
          console.log(`  ${r.repo}  ${dim(`[${r.branch}]`)}  ${dim(`→ ${r.path}`)}`);
        }
      }, res);
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
        'usage: mx work -n <name> worktree add <repo> [<worktree-name>] [--branch <b>] [--base <ref>]',
      );
      const wtName = positionals[4] || repo; // optional name; defaults to repo
      const workFolder = workPath(root, name).path;
      const dest = worktreePath(root, name, wtName);
      const branch = flags.branch || name; // mirrors worktreeAdd's default
      const gitDir = repoGitDir(root, repo);
      // pre-worktree-create: a non-zero exit vetoes creation (nothing made yet).
      runPreHook(
        root,
        'pre-worktree-create',
        { cwd: workFolder, env: worktreeHookEnv(name, repo, wtName, branch, dest, workFolder, gitDir, flags.base) },
        flags.porcelain,
      );
      const res = worktreeAdd(root, name, repo, { name: positionals[4], branch: flags.branch, base: flags.base });
      emit(
        () => {
          const label = res.name === res.repo ? bold(res.repo) : `${bold(res.name)} ${dim(`(${res.repo})`)}`;
          console.log(`${check()} added worktree ${label} ${dim(`[${res.branch}]`)} ${dim(`→ ${res.path}`)}`);
        },
        res,
      );
      // post-worktree-create (the "hydrate" step): runs in the new worktree;
      // a non-zero exit is a warning, worktree kept.
      runPostHook(
        root,
        'post-worktree-create',
        { cwd: res.path, env: worktreeHookEnv(name, res.repo, res.name, res.branch, res.path, workFolder, gitDir, flags.base) },
        flags.porcelain,
      );
      return;
    }
    case 'ls': {
      const list = worktreeList(root, name);
      emit(() => {
        if (list.length === 0) {
          console.log(dim('no worktrees yet — `mx work -n <name> worktree add <repo>`'));
          return;
        }
        // Show the worktree name; annotate the repo when it differs.
        const label = (wt: (typeof list)[number]): string => {
          const n = wt.name ?? wt.repo;
          return n === wt.repo ? n : `${n} (${wt.repo})`;
        };
        const w = Math.max(...list.map((wt) => label(wt).length));
        for (const wt of list) {
          const branch = dim(`[${wt.branch}]`);
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${dim(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          console.log(`${dim(label(wt).padEnd(w))}  ${branch}${portsCol}`);
        }
      }, list);
      return;
    }
    case 'rm': {
      const wtName = need(positionals[3], 'usage: mx work -n <name> worktree rm <worktree-name>');
      const wt = worktreeList(root, name).find((w) => (w.name ?? w.repo) === wtName);
      const workFolder = workPath(root, name).path;
      const dest = worktreePath(root, name, wtName);
      const repo = wt?.repo ?? wtName;
      const gitDir = repoGitDir(root, repo);
      const branch = wt?.branch ?? '';
      // pre-worktree-remove: worktree still on disk; non-zero vetoes removal.
      runPreHook(
        root,
        'pre-worktree-remove',
        { cwd: existsSync(dest) ? dest : workFolder, env: worktreeHookEnv(name, repo, wtName, branch, dest, workFolder, gitDir) },
        flags.porcelain,
      );
      const res = worktreeRemove(root, name, wtName);
      emit(
        () => {
          const label = res.name === res.repo ? bold(res.repo) : `${bold(res.name)} ${dim(`(${res.repo})`)}`;
          console.log(`${check()} removed worktree ${label} ${dim(`from ${name} (branch ${res.branch} kept)`)}`);
        },
        res,
      );
      runPostHook(
        root,
        'post-worktree-remove',
        { cwd: workFolder, env: worktreeHookEnv(name, res.repo, res.name, res.branch, dest, workFolder, gitDir) },
        flags.porcelain,
      );
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
      const usage = 'usage: mx work -n <name> port set <worktree> <service> [<port>]';
      const wtName = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const portArg = positionals[5];
      let port: number | undefined;
      if (portArg != null) {
        port = Number(portArg);
        if (!Number.isInteger(port)) throw new MxError(`invalid port: ${portArg}`, 'BAD_ARGS');
      }
      const res = portSet(root, name, wtName, service, port);
      emit(
        () =>
          console.log(
            `${check()} ${res.name}${dim('.')}${res.service} ${dim('→')} ${dim(String(res.port))}`,
          ),
        res,
      );
      return;
    }
    case 'unset': {
      const usage = 'usage: mx work -n <name> port unset <worktree> <service>';
      const wtName = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const res = portUnset(root, name, wtName, service);
      emit(
        () =>
          console.log(
            `${check()} unset ${res.name}${dim('.')}${res.service} ${dim(`(was ${res.released})`)}`,
          ),
        res,
      );
      return;
    }
    case 'ls': {
      const map = portList(root, name);
      emit(() => {
        const entries: { wt: string; service: string; port: number }[] = [];
        for (const [wt, ports] of Object.entries(map)) {
          for (const [service, port] of Object.entries(ports)) {
            entries.push({ wt, service, port });
          }
        }
        if (entries.length === 0) {
          console.log(dim('no ports allocated yet — `mx work -n <name> port set <worktree> <service>`'));
          return;
        }
        const lhsW = Math.max(...entries.map((e) => `${e.wt}.${e.service}`.length));
        for (const e of entries) {
          const lhs = `${e.wt}${dim('.')}${e.service}`;
          // padEnd works on visible length only since dim() adds invisible ANSI; pad
          // the plain "worktree.service" then re-render.
          const plain = `${e.wt}.${e.service}`;
          const pad = ' '.repeat(lhsW - plain.length);
          console.log(`${lhs}${pad}  ${dim('→')}  ${dim(String(e.port))}`);
        }
      }, map);
      return;
    }
    default:
      throw new MxError(`unknown port command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}
