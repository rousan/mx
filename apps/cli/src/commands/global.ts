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
import { emit } from '../output';
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
      emit(() => {
        console.log(`runtime: ${data.runtime}\n`);
        console.log(`repos (${data.repos.length}):`);
        for (const r of data.repos) {
          console.log(`  ${r.name}  [${r.branch}]  ${r.remote ?? '(no remote)'}`);
        }
        console.log(`\nworks (${data.works.length}):`);
        for (const w of data.works) {
          console.log(`  ${w.name}${w.description ? `  — ${w.description}` : ''}`);
          for (const wt of w.worktrees) {
            const ports = Object.entries(wt.ports)
              .map(([s, p]) => `${s}:${p}`)
              .join(', ');
            console.log(`    ${wt.repo}  [${wt.branch}]${ports ? `  (${ports})` : ''}`);
          }
        }
      }, data);
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
