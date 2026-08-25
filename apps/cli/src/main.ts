import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MxError } from '@mx/core';
import { parseArgs } from './args';
import { setPorcelain, emit, fail, check, bold, dim } from './output';
import { HELP } from './help';
import { runGlobal } from './commands/global';
import { dispatchRepo } from './commands/repo';
import { dispatchWork } from './commands/work';
import { dispatchBin } from './commands/bin';
import { dispatchHealth } from './commands/health';
import { dispatchMissionControl } from './commands/missionControl';
import { runDoctor } from './commands/doctor';
import { runDivider } from './divider';
import { openFullscreenTerminal, shq } from './open';

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
      case 'bin':
      case 'bins':
        return dispatchBin(positionals, flags);
      case 'health':
        return dispatchHealth(positionals, flags);
      case 'mission-control':
      case 'mc':
        return dispatchMissionControl(positionals, flags);
      case 'doctor':
        return runDoctor(positionals, flags);
      case 'divider': {
        // Fill a terminal with big block text as a visual separator for your
        // Spaces. Bare: takes over the current terminal and holds. With -o:
        // opens a new fullscreen Terminal (macOS) running this same command.
        // Preserve the caller's spaces verbatim (no trim); validate on content.
        const text = positionals.slice(1).join(' ');
        if (!text.trim()) throw new MxError('usage: mx divider <text> [-o]', 'BAD_ARGS');
        if (flags.open) {
          // Re-invoke this exact CLI (node + entry script) in the new Terminal,
          // without -o, so it clears + renders + holds there. Collapse any real
          // newline to the literal `\n` sequence so the AppleScript `do script`
          // command stays single-line (renderBanner treats `\n` as a break).
          const safe = text.replace(/\n/g, '\\n');
          openFullscreenTerminal(
            `${shq(process.execPath)} ${shq(process.argv[1])} divider ${shq(safe)}`,
          );
          emit(
            () => console.log(`${check()} opened divider ${bold(text.replace(/\n/g, ' '))} ${dim('(new Terminal)')}`),
            { divider: text, opened: true },
          );
          return;
        }
        return runDivider(text);
      }
      default:
        throw new MxError(`unknown command: ${positionals[0]}`, 'BAD_ARGS');
    }
  } catch (e) {
    fail(e);
  }
}
