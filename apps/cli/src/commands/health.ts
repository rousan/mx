import { requireRuntime, listRepoHealth, listWorkHealth } from '@mx/core';
import { emit, dim, bold } from '../output';
import { renderHealthDetail } from './repo';
import { renderWorkHealthDetail } from './work';
import type { Flags } from '../args';

/**
 * Handle `mx health [--all]` — the whole-runtime health overview. Renders every
 * repo's health block (identical to `mx repo health`) followed by every active
 * work's health block (identical to `mx work health`); `--all` also includes
 * archived works. Porcelain returns `{ repos, works }` with the full snapshots.
 *
 * @param _positionals - Positional args (unused; the command takes no subcommand).
 * @param flags - Parsed flags (`--all` widens works to include archived).
 */
export function dispatchHealth(_positionals: string[], flags: Flags): void {
  const root = requireRuntime({ runtime: flags.runtime });
  const repos = listRepoHealth(root);
  const works = listWorkHealth(root, { includeArchived: flags.all });
  emit(
    () => {
      const indent = '  ';
      console.log(bold('Repos'));
      console.log();
      if (repos.length === 0) {
        console.log(`${indent}${dim('no repos yet — `mx repo add <git-url>`')}`);
      } else {
        repos.forEach((h, i) => {
          if (i > 0) console.log();
          renderHealthDetail(h, indent);
        });
      }
      console.log();
      console.log(bold('Works'));
      console.log();
      if (works.length === 0) {
        console.log(`${indent}${dim('no works yet — `mx work new <name>`')}`);
      } else {
        works.forEach((h, i) => {
          if (i > 0) console.log();
          renderWorkHealthDetail(h, indent);
        });
      }
    },
    { repos, works },
  );
}
