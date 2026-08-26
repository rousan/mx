import { execFileSync, spawnSync } from 'node:child_process';
import { MxError, mxSessionName, isMxSessionName, MX_SESSION_PREFIX } from '@mx/core';

/**
 * The minimum tmux version mx targets. 3.0 is the floor for the session /
 * `set-environment` / `select-layout` behaviour mx relies on; older builds are
 * refused up front with a clear message rather than failing mid-layout.
 */
const MIN_TMUX_MAJOR = 3;

/**
 * Shell program names treated as "just a shell" when deciding whether a pane is
 * running real work. Used by the archive guard to warn only when a pane holds a
 * live foreground process (a dev server, a running `claude`, an editor) rather
 * than an idle prompt.
 */
const SHELL_COMMANDS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'tmux']);

/**
 * Whether the current process is running inside a tmux client (the `$TMUX`
 * environment variable is set by tmux for every process in a pane). Determines
 * whether attaching must use `switch-client` (already inside tmux — a nested
 * `attach` is refused by tmux) or `attach-session` (a bare terminal).
 *
 * @returns True when invoked from within a tmux session.
 */
export function insideTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Run `tmux` with the given arguments and return its trimmed stdout. Throws
 * `TMUX` on a non-zero exit with the captured stderr.
 *
 * @param args - Arguments to pass to the `tmux` binary.
 * @returns The command's stdout, trailing whitespace trimmed.
 */
function tmux(args: string[]): string {
  try {
    return execFileSync('tmux', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; message?: string };
    throw new MxError(
      `tmux ${args.join(' ')} failed: ${(err.stderr ?? err.message ?? '').toString().trim()}`,
      'TMUX',
    );
  }
}

/**
 * Run `tmux` for its exit status only, swallowing output. Returns whether it
 * exited 0. Used for predicate commands like `has-session` where a non-zero
 * exit is an expected "no" rather than an error.
 *
 * @param args - Arguments to pass to the `tmux` binary.
 * @returns True when tmux exited 0.
 */
function tmuxOk(args: string[]): boolean {
  const r = spawnSync('tmux', args, { stdio: ['ignore', 'ignore', 'ignore'] });
  return r.status === 0;
}

/**
 * Ensure a usable `tmux` is installed and new enough, throwing a friendly
 * `TMUX_MISSING` / `TMUX_TOO_OLD` otherwise. Called at the top of every command
 * that touches a session so the failure is a clear preflight message, never a
 * confusing mid-operation error.
 */
