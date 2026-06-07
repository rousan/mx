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
 * Plural-agreeing label like "1 entry" / "12 entries".
 *
 * @param n - The count.
 * @param singular - Singular noun (used when `n === 1`).
 * @param plural_ - Plural noun.
 * @returns The number followed by the correctly-pluralized noun.
 */
function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Render `mx status` in a calm, sectioned, aligned layout.
 *
 * Three sections — context, repos, works — each with computed column widths
 * so names line up vertically. Bold for `mx` header and section titles; dim
 * for low-priority metadata (paths, branches, counts, dates); cyan for port
 * numbers. Archived works are tagged with a dim `archived YYYY-MM-DD` chip;
 * their worktrees are still listed so a reader can see what `unarchive`
 * would restore. Each work line also shows its session-summary count.
 *
 * @param data - The runtime status snapshot.
 */
function renderStatus(data: StatusResult): void {
  console.log();
  console.log(`  ${bold('mx')} ${dim('·')} ${data.runtime}`);
  console.log();

  // --- context registry ----------------------------------------------------
  const ctx = data.context.entries;
  const ctxLabel = ctx === 0 ? dim('(none yet)') : dim(`(${plural(ctx, 'entry', 'entries')})`);
  console.log(`  ${bold('context')}  ${ctxLabel}`);
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

  // Render active works first, then archived. Within each group, preserve the
  // natural alphabetical order. This lets the eye scan top-to-bottom through
  // actives and stop when the first archived chip appears.
  const ordered = [...active, ...archived];

  // Column widths — computed from plain (un-styled) text so ANSI codes
  // applied later don't throw off padding.
  const workNameW = Math.max(...ordered.map((w) => w.name.length));
  const wtRepoW = Math.max(
    0,
    ...ordered.flatMap((w) => (w.worktrees ?? []).map((wt) => wt.repo.length)),
  );
  const hasArchived = archived.length > 0;
  const chipPlainW = hasArchived ? 'archived YYYY-MM-DD'.length : 0;
  const wtCountW = Math.max(
    ...ordered.map((w) =>
      (w.worktrees ?? []).length === 0
        ? 'no worktrees'.length
        : plural((w.worktrees ?? []).length, 'worktree', 'worktrees').length,
    ),
  );

  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) console.log(); // breathing room between works
    const w = ordered[i];
    const wts = w.worktrees ?? [];
    const sessions = w.sessions ?? 0;

    const namePart = w.name.padEnd(workNameW);
    const chipPlain =
      w.isArchived === true ? `archived ${(w.archived_at ?? '').slice(0, 10)}` : '';
    const chipPart = hasArchived ? `  ${dim(chipPlain.padEnd(chipPlainW))}` : '';
    const wtCountPlain =
      wts.length === 0 ? 'no worktrees' : plural(wts.length, 'worktree', 'worktrees');
    const wtCountPart = `  ${dim(wtCountPlain.padEnd(wtCountW))}`;
    const sessionsPart = `  ${dim(plural(sessions, 'session', 'sessions'))}`;
    console.log(`    ${namePart}${chipPart}${wtCountPart}${sessionsPart}`);

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
