import * as path from 'node:path';
import {
  initRuntime,
  syncRuntime,
  migrateRuntime,
  requireRuntime,
  discoverRuntime,
  defaultRuntime,
  statusRuntime,
  MxError,
} from '@mx/core';
import type { StatusResult } from '@mx/core';
import { emit, dim, bold, check, warn, tildify } from '../output';
import { templatesDir } from '../paths';
import { selfUpdate } from '../selfupdate';
import type { SelfUpdateInfo } from '../selfupdate';
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
    return ['', `${dim('$MX_RUNTIME already points here — you\'re set.')}`];
  }
  if (runtime === defaultRuntime() && !envRuntime) {
    return ['', `${dim('This is the default mx runtime (~/mx) — no MX_RUNTIME setup needed.')}`];
  }
  return [
    '',
    `Point mx at this runtime by adding to your shell config ${dim('(~/.zshrc, ~/.bashrc)')}:`,
    '',
    `  ${bold(`export MX_RUNTIME="${runtime}"`)}`,
    '',
    dim('Without it, future `mx` commands fall back to the default ~/mx.'),
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
        console.log(`${check()} Runtime ready at ${bold(res.runtime)}`);
        for (const c of res.created) console.log(`  ${dim(`+ ${c}`)}`);
        for (const line of runtimeEnvHint(res.runtime)) console.log(line);
      }, res);
      return;
    }
    case 'info': {
      const root = requireRuntime({ runtime: flags.runtime });
      // Default: active works only. --all expands the works section.
      const data = statusRuntime(root, { includeArchived: flags.all });
      emit(() => renderStatus(data), data);
      return;
    }
    case 'sync': {
      const root = requireRuntime({ runtime: flags.runtime });
      const res = syncRuntime(root, templatesDir());
      emit(() => {
        console.log(`${check()} Synced runtime at ${bold(res.runtime)}`);
        for (const p of res.updated) console.log(`  ${dim(`+ ${p}`)}`);
      }, res);
      return;
    }
    case 'migrate': {
      // The one runtime command allowed to run on a version-mismatched runtime —
      // its whole job is upgrading an older one up to this CLI's version.
      const root = requireRuntime({ runtime: flags.runtime, allowVersionMismatch: true });
      const res = migrateRuntime(root);
      emit(() => {
        if (res.applied.length === 0) {
          console.log(`${check()} Runtime already at v${res.to} — nothing to migrate.`);
          return;
        }
        const steps = res.applied.map((a) => `v${a.from}→v${a.to}`).join(', ');
        console.log(
          `${check()} Migrated runtime ${bold(`v${res.from}→v${res.to}`)} ${dim(`(${steps})`)}`,
        );
        for (const p of res.changed) console.log(`  ${dim(`~ ${p}`)}`);
      }, res);
      return;
    }
    case 'update': {
      // Self-update the CLI within its current major; report a newer major if one
      // exists (crossing a major is a deliberate user action + `mx migrate`).
      const info = selfUpdate(flags.porcelain);
      emit(() => renderSelfUpdate(info), info);
      return;
    }
    default:
      throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
  }
}

/**
 * Render the outcome of `mx update` (CLI self-update): what happened within the
 * current major, plus a suggestion when a newer major exists.
 *
 * @param info - The self-update summary.
 */
function renderSelfUpdate(info: SelfUpdateInfo): void {
  const curMajor = Number.parseInt(info.current.split('.')[0], 10) || 0;
  const manual = `npm i -g ${info.package}@^${curMajor}`;
  if (!info.npmAvailable) {
    console.log(`${warn()} npm not found — update manually: ${bold(manual)}`);
  } else if (info.installFailed) {
    console.log(`${warn()} self-update failed — try: ${bold(manual)}`);
  } else if (info.updated) {
    console.log(
      `${check()} Updated mx to ${bold(`v${info.latestInMajor}`)} ${dim(`(was v${info.current})`)}`,
    );
  } else {
    console.log(`${check()} mx is up to date ${dim(`(v${info.current}, latest in v${curMajor}.x)`)}`);
  }
  if (info.newMajor) {
    console.log();
    console.log(`${warn()} A new major release ${bold(`mx v${info.newMajor}`)} is available.`);
    console.log(
      `  ${dim(`Upgrade (optional): npm i -g ${info.package}@${info.newMajor}, then `)}${bold('mx migrate')}`,
    );
  }
}

