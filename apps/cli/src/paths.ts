import { readFileSync } from 'node:fs';
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

/**
 * Path to the bundled mission-control UI — a single self-contained HTML file
 * built from `apps/mission-control/` and copied into the package next to
 * `templates/`. Resolved relative to the bundled entry (`<pkg>/bin/mx.js` ->
 * package root -> `mission-control/index.html`), so it works in dev (after
 * `pnpm build`) and once installed via npm. `MX_MISSION_CONTROL_HTML` is an
 * escape hatch for local development against an unbundled build.
 *
 * @returns Absolute path to the mission-control `index.html`.
 */
export function missionControlHtml(): string {
  if (process.env.MX_MISSION_CONTROL_HTML) return process.env.MX_MISSION_CONTROL_HTML;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'mission-control', 'index.html');
}

/**
 * This CLI's version, read from the installed package's `package.json`
 * (`<pkg>/bin/mx.js` → `<pkg>/package.json`). Used by `mx update` to pin the
 * self-update to the current major and to detect newer majors.
 *
 * @returns The semver string (e.g. `"2.0.0"`).
 */
export function cliVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}
