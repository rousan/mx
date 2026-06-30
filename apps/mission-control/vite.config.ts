import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Builds the mission-control UI into a SINGLE self-contained `dist/index.html`
 * (all JS and CSS inlined). The mx CLI copies that one file into the published
 * package and serves it from its zero-dependency `node:http` server, so nothing
 * here ships to the user as a runtime dependency.
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000,
  },
});
