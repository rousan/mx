import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MxError } from '@mx/core';
import { parseArgs } from './args';
import { setPorcelain, emit, fail } from './output';
import { HELP } from './help';
import { runGlobal } from './commands/global';
import { dispatchRepo } from './commands/repo';
import { dispatchWork } from './commands/work';

/**
 * CLI version, surfaced by `mx version` / `mx --version`. Read from the
 * installed package's `package.json` at startup so it stays in sync with
 * whatever was published, no rebuild needed when bumping the version.
 *
 * The bundle lives at `<pkg>/bin/mx.js`; `package.json` is one level up.
 */
const VERSION: string = (() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
})();

/**
 * Parse argv, dispatch to the matching command, and translate thrown
 * `MxError`s (and other errors) into structured output + a non-zero exit.
 */
export function main(): void {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  setPorcelain(flags.porcelain);

  // Shortcut alias — `mx i` maps to `mx info` (the runtime overview, hit often).
  if (positionals[0] === 'i') positionals[0] = 'info';

  try {
    if (flags.version || positionals[0] === 'version') {
      emit(() => console.log(`mx ${VERSION}`), { version: VERSION });
      return;
    }
    if (flags.help || positionals.length === 0 || positionals[0] === 'help') {
      process.stdout.write(HELP);
      return;
    }

    switch (positionals[0]) {
      case 'init':
      case 'info':
      case 'sync':
      case 'update':
      case 'migrate':
        return runGlobal(positionals, flags);
      case 'repo':
        return dispatchRepo(positionals, flags);
      case 'work':
        return dispatchWork(positionals, flags);
      default:
        throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
    }
  } catch (e) {
    fail(e);
  }
}
