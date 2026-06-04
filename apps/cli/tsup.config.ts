import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

/**
 * Bundles the CLI into the publishable /npm folder at the repo root:
 *   npm/bin/mx.js          (this tsup build; `clean: true` wipes only bin/)
 *   npm/templates/         (copied below from /templates)
 *   npm/LICENSE            (copied below from /LICENSE)
 *   npm/package.json       (committed source of truth for the public package)
 *   npm/README.md          (committed)
 *
 * `@mx/core` is bundled in from source (noExternal) so the produced file runs
 * without a node_modules tree; only Node builtins stay external.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const npmDir = resolve(repoRoot, 'npm');

export default defineConfig({
  entry: { mx: 'src/bin/mx.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@mx/core'],
  clean: true,
  outDir: resolve(npmDir, 'bin'),
  onSuccess: async () => {
    const templatesDst = resolve(npmDir, 'templates');
    await rm(templatesDst, { recursive: true, force: true });
    await cp(resolve(repoRoot, 'templates'), templatesDst, { recursive: true });

    const licenseDst = resolve(npmDir, 'LICENSE');
    await rm(licenseDst, { force: true });
    await cp(resolve(repoRoot, 'LICENSE'), licenseDst);
  },
});
