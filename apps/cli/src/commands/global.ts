import * as path from 'node:path';
import {
  initRuntime,
  updateRuntime,
  requireRuntime,
  discoverRuntime,
  defaultRuntime,
  statusRuntime,
  MxError,
} from '@mx/core';
import type { StatusResult } from '@mx/core';
import { emit, dim, bold, cyan } from '../output';
import { templatesDir } from '../paths';
import type { Flags } from '../args';

/**
 * Build the `MX_RUNTIME` setup hint shown after `mx init` succeeds.
 *
 * Three cases:
 * - `$MX_RUNTIME` is already set to the freshly-initialized path → confirm it.
 * - The runtime is at the default `~/mx` and the env is unset → no setup needed.
 * - Otherwise → tell the user to export `MX_RUNTIME` so future `mx` commands
 *   don't silently fall back to `~/mx`.
 *
 * @param runtime - Absolute path to the runtime that was just initialized.
 * @returns Lines to print after the created-paths block.
 */
function runtimeEnvHint(runtime: string): string[] {
  const envRuntime = process.env.MX_RUNTIME ? path.resolve(process.env.MX_RUNTIME) : null;
  if (envRuntime === runtime) {
    return ['', `$MX_RUNTIME already points here — you're set.`];
  }
  if (runtime === defaultRuntime() && !envRuntime) {
    return ['', `This is the default mx runtime (~/mx) — no MX_RUNTIME setup needed.`];
  }
  return [
    '',
    `Point mx at this runtime by adding to your shell config (~/.zshrc, ~/.bashrc):`,
    '',
    `  export MX_RUNTIME="${runtime}"`,
    '',
    `Without it, future \`mx\` commands fall back to the default ~/mx.`,
  ];
}

/**
 * Handle the global commands: `init`, `status`, and `update`.
 *
 * @param positionals - Positional args (positionals[0] is the command).
 * @param flags - Parsed flags.
 */
export function runGlobal(positionals: string[], flags: Flags): void {
  switch (positionals[0]) {
    case 'init': {
      // Target: explicit path arg, else the resolved runtime (--runtime / $MX_RUNTIME / ~/mx).
      const target = positionals[1] || discoverRuntime({ runtime: flags.runtime });
      const res = initRuntime(target, templatesDir());
      emit(() => {
        console.log(`Runtime ready at ${res.runtime}`);
        for (const c of res.created) console.log(`  + ${c}`);
        for (const line of runtimeEnvHint(res.runtime)) console.log(line);
      }, res);
      return;
    }
    case 'status': {
      const root = requireRuntime({ runtime: flags.runtime });
      const data = statusRuntime(root);
      emit(() => renderStatus(data), data);
      return;
    }
    case 'update': {
      const root = requireRuntime({ runtime: flags.runtime });
      const res = updateRuntime(root, templatesDir());
      emit(() => {
        console.log(`Updated runtime at ${res.runtime}`);
        for (const p of res.updated) console.log(`  + ${p}`);
      }, res);
      return;
    }
    default:
      throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
  }
}

/**
 * Render `mx status` in a calm, sectioned, aligned layout.
 *
 * Two sections — repos and works — each with computed column widths so
 * names line up vertically. Bold is used sparingly (`mx` header, section
 * titles); dim for low-priority metadata (paths, branches, counts, dates);
 * cyan as an accent for port numbers. Archived works are tagged with a
 * dim `archived YYYY-MM-DD` chip on their name line; their worktrees are
 * still listed (the manifest retains them across archive cycles) so a
 * reader can see what `unarchive` would restore.
 *
 * @param data - The runtime status snapshot.
 */
function renderStatus(data: StatusResult): void {
  console.log();
  console.log(`  ${bold('mx')} ${dim('·')} ${data.runtime}`);
  console.log();

  // --- repos ---------------------------------------------------------------
  console.log(`  ${bold('repos')}  ${dim(`(${data.repos.length})`)}`);
  if (data.repos.length === 0) {
    console.log(`    ${dim('none yet — `mx repo add <git-url>`')}`);
  } else {
    const nameW = Math.max(...data.repos.map((r) => r.name.length));
    const branchW = Math.max(...data.repos.map((r) => r.branch.length));
    for (const r of data.repos) {
      const name = r.name.padEnd(nameW);
      const branch = dim(r.branch.padEnd(branchW));
      const remote = dim(r.remote ?? '(no remote)');
      console.log(`    ${name}  ${branch}  ${remote}`);
    }
  }
  console.log();

  // --- works ---------------------------------------------------------------
  const active = data.works.filter((w) => w.isArchived !== true);
  const archived = data.works.filter((w) => w.isArchived === true);
  const worksCount =
    archived.length > 0
      ? dim(`(${active.length} active, ${archived.length} archived)`)
      : dim(`(${data.works.length})`);
  console.log(`  ${bold('works')}  ${worksCount}`);

  if (data.works.length === 0) {
    console.log(`    ${dim('none yet — `mx work new <name>`')}`);
    console.log();
    return;
  }

  // Pad work names to align the right-side count/chip column.
  const workNameW = Math.max(...data.works.map((w) => w.name.length));
  // Pad the worktree-repo column so branches line up across all works.
  const wtRepoW = Math.max(
    0,
    ...data.works.flatMap((w) => (w.worktrees ?? []).map((wt) => wt.repo.length)),
  );

  for (let i = 0; i < data.works.length; i++) {
    if (i > 0) console.log(); // breathing room between works
    const w = data.works[i];
    const wts = w.worktrees ?? [];
    const name = w.name.padEnd(workNameW);
    const chip =
      w.isArchived === true
        ? `  ${dim(`archived ${(w.archived_at ?? '').slice(0, 10)}`)}`
        : '';
    const count =
      wts.length === 0
        ? `  ${dim('no worktrees')}`
        : `  ${dim(`${wts.length} worktree${wts.length === 1 ? '' : 's'}`)}`;
    console.log(`    ${name}${chip}${count}`);

    for (const t of wts) {
      const repo = t.repo.padEnd(wtRepoW);
      const branch = dim(`[${t.branch}]`);
      const ports = Object.entries(t.ports ?? {})
        .map(([s, p]) => `${dim(`${s}:`)}${cyan(String(p))}`)
        .join('  ');
      const portsCol = ports ? `  ${ports}` : '';
      // 4-space step from the work-name column makes hierarchy unambiguous.
      console.log(`        ${repo}  ${branch}${portsCol}`);
    }
  }
  console.log();
}
