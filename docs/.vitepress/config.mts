import { defineConfig } from 'vitepress';

/**
 * VitePress site config for the mx documentation, published at
 * https://mx.rousanali.com. The site is built directly from the repo's existing
 * `docs/*.md` files (this folder is the VitePress srcDir), so the docs and the
 * code stay in one place and can't drift.
 */
export default defineConfig({
  title: 'mx',
  description: 'Run several features in parallel across shared repos using git worktrees.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  // The published site is served at the domain root.
  base: '/',
  // Session summaries and the docs folder's own README are internal, not pages.
  srcExclude: ['sessions/**', 'README.md'],
  // The existing docs cross-link each other with relative paths and anchors;
  // don't fail the build on a stale anchor while the site is taking shape.
  ignoreDeadLinks: true,
  markdown: {
    // These are CLI docs full of `<name>` / `<repo>` placeholders in prose. With
    // raw-HTML passthrough on (the default), Vue's template compiler treats a
    // bare `<name>` as an unclosed tag and the build fails. Turning it off
    // escapes stray angle brackets as text; code spans, fenced blocks, and
    // VitePress containers (::: tip) are unaffected.
    html: false,
  },
  head: [
    ['meta', { name: 'theme-color', content: '#3c3c43' }],
    ['meta', { property: 'og:title', content: 'mx' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Run several features in parallel across shared repos using git worktrees.',
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Reference', link: '/commands' },
      { text: 'Changelog', link: '/history' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Overview', link: '/overview' },
          { text: 'Self-hosting', link: '/self-hosting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Commands', link: '/commands' },
          { text: 'Runtime model', link: '/runtime-model' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
      {
        text: 'Contributing',
        items: [
          { text: 'Development', link: '/development' },
          { text: 'Release', link: '/release' },
        ],
      },
      { text: 'Changelog', link: '/history' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/rousan/mx' }],
    editLink: {
      pattern: 'https://github.com/rousan/mx/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Rousan Ali',
    },
  },
});
