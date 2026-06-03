import { MxError } from '@mx/core';

/**
 * A human-output producer: either a function that prints, a ready string, or
 * null to print nothing in human mode.
 */
type HumanOutput = (() => void) | string | null;

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
 * `mx: <message>` line to stderr. `MxError` codes are preserved; other errors
 * report `INTERNAL`.
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
    process.stderr.write(`mx: ${message}\n`);
  }
  process.exit(1);
}
