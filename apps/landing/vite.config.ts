import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only plugin: serve the static deck (public/deck/index.html) for the clean
 * URLs `/deck` and `/deck/`.
 *
 * Vite's dev server applies SPA history-fallback to extensionless paths, so a
 * request to `/deck` (or even `/deck/`) would otherwise return the landing
 * page's index.html instead of the deck. This rewrites those two paths to the
 * deck's index.html before the fallback runs. Production is unaffected — GitHub
 * Pages serves `/deck/` directly and 301-redirects `/deck` to it.
 *
 * @returns A Vite plugin that only hooks the dev server.
 */
function serveDeck(): Plugin {
  return {
    name: 'serve-deck',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path === '/deck' || path === '/deck/') {
          req.url = '/deck/index.html';
        }
        next();
      });
    },
  };
}

/**
 * Vite config for the mx landing + docs site.
 *
 * Unlike the mission-control app (which inlines everything into a single
 * `index.html` so the CLI can embed it), this is a conventional multi-asset
 * static site. `vite build` emits `apps/landing/dist/` with hashed JS/CSS, and
 * GitHub Pages serves that folder at https://mx.rousanali.com (deployed on merge
 * to the default branch by .github/workflows/deploy-landing.yml). The demo deck
 * ships verbatim from `public/deck/` and is served at `/deck`.
 *
 * `base: '/'` because the site is served from the domain root (a custom domain),
 * not a project subpath.
 */
export default defineConfig({
  plugins: [serveDeck(), react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
  },
});
