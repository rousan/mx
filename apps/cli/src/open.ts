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
 * macOS-only: open a freshly-created work as a **fullscreen Terminal** (cd'd
 * into the work folder) plus a **fullscreen editor** (Cursor, falling back to
 * VS Code) on the work's `.code-workspace`. The two land as separate
 * fullscreen Spaces; the user merges them into Split View by hand.
 *
 * Best-effort: window-management hiccups are surfaced as a thrown `MxError` for
 * the caller to downgrade to a warning (the work itself is already created).
 * Throws `UNSUPPORTED` up front on non-macOS platforms.
 *
 * @param workdir - Absolute path to the work folder.
 * @param workspace - Absolute path to the work's `.code-workspace` file.
 */
export function openWorkLayout(workdir: string, workspace: string): void {
  if (process.platform !== 'darwin') {
    throw new MxError('-o/--open is only supported on macOS', 'UNSUPPORTED');
  }

  // 1. Launch the editor on the workspace (prefer Cursor, fall back to VS Code).
  //    `open -a` avoids depending on the `cursor`/`code` CLI being on PATH.
  let editorProcess = 'Cursor';
  try {
    execFileSync('open', ['-a', 'Cursor', workspace], { stdio: 'ignore' });
  } catch {
    try {
      execFileSync('open', ['-a', 'Visual Studio Code', workspace], { stdio: 'ignore' });
      editorProcess = 'Code';
    } catch {
      editorProcess = ''; // no editor found — Terminal still opens
    }
  }

  // 2. Open a new Terminal window cd'd into the work folder, then fullscreen it.
  //    When the frontmost Terminal window is already fullscreen, macOS's "prefer
  //    tabs in full screen" setting forces `do script` to open a TAB rather than
  //    a window. Detect that (window count didn't grow) and detach the tab into
  //    its own window via Window ▸ Move Tab to New Window before fullscreening.
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

  // 3. Fullscreen the editor. Cursor/VS Code are Electron apps whose windows are
  //    NOT reliably exposed to the AppleScript accessibility tree (System Events
  //    reports 0 windows), so setting AXFullScreen on a window doesn't work.
  //    Instead activate the app and send its fullscreen shortcut Ctrl+Cmd+F
  //    (workbench.action.toggleFullScreen → native macOS fullscreen), which
  //    needs no window-level AX. key code 3 = "f".
  if (editorProcess) {
    const appName = editorProcess === 'Code' ? 'Visual Studio Code' : 'Cursor';
    osascript(
      [
        `tell application "${appName}" to activate`,
        // wait until the app is frontmost (cold launch can take a few seconds)
        'tell application "System Events"',
        '  set n to 0',
        `  repeat until (exists process "${editorProcess}") and (frontmost of process "${editorProcess}" is true)`,
        '    delay 0.3',
        '    set n to n + 1',
        '    if n > 40 then exit repeat',
        '  end repeat',
        'end tell',
        // let the workbench finish loading so it accepts the keybinding
        'delay 1.2',
        'tell application "System Events" to key code 3 using {control down, command down}',
      ].join('\n'),
    );
  }
}
