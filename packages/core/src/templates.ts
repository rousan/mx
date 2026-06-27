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

/**
 * Stamp the starter `context/INDEX.json` into a runtime, **only if it doesn't
 * already exist**.
 *
 * The context registry is user data — accumulated across sessions — so we
 * never overwrite it. Both `mx init` (idempotent re-runs) and `mx update`
 * (existing runtimes upgrading) call this; both want the same semantics.
 *
 * Creates the `context/` directory if missing. Returns the destination path
 * if newly stamped, `null` if it already existed.
 *
 * @param targetDir - The runtime root to write into.
 * @param templatesDir - Directory containing the source `context/INDEX.json` template.
 * @returns Absolute path of the stamped file, or `null` if it was already present.
 */
export function stampContextIndex(targetDir: string, templatesDir: string): string | null {
  const dest = path.join(targetDir, 'context', 'INDEX.json');
  if (exists(dest)) return null;
  const src = path.join(templatesDir, 'context', 'INDEX.json');
  if (!exists(src)) throw new MxError(`missing template: ${src}`, 'NO_TEMPLATE');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return dest;
}

/**
 * mx-owned per-repo script files, copied into a repo's container
 * (`repos/<name>/`) from `<templatesDir>/repo/<file>`. User-customizable once
 * stamped, so each is written only when missing.
 */
const REPO_SCRIPTS = ['setup.sh', 'health.sh'] as const;

/**
 * Stamp mx-owned per-repo scripts (e.g. `setup.sh`) into a repo container,
 * **only those not already present** (they're user-editable after creation).
 * Each newly-stamped script is made executable.
 *
 * @param containerDir - The repo's container directory (`repos/<name>`).
 * @param templatesDir - Directory containing the `repo/<script>` templates.
 * @returns Absolute paths of scripts newly stamped this call.
 */
export function stampRepoScripts(containerDir: string, templatesDir: string): string[] {
  const created: string[] = [];
  for (const name of REPO_SCRIPTS) {
    const dest = path.join(containerDir, name);
    if (exists(dest)) continue;
    const src = path.join(templatesDir, 'repo', name);
    if (!exists(src)) throw new MxError(`missing template: ${src}`, 'NO_TEMPLATE');
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    created.push(dest);
  }
  return created;
}
