import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config for the mxbar popover frontend.
 *
 * Tauri loads this at a fixed dev port and bundles `dist/` for release, so the
 * port is pinned and `clearScreen` is disabled to keep Tauri's own logs visible.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
