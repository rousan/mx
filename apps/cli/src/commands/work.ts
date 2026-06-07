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
  archiveWork,
  unarchiveWork,
  portSet,
  portUnset,
  portList,
  MxError,
} from '@mx/core';
import { emit, dim, bold, cyan, check, warn, yellow } from '../output';
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
      console.log(`${check()} created work ${bold(res.name)}`);
      console.log(`  ${dim(res.path)}`);
    }, res);
    return;
  }

  if (action === 'ls') {
    const root = requireRuntime({ runtime: flags.runtime });
    // Default: every work, with the archived ones marked. --archived narrows
    // the listing to archived works only (handy when you want to see what's
    // recoverable without scrolling past the active set).
    const works = listWorksInfo(root, {
      includeArchived: true,
      onlyArchived: flags.archived,
    });
    emit(() => {
      // Human mode: active works first, then archived. Within each group,
      // preserve the natural alphabetical order. Porcelain consumers see the
      // raw order (above) unchanged.
      const ordered = [
        ...works.filter((w) => !w.isArchived),
        ...works.filter((w) => w.isArchived),
      ];
      if (ordered.length === 0) {
        console.log(dim('no works yet — `mx work new <name>`'));
        return;
      }
      for (const w of ordered) {
        const chip = w.isArchived
          ? `  ${dim(`[archived ${(w.archived_at ?? '').slice(0, 10)}]`)}`
          : '';
        const desc = w.description ? `  ${dim(`— ${w.description}`)}` : '';
        const wts = `  ${dim(`(${w.worktrees} worktree${w.worktrees === 1 ? '' : 's'})`)}`;
        console.log(`${bold(w.name)}${chip}${wts}${desc}`);
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
        console.log(`${bold(work.name)}${archivedChip}`);
        if (work.description) console.log(`  ${dim('description')}  ${dim(work.description)}`);
        const wts = work.worktrees ?? [];
        console.log(`  ${dim('worktrees  ')}  ${dim(`${wts.length}`)}`);
        for (const wt of wts) {
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${cyan(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          console.log(`      ${wt.repo}  ${cyan(`[${wt.branch}]`)}${portsCol}`);
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
          `${warn()} ${yellow(`permanently removing work "${name}" — folder and any session summaries will be deleted (branches kept). This cannot be undone.`)}\n`,
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
      if (!flags.porcelain) {
        process.stderr.write(
          `${warn()} ${dim(`Reminder: write any pending session summary into works/${name}/sessions/ before archiving.`)}\n`,
        );
      }
      const res = archiveWork(root, name);
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
            `bad override: "${tok}" — expected <repo>=<branch>`,
            'BAD_ARGS',
          );
        }
        overrides[tok.slice(0, eq)] = tok.slice(eq + 1);
      }
      const res = unarchiveWork(root, name, overrides);
      emit(() => {
        console.log(`${check()} unarchived work ${bold(name)}`);
        for (const r of res.restored) {
          console.log(`  ${r.repo}  ${cyan(`[${r.branch}]`)}  ${dim(`→ ${r.path}`)}`);
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
        'usage: mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>]',
      );
      const res = worktreeAdd(root, name, repo, { branch: flags.branch, base: flags.base });
      emit(
        () =>
          console.log(
            `${check()} added worktree ${bold(res.repo)} ${cyan(`[${res.branch}]`)} ${dim(`→ ${res.path}`)}`,
          ),
        res,
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
        const repoW = Math.max(...list.map((wt) => wt.repo.length));
        for (const wt of list) {
          const repo = wt.repo.padEnd(repoW);
          const branch = cyan(`[${wt.branch}]`);
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${cyan(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          console.log(`${repo}  ${branch}${portsCol}`);
        }
      }, list);
      return;
    }
    case 'rm': {
      const repo = need(positionals[3], 'usage: mx work -n <name> worktree rm <repo>');
      const res = worktreeRemove(root, name, repo);
      emit(
        () =>
          console.log(
            `${check()} removed worktree ${bold(res.repo)} ${dim(`from ${name} (branch ${res.branch} kept)`)}`,
          ),
        res,
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
      emit(
        () =>
          console.log(
            `${check()} ${res.repo}${dim('.')}${res.service} ${dim('→')} ${cyan(String(res.port))}`,
          ),
        res,
      );
      return;
    }
    case 'unset': {
      const usage = 'usage: mx work -n <name> port unset <repo> <service>';
      const repo = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const res = portUnset(root, name, repo, service);
      emit(
        () =>
          console.log(
            `${check()} unset ${res.repo}${dim('.')}${res.service} ${dim(`(was ${res.released})`)}`,
          ),
        res,
      );
      return;
    }
    case 'ls': {
      const map = portList(root, name);
      emit(() => {
        const entries: { repo: string; service: string; port: number }[] = [];
        for (const [repo, ports] of Object.entries(map)) {
          for (const [service, port] of Object.entries(ports)) {
            entries.push({ repo, service, port });
          }
        }
        if (entries.length === 0) {
          console.log(dim('no ports allocated yet — `mx work -n <name> port set <repo> <service>`'));
          return;
        }
        const lhsW = Math.max(...entries.map((e) => `${e.repo}.${e.service}`.length));
        for (const e of entries) {
          const lhs = `${e.repo}${dim('.')}${e.service}`;
          // padEnd works on visible length only since dim() adds invisible ANSI; pad
          // the plain "repo.service" then re-render.
          const plain = `${e.repo}.${e.service}`;
          const pad = ' '.repeat(lhsW - plain.length);
          console.log(`${lhs}${pad}  ${dim('→')}  ${cyan(String(e.port))}`);
        }
      }, map);
      return;
    }
    default:
      throw new MxError(`unknown port command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}
