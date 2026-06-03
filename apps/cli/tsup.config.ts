import { defineConfig } from 'tsup';

/**
 * Bundles the CLI entrypoint into a single, dependency-free ESM file at
 * dist/bin/mx.js with an executable shebang.
 *
 * `@mx/core` is bundled in from source (noExternal) so the produced file runs
 * from anywhere without a node_modules tree beside it; only Node builtins stay
 * external.
 */
export default defineConfig({
  entry: { 'bin/mx': 'src/bin/mx.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@mx/core'],
  clean: true,
  outDir: 'dist',
});
