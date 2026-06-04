import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists } from './fsutil';

/**
 * Stamp the runtime `CLAUDE.md` from a templates directory into a runtime.
 *
 * The caller (the CLI) decides where the templates live and passes the
 * directory in, so core stays independent of the on-disk layout / packaging.
 *
 * @param targetDir - The runtime root to write `CLAUDE.md` into.
 * @param templatesDir - Directory containing the source `CLAUDE.md` template.
 * @returns Absolute path of the written `CLAUDE.md`.
 */
export function stampClaudeMd(targetDir: string, templatesDir: string): string {
  const src = path.join(templatesDir, 'CLAUDE.md');
  if (!exists(src)) throw new MxError(`missing template: ${src}`, 'NO_TEMPLATE');
  const dest = path.join(targetDir, 'CLAUDE.md');
  fs.copyFileSync(src, dest);
  return dest;
}

/**
 * Remove a runtime's `README.md` if present (runtimes carry only `CLAUDE.md`).
 *
 * @param targetDir - The runtime root to clean.
 * @returns True if a stale README was removed.
 */
export function removeStaleRuntimeReadme(targetDir: string): boolean {
  const readme = path.join(targetDir, 'README.md');
  if (exists(readme)) {
    fs.rmSync(readme);
    return true;
  }
  return false;
}