/**
 * Render `mx status` in a calm, monochrome, sectioned layout.
 *
 * Three sections — context, repos, works — each with computed column widths
 * so names line up vertically. Only typography weight (bold + dim) carries
 * visual hierarchy; no color. Bold marks the `mx` header, section titles,
 * and work names. Everything else (paths, branches, archived chips, ports,
 * port labels, port values) sits at the dim tier. Archived works are tagged
 * with a dim `[archived YYYY-MM-DD]` chip after the work name; their
 * worktrees are still listed so a reader can see what `unarchive` would
 * restore. Per-work counts (worktree count, session count) are intentionally
 * omitted — the indented worktree rows themselves are the indicator.
 *
 * @param data - The runtime status snapshot.
 */
function renderStatus(data: StatusResult): void {
  console.log();
  console.log(`  ${bold('mx')} ${dim(`v${data.version}`)} ${dim('·')} ${data.runtime}`);
  console.log();

  // --- context registry ----------------------------------------------------
  console.log(`  ${bold('context')}  ${dim(`(${data.context.entries})`)}`);
  console.log();

  // --- repos ---------------------------------------------------------------
  // Same clean shape as the works section / `mx repo ls`: bold name, dim path,
  // dim branch+remote, a blank line between entries.
  console.log(`  ${bold('repos')}`);
  if (data.repos.length === 0) {
    console.log(`    ${dim('none yet — `mx repo add <git-url>`')}`);
  } else {
    for (let i = 0; i < data.repos.length; i++) {
      if (i > 0) console.log();
      const r = data.repos[i];
      console.log(`    • ${bold(r.name)}`);
      console.log(`        ${dim(tildify(r.path))}`);
      console.log(`        ${dim(`${r.branch}  ${r.remote ?? '(no remote)'}`)}`);
    }
  }
  console.log();

  // --- works ---------------------------------------------------------------
  // `data.works` reflects the caller's filter; `archivedWorksCount` is the
  // true count of archived works on disk, so the header can still tell the
  // user how many exist even when they're not being rendered.
  const visibleArchived = data.works.filter((w) => w.isArchived === true);
  const visibleActive = data.works.filter((w) => w.isArchived !== true);
  const hiddenArchived = data.archivedWorksCount - visibleArchived.length;
  console.log(`  ${bold('works')}`);

  if (data.works.length === 0) {
    const empty =
      hiddenArchived > 0
        ? `${hiddenArchived} archived hidden — pass --all to show`
        : 'none yet — `mx work new <name>`';
    console.log(`    ${dim(empty)}`);
    console.log();
    return;
  }

  // Render active works first, then archived. Within each group, preserve the
  // natural alphabetical order. This lets the eye scan top-to-bottom through
  // actives and stop when the first archived chip appears.
  const ordered = [...visibleActive, ...visibleArchived];

  // Column widths — computed from plain (un-styled) text so ANSI codes
  // applied later don't throw off padding.
  const wtRepoW = Math.max(
    0,
    ...ordered.flatMap((w) => (w.worktrees ?? []).map((wt) => wt.repo.length)),
  );

  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) console.log(); // breathing room between works
    const w = ordered[i];
    const wts = w.worktrees ?? [];

    const chip =
      w.isArchived === true
        ? `  ${dim(`[archived ${(w.archived_at ?? '').slice(0, 10)}]`)}`
        : '';
    // Active work names anchor with bold; archived ones recede with dim so
    // the eye lands on active works first. The bullet is the list marker.
    const styledName = w.isArchived === true ? dim(w.name) : bold(w.name);
    console.log(`    • ${styledName}${chip}`);
    console.log(`        ${dim(tildify(w.path))}`);

    if (wts.length === 0) {
      console.log(`        ${dim('(no worktrees)')}`);
      continue;
    }

    for (const t of wts) {
      // All worktree row content sits at the dim tier; the bold work name
      // above is the only "loud" element in the section.
      const repo = dim(t.repo.padEnd(wtRepoW));
      const branch = dim(`[${t.branch}]`);
      const ports = Object.entries(t.ports ?? {})
        .map(([s, p]) => dim(`${s}:${p}`))
        .join('  ');
      const portsCol = ports ? `  ${ports}` : '';
      // 4-space step from the work-name column makes hierarchy unambiguous.
      console.log(`        ${repo}  ${branch}${portsCol}`);
    }
  }
  console.log();
}
