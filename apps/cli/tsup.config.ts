import { existsSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

/**
 * Bundles the CLI into the publishable /npm folder at the repo root:
 *   npm/bin/mx.js              (this tsup build; `clean: true` wipes only bin/)
 *   npm/templates/             (copied below from /templates)
 *   npm/mission-control/       (copied below from apps/mission-control/dist —
 *                               the single self-contained dashboard HTML)
 *   npm/LICENSE                (copied below from /LICENSE)
 *   npm/package.json           (committed source of truth for the public package)
 *   npm/README.md              (committed)
 *
 * `@mx/core` is bundled in from source (noExternal) so the produced file runs
 * without a node_modules tree; only Node builtins stay external. The dashboard
 * is React/Vite/Tailwind, but it ships only as a prebuilt static file — nothing
 * from it becomes a runtime dependency. Run `pnpm build` (which builds
 * mission-control first) so its `dist/` exists when this copy runs.
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

    // The prebuilt mission-control bundle (single self-contained index.html).
    // Built by `pnpm build` before this CLI build; warn if it's missing so a
    // bare `pnpm build:cli` doesn't silently ship a dashboard-less package.
    const mcSrc = resolve(repoRoot, 'apps/mission-control/dist');
    const mcDst = resolve(npmDir, 'mission-control');
    await rm(mcDst, { recursive: true, force: true });
    if (existsSync(mcSrc)) {
      await cp(mcSrc, mcDst, { recursive: true });
    } else {
      console.warn(
        '[tsup] apps/mission-control/dist not found — run `pnpm build` to include the dashboard.',
      );
    }

    const licenseDst = resolve(npmDir, 'LICENSE');
    await rm(licenseDst, { force: true });
    await cp(resolve(repoRoot, 'LICENSE'), licenseDst);
  },
});
