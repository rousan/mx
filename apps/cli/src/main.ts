import { MxError } from '@mx/core';
import { parseArgs } from './args';
import { setPorcelain, emit, fail } from './output';
import { HELP } from './help';
import { runGlobal } from './commands/global';
import { dispatchRepo } from './commands/repo';
import { dispatchWork } from './commands/work';

/**
 * CLI version, surfaced by `mx version` / `mx --version`.
 */
const VERSION = '0.1.0';

/**
 * Parse argv, dispatch to the matching command, and translate thrown
 * `MxError`s (and other errors) into structured output + a non-zero exit.
 */
export function main(): void {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  setPorcelain(flags.porcelain);

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
      case 'status':
      case 'update':
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
