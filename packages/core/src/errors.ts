/**
 * Domain error type shared across @mx/core.
 *
 * Carries a stable, machine-readable `code` (e.g. `NO_RUNTIME`, `PORT_TAKEN`)
 * in addition to the human message, so the CLI can emit structured
 * `{ error, code }` output and callers can branch on the code.
 */
export class MxError extends Error {
  /**
   * Stable error code identifying the failure category. Surfaced verbatim in
   * the CLI's `--porcelain` error output.
   */
  readonly code: string;

  /**
   * @param message - Human-readable explanation of the failure.
   * @param code - Stable category code; defaults to a generic `ERROR`.
   */
  constructor(message: string, code = 'ERROR') {
    super(message);
    this.name = 'MxError';
    this.code = code;
  }
}
