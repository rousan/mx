import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config for the mx landing + docs site.
 *
 * Unlike the mission-control app (which inlines everything into a single
 * `index.html` so the CLI can embed it), this is a conventional multi-asset
 * static site. `vite build` emits `apps/landing/dist/` with hashed JS/CSS, and
 * GitHub Pages serves that folder at https://mx.rousanali.com (deployed on merge
 * to the default branch by .github/workflows/deploy-landing.yml).
 *
 * `base: '/'` because the site is served from the domain root (a custom domain),
 * not a project subpath.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
  },
});
