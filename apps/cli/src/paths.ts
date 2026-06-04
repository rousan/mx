import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directory holding the runtime templates shipped with this CLI.
 *
 * Resolved relative to the bundled entry file (`dist/bin/mx.js` -> package root
 * -> `templates`), so it works identically in dev and once installed via npm
 * (the package ships `templates/` via its `files` field). `MX_TEMPLATES_DIR`
 * overrides it (used by tests).
 *
 * @returns Absolute path to the templates directory.
 */
export function templatesDir(): string {
  if (process.env.MX_TEMPLATES_DIR) return process.env.MX_TEMPLATES_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', '..', 'templates');
}
