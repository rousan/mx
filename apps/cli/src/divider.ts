import { renderBanner } from '@mx/core';

/** ANSI: clear the screen and scrollback, and move the cursor home. */
const CLEAR = '\x1b[2J\x1b[3J\x1b[H';
/** ANSI: hide the cursor. */
const HIDE_CURSOR = '\x1b[?25l';
/** ANSI: show the cursor. */
const SHOW_CURSOR = '\x1b[?25h';

/**
 * Fill the current terminal with `text` as large block letters and **hold** it
 * on screen until the user quits (Ctrl-C or `q`), so the terminal reads as a
 * labelled divider. Re-renders on window resize (e.g. after the window is made
 * fullscreen). Used by `mx divider`.
 *
 * When stdout is not a TTY (piped/redirected), it prints the banner once at a
 * default size and returns, rather than holding.
 *
 * @param text - The label to display.
 */
export function runDivider(text: string): void {
  const paint = (): void => {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    process.stdout.write(CLEAR + renderBanner(text, cols, rows));
  };

  // Non-interactive (piped) stdout: emit once and return, no hold.
  if (!process.stdout.isTTY) {
    process.stdout.write(renderBanner(text, process.stdout.columns || 80, process.stdout.rows || 24) + '\n');
    return;
  }

  process.stdout.write(HIDE_CURSOR);
  paint();
  process.stdout.on('resize', paint); // keep filling the window as it resizes

  /** Restore the terminal and exit cleanly. */
  const quit = (): void => {
    process.stdout.write(CLEAR + SHOW_CURSOR);
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);

  // Raw mode keeps typed keys from echoing over the banner; we watch for Ctrl-C
  // (0x03) and `q`/`Q` to quit, and resume stdin so the process stays alive.
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
    } catch {
      // Not all TTYs support raw mode; fall back to cooked mode + SIGINT.
    }
  }
  process.stdin.resume();
  process.stdin.on('data', (d: Buffer) => {
    const b = d[0];
    if (b === 0x03 || b === 0x71 || b === 0x51) quit(); // Ctrl-C, q, Q
  });
}