export function requireTmux(): void {
  let out: string;
  try {
    out = execFileSync('tmux', ['-V'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new MxError(
      'tmux is not installed or not on PATH — install it (macOS: `brew install tmux`, Debian/Ubuntu: `sudo apt install tmux`), see `mx doctor`',
      'TMUX_MISSING',
    );
  }
  // `tmux -V` prints e.g. "tmux 3.4" or "tmux 3.3a"; take the leading integer part.
  const m = out.match(/(\d+)\.(\d+)/);
  const major = m ? Number(m[1]) : 0;
  if (major < MIN_TMUX_MAJOR) {
    throw new MxError(
      `tmux ${MIN_TMUX_MAJOR}.0+ is required (found "${out}") — please upgrade tmux`,
      'TMUX_TOO_OLD',
    );
  }
}

/**
 * Whether a tmux session with the given name currently exists.
 *
 * @param session - The tmux session name (e.g. `mx/feature-a`).
 * @returns True when the session is live in the tmux server.
 */
export function hasSession(session: string): boolean {
  return tmuxOk(['has-session', '-t', `=${session}`]);
}

/**
 * A live mx-owned tmux session, as surfaced by {@link listMxSessions}.
 */
export interface MxSessionInfo {
  /** The full tmux session name (`mx/<work>`). */
  session: string;
  /** The work name the session belongs to (its `@mx_work` option, or the name with the prefix stripped). */
  work: string;
  /** Number of windows in the session. */
  windows: number;
  /** Whether a client is currently attached to the session. */
  attached: boolean;
}

/**
 * List every mx-owned tmux session (those named `mx/*`) currently live in the
 * tmux server. Returns an empty array when tmux has no server running yet
 * (nothing has been attached). Used for orphan detection and a session picker.
 *
 * @returns The live mx sessions, or `[]` when there are none / no tmux server.
 */
export function listMxSessions(): MxSessionInfo[] {
  // No server yet → `list-sessions` exits non-zero; that's "none", not an error.
  const r = spawnSync(
    'tmux',
    ['list-sessions', '-F', '#{session_name}\t#{@mx_work}\t#{session_windows}\t#{session_attached}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (r.status !== 0 || !r.stdout) return [];
  const out: MxSessionInfo[] = [];
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const [session, work, windows, attached] = line.split('\t');
    if (!isMxSessionName(session)) continue;
    out.push({
      session,
      work: work || session.slice(MX_SESSION_PREFIX.length),
      windows: Number(windows) || 0,
      attached: attached === '1',
    });
  }
  return out;
}

/**
 * The panes in a session that are running real foreground work (something other
 * than an idle shell) — a dev server, a running `claude`, an open editor. Used
 * by `mx work archive` to warn before killing a session that still has live
 * processes.
 *
 * @param session - The tmux session name.
 * @returns The `pane_current_command` of each non-shell pane (empty when idle or the session is gone).
 */
export function busyPanes(session: string): string[] {
  const r = spawnSync(
    'tmux',
    ['list-panes', '-s', '-t', `=${session}`, '-F', '#{pane_current_command}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((cmd) => cmd && !SHELL_COMMANDS.has(cmd));
}

/**
 * Kill a tmux session if it exists. A no-op when the session is already gone, so
 * it's safe to call from archive/destroy without first checking existence.
 *
 * @param session - The tmux session name to kill.
 * @returns True if a session was actually killed, false if none existed.
 */
export function killSession(session: string): boolean {
  if (!hasSession(session)) return false;
  tmux(['kill-session', '-t', `=${session}`]);
  return true;
}

/**
 * Options controlling how a work's session layout is built.
 */
export interface BuildSessionOpts {
  /** Runtime root — exported into the session as `MX_RUNTIME`. */
  root: string;
  /** The work name. */
  work: string;
  /** Absolute work folder path — every pane's working directory. */
  workPath: string;
  /** The full shell command the main window's left pane runs (a `claude` invocation). */
  claudeCmd: string;
  /** The work's Claude session id when known (a resume) — exported as `MX_CLAUDE_SESSION_ID`; omitted on a fresh create. */
  claudeSessionId?: string;
  /** `service -> port` entries to export as `MX_PORT_*`, flattened across worktrees. */
  ports: { worktree: string; service: string; port: number }[];
}

/**
 * Build the default tmux layout for a work in a fresh **detached** session:
 *
 * - session named `mx/<work>`, marked with the `@mx_work` option and seeded with
 *   `MX_*` environment (work, paths, runtime, ports) so every pane knows its
 *   context;
 * - window `main`: left pane runs the resolved `claude` command, right pane runs
 *   `nvim` at the work root (all worktrees visible under `wt/`), focus on claude;
 * - window `run`: a 2x2 tiled grid of shells for dev servers and ad-hoc work.
 *
 * The session is created detached and generously sized so the splits compute
 * against a large area; `window-size latest` makes it reflow to whatever
 * terminal later attaches. This is the out-of-the-box layout — the
 * `work-session` hook (fired by the caller after this returns) can rearrange or
 * extend it.
 *
 * @param session - The tmux session name to create.
 * @param opts - Work context and the pane commands to run.
 */
export function buildSession(session: string, opts: BuildSessionOpts): void {
  const { root, work, workPath, claudeCmd, claudeSessionId: sid, ports } = opts;
  // Detached + generously sized so `split-window` never hits "pane too small";
  // window-size:latest reflows it to the attaching terminal.
  tmux(['new-session', '-d', '-s', session, '-c', workPath, '-x', '250', '-y', '60']);
  tmux(['set-option', '-t', session, 'window-size', 'latest']);
  // Machine-readable marker + shared environment for every pane in the session.
  tmux(['set-option', '-t', session, '@mx_work', work]);
  const setenv = (k: string, v: string): void => void tmux(['set-environment', '-t', session, k, v]);
  setenv('MX_WORK', work);
  setenv('MX_WORK_PATH', workPath);
  setenv('MX_RUNTIME', root);
  setenv('MX_TMUX', '1');
  // Only known when resuming an existing session; a fresh create lets Claude
  // assign the id, so there's nothing to export yet.
  if (sid) setenv('MX_CLAUDE_SESSION_ID', sid);
  for (const p of ports) {
    // e.g. MX_PORT_repo_a_web=3000 — a flat, shell-safe handle per allocated port.
    const key = `MX_PORT_${p.worktree}_${p.service}`.replace(/[^A-Za-z0-9_]/g, '_');
    setenv(key, String(p.port));
  }
  // Main window: claude (left) + nvim (right).
  tmux(['rename-window', '-t', `${session}:0`, 'main']);
  tmux(['send-keys', '-t', `${session}:main.0`, claudeCmd, 'Enter']);
  tmux(['split-window', '-h', '-t', `${session}:main.0`, '-c', workPath]);
  tmux(['send-keys', '-t', `${session}:main.1`, 'nvim .', 'Enter']);
  tmux(['select-pane', '-t', `${session}:main.0`]);
  // Run window: 2x2 grid of shells for servers / ad-hoc commands. Three splits
  // off the active pane then a tiled layout give an even 2x2.
  tmux(['new-window', '-t', session, '-n', 'run', '-c', workPath]);
  tmux(['split-window', '-t', `${session}:run`, '-c', workPath]);
  tmux(['split-window', '-t', `${session}:run`, '-c', workPath]);
  tmux(['split-window', '-t', `${session}:run`, '-c', workPath]);
  tmux(['select-layout', '-t', `${session}:run`, 'tiled']);
  // Land the user on the main window.
  tmux(['select-window', '-t', `${session}:main`]);
}

/**
 * Attach to (or, when already inside tmux, switch the current client to) a
 * session, handing the terminal over. Uses `switch-client` when `$TMUX` is set
 * — tmux refuses a nested `attach` — and a blocking `attach-session` otherwise.
 *
 * @param session - The tmux session name to attach to.
 */
export function attachOrSwitch(session: string): void {
  const sub = insideTmux() ? 'switch-client' : 'attach-session';
  // stdio inherited so the terminal is genuinely handed to tmux; attach blocks
  // until the user detaches, switch-client returns immediately.
  const r = spawnSync('tmux', [sub, '-t', `=${session}`], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new MxError(`tmux ${sub} -t ${session} failed`, 'TMUX');
  }
}

/**
 * The tmux session name mx uses for a work — re-exported so command modules can
 * build a target without importing `@mx/core` naming directly.
 *
 * @param work - The work name.
 * @returns The `mx/<work>` session name.
 */
export function sessionFor(work: string): string {
  return mxSessionName(work);
}

/**
 * Read one environment variable from a live tmux session's environment (as set
 * by `set-environment`). Returns null when the session is gone or the variable
 * isn't set. Used by `mx work gc` to read a session's `MX_RUNTIME` so it only
 * judges sessions that belong to the current runtime.
 *
 * @param session - The tmux session name.
 * @param key - The environment variable to read.
 * @returns The value, or null when absent.
 */
export function sessionEnv(session: string, key: string): string | null {
  const r = spawnSync('tmux', ['show-environment', '-t', `=${session}`, key], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status !== 0 || !r.stdout) return null;
  const line = r.stdout.trim();
  // Output is `KEY=value`, or `-KEY` when the variable is explicitly unset.
  const eq = line.indexOf('=');
  if (eq < 0) return null;
  return line.slice(eq + 1);
}

/**
 * Whether an executable resolves on `PATH` (best-effort via `command -v`).
 *
 * @param bin - Executable name.
 * @returns True when found.
 */
function onPath(bin: string): boolean {
  return spawnSync('command', ['-v', bin], { stdio: 'ignore', shell: '/bin/sh' }).status === 0;
}

/**
 * Whether `fzf` is available for an interactive picker (`mx work switch`).
 *
 * @returns True when fzf is on PATH.
 */
export function fzfAvailable(): boolean {
  return onPath('fzf');
}

/**
 * Present a list of choices in an fzf picker and return the selected line, or
 * null when fzf isn't installed or the user cancelled (Esc / empty selection).
 * fzf reads the candidate list from stdin and drives its UI on `/dev/tty`, so
 * this works even though stdin is a pipe here.
 *
 * @param choices - Candidate lines to choose among.
 * @param prompt - The fzf prompt label.
 * @returns The chosen line, or null.
 */
export function fzfPick(choices: string[], prompt: string): string | null {
  if (!onPath('fzf')) return null;
  const r = spawnSync('fzf', ['--prompt', prompt, '--height', '40%', '--reverse'], {
    input: choices.join('\n'),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const sel = (r.stdout ?? '').trim();
  return sel === '' ? null : sel;
}
