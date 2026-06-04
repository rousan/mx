import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directory holding the runtime templates shipped with this CLI.
 *
 * Resolved relative to the bundled entry file (`<pkg>/bin/mx.js` -> package
 * root -> `templates`). Works identically in dev (bundle lives at
 * `npm/bin/mx.js`, templates at `npm/templates/` — both produced by
 * `pnpm build` from the source `/templates` folder) and once installed via
 * npm. `MX_TEMPLATES_DIR` is an escape hatch for tests that need to point at
 * a fixture template directory.
 *
 * @returns Absolute path to the templates directory.
 */
export function templatesDir(): string {
  if (process.env.MX_TEMPLATES_DIR) return process.env.MX_TEMPLATES_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'templates');
}
