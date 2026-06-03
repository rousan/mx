import * as os from 'node:os';
import * as path from 'node:path';
import {
  initRuntime,
  updateRuntime,
  requireRuntime,
  statusRuntime,
  runtimePointerPath,
  MxError,
} from '@mx/core';
import { emit } from '../output';
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
      // Default to ~/mx; an explicit path arg or --runtime overrides.
      const target = positionals[1] || flags.runtime || path.join(os.homedir(), 'mx');
      const res = initRuntime(target);
      emit(() => {
        console.log(`Runtime ready at ${res.runtime}  (pointer: ${runtimePointerPath()})`);
        for (const c of res.created) console.log(`  + ${c}`);
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
      const res = updateRuntime(root);
      emit(() => console.log(`Re-stamped CLAUDE.md into ${res.runtime}`), res);
      return;
    }
    default:
      throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
  }
}
