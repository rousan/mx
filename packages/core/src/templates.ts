import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MxError } from './errors';
import { exists } from './fsutil';

/**
 * Cached project-mx root once located, so the upward filesystem walk runs once.
 */
let cachedRoot: string | null = null;

/**
 * Locate the project-mx source root by walking up from this module's location
 * until the `pnpm-workspace.yaml` marker is found.
 *
 * Works both when bundled into `apps/cli/dist` and when run from source under
 * Vitest, since the workspace root sits above both.
 *
 * @returns Absolute path to the project-mx root.
 */
export function findProjectRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (exists(path.join(dir, 'pnpm-workspace.yaml'))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new MxError(
    'could not locate the project-mx root (no pnpm-workspace.yaml above this module)',
    'NO_PROJECT_ROOT',
  );
}

/**
 * Directory holding the runtime templates that get stamped into a runtime.
 *
 * Honors `MX_TEMPLATES_DIR` (used by tests) before falling back to the
 * `templates/` folder at the project root.
 *
 * @returns Absolute path to the templates directory.
 */
export function templatesDir(): string {
  return process.env.MX_TEMPLATES_DIR || path.join(findProjectRoot(), 'templates');
}

/**
 * Path to the machine-local `.mx-runtime` pointer file.
 *
 * Honors `MX_RUNTIME_POINTER` (used by tests so a sandbox `init` never clobbers
 * the real pointer) before falling back to `.mx-runtime` at the project root.
 *
 * @returns Absolute path to the runtime pointer file.
 */
export function runtimePointerPath(): string {
  return process.env.MX_RUNTIME_POINTER || path.join(findProjectRoot(), '.mx-runtime');
}

/**
 * Stamp the runtime `CLAUDE.md` from the template into a runtime directory.
 *
 * @param targetDir - The runtime root to write `CLAUDE.md` into.
 * @returns Absolute path of the written `CLAUDE.md`.
 */
export function stampClaudeMd(targetDir: string): string {
  const src = path.join(templatesDir(), 'CLAUDE.md');
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
