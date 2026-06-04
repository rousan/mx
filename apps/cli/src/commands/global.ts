import {
  initRuntime,
  updateRuntime,
  requireRuntime,
  discoverRuntime,
  statusRuntime,
  MxError,
} from '@mx/core';
import { emit } from '../output';
import { templatesDir } from '../paths';
import type { Flags } from '../args';

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
        console.log(`  (export MX_RUNTIME=${res.runtime} to address it without --runtime)`);
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
      emit(() => console.log(`Re-stamped CLAUDE.md into ${res.runtime}`), res);
      return;
    }
    default:
      throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
  }
}
