import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import { MxError } from '@mx/core';

/**
 * A human-output producer: either a function that prints, a ready string, or
 * null to print nothing in human mode.
 */
type HumanOutput = (() => void) | string | null;

/**
 * True when stdout looks like an interactive terminal and the user hasn't
 * opted out via the standard `NO_COLOR` env var. Sampled once at module
 * load; TTY state doesn't change mid-process.
 *
 * The CLI is intentionally monochrome — only typography weight (bold) and
 * intensity (dim) carry visual hierarchy. The TTY check still gates these so
 * piped/redirected output stays as plain text without ANSI codes.
 *
 * @see https://no-color.org
 */
const USE_STYLE = process.stdout.isTTY && !process.env.NO_COLOR;

/**
 * Wrap a string in an ANSI code, or return it unchanged when styling is off
 * (NO_COLOR set, or stdout isn't a TTY — e.g. piped or redirected).
 *
 * @param s - The string to style.
 * @param code - The ANSI SGR parameter (e.g. `2` for dim, `1` for bold).
 * @returns The styled string in TTY mode, otherwise `s` unchanged.
 */
function wrap(s: string, code: number): string {
  return USE_STYLE ? `\x1b[${code}m${s}\x1b[0m` : s;
}

/**
 * Dim — for everything that isn't a primary identifier: paths, branches,
 * counts, dates, ports, archived chips, descriptions, port labels, port
 * values. The bulk of the output sits at this tier.
 *
 * @param s - The string to style.
 * @returns The dimmed string, or `s` unchanged when styling is off.
 */
export function dim(s: string): string {
  return wrap(s, 2);
}

/**
 * Bold — for the small set of elements that should anchor a block: section
 * titles (`mx`, `repos`, `works`, `context`), and the work name at the head
 * of a per-work block.
 *
 * @param s - The string to style.
 * @returns The bolded string, or `s` unchanged when styling is off.
 */
export function bold(s: string): string {
  return wrap(s, 1);
}

/** Plain `✓` glyph — "this happened successfully". Shape carries the semantic. */
export function check(): string {
  return '✓';
}

/** Plain `⚠` glyph — "heads up before proceeding". Shape carries the semantic. */
export function warn(): string {
  return '⚠';
}

/**
 * Collapse the user's home directory prefix to `~` for friendlier human-mode
 * paths (e.g. `/Users/x/mx/works/feat` → `~/mx/works/feat`). Porcelain output
 * keeps absolute paths — this is presentation only.
 *
 * @param p - Absolute path.
 * @returns Path with `$HOME` collapsed to `~`, or `p` unchanged if not under home.
 */
export function tildify(p: string): string {
  const home = os.homedir();
  if (p === home) return '~';
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
}

/**
 * Synchronously prompt the user with a yes/no question. Returns true only on
 * an explicit `y`/`yes` (case-insensitive). Anything else — including empty,
 * EOF, an interrupted read, or a non-TTY stdin — counts as no.
 *
 * Implementation: delegates to `/bin/sh -c 'read REPLY'` because Node's
 * `fs.readSync(0, …)` returns EAGAIN immediately on macOS when stdin is in
 * non-blocking mode (a long-standing libuv quirk), and `readline/promises`
 * is async. The shell `read` builtin handles TTY-blocking reliably across
 * macOS and Linux.
 *
 * @param prompt - Text to print before reading the answer (e.g. `"Proceed? (y/N) "`).
 * @returns True for an affirmative answer, false otherwise.
 */
export function confirmYesNo(prompt: string): boolean {
  if (!process.stdin.isTTY) return false;
  process.stdout.write(prompt);
  const result = spawnSync(
    '/bin/sh',
    ['-c', "IFS= read -r REPLY && printf '%s' \"$REPLY\""],
    { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  if (result.status !== 0 || result.signal) return false;
  const answer = (result.stdout ?? '').trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/**
 * Module-level porcelain toggle, set once from the parsed flags at startup.
 */
let porcelain = false;

/**
 * Enable or disable porcelain (JSON) output for the process.
 *
 * @param value - True to emit JSON on reads and structured errors.
 */
export function setPorcelain(value: boolean): void {
  porcelain = value;
}

/**
 * Emit a command result, choosing JSON or human output based on the porcelain
 * flag.
 *
 * @param human - Producer for human-readable output (function or string), or null.
 * @param data - The structured value to print as JSON in porcelain mode.
 */
export function emit(human: HumanOutput, data: unknown): void {
  if (porcelain) {
    process.stdout.write(JSON.stringify(data ?? null, null, 2) + '\n');
  } else if (typeof human === 'function') {
    human();
  } else if (human != null) {
    process.stdout.write(human + '\n');
  }
}

/**
 * Print an error and exit with a non-zero code.
 *
 * In porcelain mode emits `{ error, code }` JSON on stdout; otherwise prints a
 * `mx: <message>` line to stderr (with the `mx:` prefix bolded when stderr is
 * a TTY). `MxError` codes are preserved; other errors report `INTERNAL`.
 *
 * @param err - The thrown error.
 * @returns Never returns; the process exits.
 */
export function fail(err: unknown): never {
  const code = err instanceof MxError ? err.code : 'INTERNAL';
  const message = err instanceof Error ? err.message : String(err);
  if (porcelain) {
    process.stdout.write(JSON.stringify({ error: message, code }, null, 2) + '\n');
  } else {
    const useStyle = process.stderr.isTTY && !process.env.NO_COLOR;
    const prefix = useStyle ? `\x1b[1mmx:\x1b[0m` : 'mx:';
    process.stderr.write(`${prefix} ${message}\n`);
  }
  process.exit(1);
}
