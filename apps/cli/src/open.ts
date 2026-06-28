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
 * macOS-only: open a work as a **fullscreen Terminal** cd'd into the work
 * folder. (It used to also launch a fullscreen editor on the work's
 * `.code-workspace`; that was dropped — open your editor yourself.)
 *
 * Best-effort: window-management hiccups are surfaced as a thrown `MxError` for
 * the caller to downgrade to a warning (the work itself is already created).
 * Throws `UNSUPPORTED` up front on non-macOS platforms.
 *
 * @param workdir - Absolute path to the work folder.
 */
export function openWorkLayout(workdir: string): void {
  if (process.platform !== 'darwin') {
    throw new MxError('-o/--open is only supported on macOS', 'UNSUPPORTED');
  }

  // Open a new Terminal window cd'd into the work folder, then fullscreen it.
  // When the frontmost Terminal window is already fullscreen, macOS's "prefer
  // tabs in full screen" setting forces `do script` to open a TAB rather than a
  // window. Detect that (window count didn't grow) and detach the tab into its
  // own window via Window ▸ Move Tab to New Window before fullscreening.
  osascript(
    [
      'tell application "Terminal"',
      '  activate',
      '  set winCountBefore to count of windows',
      `  do script "cd \\"${aplStr(workdir)}\\""`,
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
