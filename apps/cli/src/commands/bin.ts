import { readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { delimiter } from 'node:path';
import { requireRuntime, runtimeBinDir, listRuntimeBins, MxError } from '@mx/core';
import { emit, dim, bold, check, warn, tildify } from '../output';
import { templatesDir } from '../paths';
import type { Flags } from '../args';

/**
 * Names of the bins mx ships (read from the CLI's bundled `templates/bin/`), so
 * `mx bin ls` can mark which entries are mx-provided vs user-added.
 *
 * @returns A set of shipped bin file names (empty if the templates dir is absent).
 */
function shippedBinNames(): Set<string> {
  try {
    const dir = path.join(templatesDir(), 'bin');
    return new Set(readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isFile()));
  } catch {
    return new Set();
  }
}

/**
 * Whether a directory is currently on the caller's `PATH`.
 *
 * @param dir - Absolute directory path.
 * @returns True if `dir` appears in `$PATH`.
 */
function onPath(dir: string): boolean {
  const entries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return entries.includes(dir);
}

/**
 * Dispatch `mx bin` (alias `mx bins`): manage the runtime-wide `bin/` directory
 * of utility executables.
 *
 * @param positionals - Positional args (positionals[1] is the action).
 * @param flags - Parsed flags.
 */
export function dispatchBin(positionals: string[], flags: Flags): void {
  const root = requireRuntime({ runtime: flags.runtime });
  const action = positionals[1] ?? 'ls'; // bare `mx bin` lists
  const dir = runtimeBinDir(root);

  switch (action) {
    case 'ls': {
      const bins = listRuntimeBins(root);
      const shipped = shippedBinNames();
      emit(
        () => {
          if (bins.length === 0) {
            console.log(dim(`no bins yet — drop executables in ${tildify(dir)}`));
          } else {
            const nameW = Math.max(...bins.map((b) => b.name.length));
            for (const b of bins) {
              // Tag every bin so it's clear which mx ships vs which you added.
              const origin = shipped.has(b.name) ? dim('built-in') : dim('user');
              const flag = b.executable ? '' : `  ${warn()} ${dim('not executable (chmod +x)')}`;
              console.log(`  ${bold(b.name.padEnd(nameW))}  ${origin}${flag}`);
            }
          }
          // Always close with PATH guidance — confirm when it's wired up, or
          // spell out exactly how to wire it (mx can't edit your shell config).
          console.log();
          if (onPath(dir)) {
            console.log(`  ${check()} ${dim(`${tildify(dir)} is on your PATH — these run as commands anywhere`)}`);
          } else {
            console.log(`  ${warn()} ${dim(`${tildify(dir)} is not on your PATH yet.`)}`);
            console.log(`  ${dim('To run these as commands, add this line to your shell startup file')}`);
            console.log(`  ${dim('(~/.zshrc, ~/.bashrc, …) and restart your shell:')}`);
            console.log();
            console.log(`      ${bold('export PATH="$(mx bin path):$PATH"')}`);
          }
        },
        // Porcelain: the raw list plus the dir and whether it's on PATH.
        { dir, onPath: onPath(dir), bins: bins.map((b) => ({ ...b, shipped: shipped.has(b.name) })) },
      );
      return;
    }
    case 'path': {
      // Raw path for shell substitution (export PATH="$(mx bin path):$PATH").
      emit(() => console.log(dir), { path: dir });
      return;
    }
    default:
      throw new MxError(`unknown bin command: ${action}`, 'BAD_ARGS');
  }
}
