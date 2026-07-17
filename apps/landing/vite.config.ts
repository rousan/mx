import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config for the mx landing + docs site.
 *
 * Unlike the mission-control app (which inlines everything into a single
 * `index.html` so the CLI can embed it), this is a conventional multi-asset
 * static site. `vite build` emits `apps/landing/dist/` with hashed JS/CSS, and
 * Cloudflare Pages serves that folder at https://mx.rousanali.com (production on
 * merge to the default branch, preview per pull request).
 *
 * `base: '/'` because the site is served from the domain root.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
  },
});
