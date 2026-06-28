import {
  requireRuntime,
  inferContext,
  workNew,
  listWorksInfo,
  workInfo,
  workDescribe,
  workPath,
  workspaceFile,
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
import * as path from 'node:path';
import { emit, dim, bold, check, warn, confirmYesNo, tildify } from '../output';
import { openWorkLayout } from '../open';
import { runWorktreeHydrate } from '../hydrate';
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
        openWorkLayout(res.path, workspaceFile(root, res.name));
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
          const repoW = Math.max(...wts.map((t) => t.repo.length));
          for (const t of wts) {
            // All worktree row content sits at the dim tier so the bold work
            // name above is the only "loud" element in the block.
            const repo = dim(t.repo.padEnd(repoW));
            const branch = dim(`[${t.branch}]`);
            const ports = Object.entries(t.ports ?? {})
              .map(([s, p]) => `${dim(`${s}:${p}`)}`)
              .join('  ');
            const portsCol = ports ? `  ${ports}` : '';
            console.log(`  ${repo}  ${branch}${portsCol}`);
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
          console.log(`      ${dim(wt.repo)}  ${dim(`[${wt.branch}]`)}${portsCol}`);
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
        openWorkLayout(res.path, workspaceFile(root, name));
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(`${warn()} ${dim(`could not open layout: ${msg}`)}\n`);
        return;
      }
      emit(
        () => console.log(`${check()} opened ${bold(name)} ${dim('(Terminal + editor)')}`),
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
        'usage: mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>] [--no-hydrate]',
      );
      const res = worktreeAdd(root, name, repo, { branch: flags.branch, base: flags.base });
      emit(
        () =>
          console.log(
            `${check()} added worktree ${bold(res.repo)} ${dim(`[${res.branch}]`)} ${dim(`→ ${res.path}`)}`,
          ),
        res,
      );
      // Run the repo's hydrate hook for the new worktree (unless opted out). The
      // worktree already exists, so a failure is a warning, not a hard error.
      if (!flags.noHydrate) {
        const outcome = runWorktreeHydrate(
          { root, work: name, repo: res.repo, worktreePath: res.path, branch: res.branch, base: flags.base },
          flags.porcelain,
        );
        if (outcome.ran && !outcome.ok && !flags.porcelain) {
          process.stderr.write(
            `${warn()} ${dim(`hydrate.sh for ${res.repo} exited non-zero — worktree kept. Re-run: mx work -n ${name} worktree hydrate ${res.repo}`)}\n`,
          );
        }
      }
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
          const repo = dim(wt.repo.padEnd(repoW));
          const branch = dim(`[${wt.branch}]`);
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${dim(String(p))}`)
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
    case 'hydrate': {
      // Re-run a repo's hydrate.sh against its existing worktree on demand.
      const repo = need(positionals[3], 'usage: mx work -n <name> worktree hydrate <repo>');
      const wt = worktreeList(root, name).find((w) => w.repo === repo);
      if (!wt) throw new MxError(`work "${name}" has no worktree for ${repo}`, 'NO_WORKTREE');
      const worktreePath = path.join(workPath(root, name).path, 'wt', repo);
      const outcome = runWorktreeHydrate(
        { root, work: name, repo, worktreePath, branch: wt.branch },
        flags.porcelain,
      );
      if (outcome.missing) {
        emit(
          () => console.log(dim(`no hydrate.sh for ${repo} — nothing to run`)),
          { work: name, repo, ran: false },
        );
        return;
      }
      if (!outcome.ok) throw new MxError(`hydrate.sh for ${repo} exited non-zero`, 'HYDRATE_FAILED');
      emit(() => console.log(`${check()} hydrated ${bold(repo)}`), {
        work: name,
        repo,
        ran: true,
        ok: true,
      });
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
            `${check()} ${res.repo}${dim('.')}${res.service} ${dim('→')} ${dim(String(res.port))}`,
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
          console.log(`${lhs}${pad}  ${dim('→')}  ${dim(String(e.port))}`);
        }
      }, map);
      return;
    }
    default:
      throw new MxError(`unknown port command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}
