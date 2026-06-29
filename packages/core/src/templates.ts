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
 * Stamp the central lifecycle-hook templates from `<templatesDir>/hooks/` into
 * the runtime's `<targetDir>/hooks/`, **only those not already present** — these
 * carry the user's own branching logic, so they're never overwritten once they
 * exist (unlike `bin/`, which is mx-owned). Each newly-stamped hook is made
 * executable. Always ensures the `hooks/` directory exists even when there are
 * no templates, so the user has somewhere to add hooks.
 *
 * @param targetDir - The runtime root to write `hooks/` into.
 * @param templatesDir - Directory containing the `hooks/<event>` templates.
 * @returns Absolute paths created this call (the dir if newly made, plus each
 *   newly-stamped hook).
 */
export function stampRuntimeHooks(targetDir: string, templatesDir: string): string[] {
  const created: string[] = [];
  const destDir = path.join(targetDir, 'hooks');
  if (!exists(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    created.push(destDir);
  }
  const srcDir = path.join(templatesDir, 'hooks');
  if (!exists(srcDir)) return created;
  for (const name of fs.readdirSync(srcDir).sort()) {
    const src = path.join(srcDir, name);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(destDir, name);
    if (exists(dest)) continue; // never clobber user hook logic
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    created.push(dest);
  }
  return created;
}

/**
 * Stamp mx-shipped runtime utility bins from `<templatesDir>/bin/` into the
 * runtime's `<targetDir>/bin/`. Shipped bins are **mx-owned and always
 * re-stamped** (overwritten with the current version's content, like the runtime
 * `CLAUDE.md`) so improvements ship to users on `mx sync`; **user-added bins**
 * (any file whose name isn't shipped) are never touched. Each stamped bin is
 * made executable. Always ensures the `bin/` directory exists even when there
 * are no templates, so the user has somewhere to drop their own bins.
 *
 * To customize a shipped bin without losing it on the next sync, copy it to a
 * new name (mx only owns the names it ships).
 *
 * @param targetDir - The runtime root to write `bin/` into.
 * @param templatesDir - Directory containing the `bin/<script>` templates.
 * @returns Absolute paths written this call (the dir if newly made, plus each
 *   stamped bin).
 */
export function stampRuntimeBins(targetDir: string, templatesDir: string): string[] {
  const written: string[] = [];
  const destDir = path.join(targetDir, 'bin');
  if (!exists(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    written.push(destDir);
  }
  const srcDir = path.join(templatesDir, 'bin');
  if (!exists(srcDir)) return written;
  for (const name of fs.readdirSync(srcDir).sort()) {
    const src = path.join(srcDir, name);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(destDir, name);
    // Always (re)stamp shipped bins — mx-owned, like CLAUDE.md.
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
    written.push(dest);
  }
  return written;
}

