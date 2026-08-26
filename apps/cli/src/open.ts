import { execFileSync, spawn, spawnSync } from 'node:child_process';
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
 * Candidate Linux terminal emulators tried (in order) when no `$MX_TERMINAL`
 * template is set. Each entry is the argv that runs a shell command in a new
 * window, with `{cmd}` replaced by the command. The first whose binary is on
 * `PATH` wins.
 */
const LINUX_TERMINALS: string[][] = [
  ['x-terminal-emulator', '-e', 'bash', '-lc', '{cmd}'],
  ['kitty', '--start-as=fullscreen', 'bash', '-lc', '{cmd}'],
  ['wezterm', 'start', '--', 'bash', '-lc', '{cmd}'],
  ['alacritty', '-e', 'bash', '-lc', '{cmd}'],
  ['gnome-terminal', '--full-screen', '--', 'bash', '-lc', '{cmd}'],
  ['konsole', '--fullscreen', '-e', 'bash', '-lc', '{cmd}'],
  ['xterm', '-e', 'bash', '-lc', '{cmd}'],
];

/**
 * Whether a binary is resolvable on `PATH` (best-effort via `command -v`).
 *
 * @param bin - The executable name to look up.
 * @returns True when the binary appears to be on PATH.
 */
function onPath(bin: string): boolean {
  const r = spawnSync('command', ['-v', bin], { stdio: 'ignore', shell: '/bin/sh' });
  return r.status === 0;
}

/**
 * Open a **new terminal window** (fullscreen where the emulator supports it)
 * running `command`. This is the cross-platform launcher behind `mx work open`:
 *
 * - **macOS:** a fullscreen Terminal via {@link openFullscreenTerminal}.
 * - **Linux:** the `$MX_TERMINAL` template if set (a shell string where `{cmd}`
 *   is replaced by the command, or, lacking `{cmd}`, the command is appended),
 *   otherwise the first available emulator from a small built-in list.
 *
 * Throws `UNSUPPORTED` (with the exact `mx work attach` line to run by hand) when
 * no launcher is available, so the caller can downgrade to a warning — the
 * session already exists and `mx work attach` always works in-place.
 *
 * @param command - The shell command the new terminal should run (e.g. `mx work -n feat attach`).
 */
export function spawnWorkTerminal(command: string): void {
  if (process.platform === 'darwin') {
    openFullscreenTerminal(command);
    return;
  }
  // Linux: prefer an explicit user-configured terminal template.
  const tmpl = process.env.MX_TERMINAL;
  if (tmpl && tmpl.trim()) {
    const full = tmpl.includes('{cmd}') ? tmpl.replace(/\{cmd\}/g, command) : `${tmpl} ${command}`;
    spawn('/bin/sh', ['-c', full], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  // Otherwise try known emulators in order.
  for (const argv of LINUX_TERMINALS) {
    if (!onPath(argv[0])) continue;
    const args = argv.slice(1).map((a) => a.replace('{cmd}', command));
    spawn(argv[0], args, { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  throw new MxError(
    'no terminal emulator found to open a window — set $MX_TERMINAL (a command template using {cmd}) ' +
      'or just run the attach command yourself in a terminal',
    'UNSUPPORTED',
  );
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
