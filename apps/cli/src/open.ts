import { execFileSync } from 'node:child_process';
import { MxError } from '@mx/core';

/**
 * Run an AppleScript snippet via `osascript`. Throws on a non-zero exit, with
 * the captured stderr as the message.
 *
 * @param script - The AppleScript source (newlines allowed).
 */
function osascript(script: string): void {
  try {
    execFileSync('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; message?: string };
    throw new MxError(
      `osascript failed: ${(err.stderr ?? err.message ?? '').toString().trim()}`,
      'OSASCRIPT',
    );
  }
}

/**
 * Escape a string for safe interpolation inside an AppleScript double-quoted
 * literal (backslash and double-quote).
 *
 * @param s - Raw string.
 * @returns Escaped string.
 */
function aplStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Single-quote a string for safe use as one argument in a POSIX shell command
 * (the closing quote, an escaped literal quote, then a reopening quote). Lets
 * `mx work open` pass work names, session ids, and file paths into the Terminal
 * command line without word-splitting or metacharacter surprises.
 *
 * @param s - Raw string (path, name, id).
 * @returns The shell-single-quoted token.
 */
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Options for {@link openWorkLayout}.
 */
export interface OpenWorkOpts {
  /**
   * Shell command to run in the new Terminal after `cd`-ing into the work
   * folder — e.g. a `claude --resume <id>` / `claude -n <name>` invocation. When
   * omitted, the Terminal simply opens at the work folder with an interactive
   * shell (the original behavior).
   */
  command?: string;
}

/**
 * macOS-only: open a work as a **fullscreen Terminal** cd'd into the work
 * folder. (It used to also launch a fullscreen editor on the work's
 * `.code-workspace`; that was dropped — open your editor yourself.)
 *
 * Best-effort: window-management hiccups are surfaced as a thrown `MxError` for
 * the caller to downgrade to a warning (the work itself is already created).
 * Throws `UNSUPPORTED` up front on non-macOS platforms.
 *
 * @param workdir - Absolute path to the work folder.
 * @param opts - Optional launch command to run in the new Terminal (e.g. a `claude` invocation).
 */
export function openWorkLayout(workdir: string, opts: OpenWorkOpts = {}): void {
  // The shell command Terminal runs: cd into the work folder, then optionally
  // chain the caller's launch command (e.g. `claude --resume <id>`).
  openFullscreenTerminal(`cd ${shq(workdir)}${opts.command ? ` && ${opts.command}` : ''}`);
}

/**
 * macOS-only: open a **new fullscreen Terminal window** running `command`. The
 * low-level primitive behind `mx work open` (which prefixes a `cd`) and
 * `mx divider` (which runs the banner renderer). Throws `UNSUPPORTED` off macOS
 * and `OSASCRIPT` if the AppleScript step fails.
 *
 * @param command - The shell command to run in the new Terminal window.
 */
export function openFullscreenTerminal(command: string): void {
  if (process.platform !== 'darwin') {
    throw new MxError('-o/--open is only supported on macOS', 'UNSUPPORTED');
  }

  const shellCmd = command;

  // Open a new Terminal window running the command, then fullscreen it.
  // When the frontmost Terminal window is already fullscreen, macOS's "prefer
  // tabs in full screen" setting forces `do script` to open a TAB rather than a
  // window. Detect that (window count didn't grow) and detach the tab into its
  // own window via Window ▸ Move Tab to New Window before fullscreening.
  osascript(
    [
      'tell application "Terminal"',
      '  activate',
      '  set winCountBefore to count of windows',
      `  do script "${aplStr(shellCmd)}"`,
      '  delay 0.5',
      '  set winCountAfter to count of windows',
      'end tell',
      'if winCountAfter is less than or equal to winCountBefore then',
      '  tell application "System Events" to tell process "Terminal"',
      '    try',
      '      click menu item "Move Tab to New Window" of menu "Window" of menu bar 1',
      '      delay 0.4',
      '    end try',
      '  end tell',
      'end if',
      'tell application "System Events" to tell process "Terminal"',
      '  try',
      '    set value of attribute "AXFullScreen" of window 1 to true',
      '  end try',
      'end tell',
    ].join('\n'),
  );
}
