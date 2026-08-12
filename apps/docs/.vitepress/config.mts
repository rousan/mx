import { defineConfig } from 'vitepress';

/**
 * VitePress config for the mx **public user documentation** site, served at
 * https://mx.rousanali.com/docs.
 *
 * This is the outward-facing "how to use mx" site, distinct from the repo's
 * `docs/` folder (which is the internal contributor reference). The build output
 * (`apps/docs/.vitepress/dist`) is copied into the landing's GitHub Pages
 * artifact under `/docs` by `.github/workflows/deploy-landing.yml`, so the whole
 * site ships as one deploy: `/` landing, `/deck` demo deck, `/docs` these docs.
 *
 * `base: '/docs/'` because the site lives under the `/docs` path of the domain,
 * not at the root.
 */
export default defineConfig({
  title: 'mx docs',
  description:
    'Run several features in parallel across shared repos with git worktrees and coding agents — the mx user guide.',
  lang: 'en-US',
  base: '/docs/',
  cleanUrls: true,
  lastUpdated: true,
  // Content is still being built out; don't fail the build on a link to a page
  // that lands in a later content pass.
  ignoreDeadLinks: true,
  markdown: {
    // The docs are full of `<name>` / `<repo>` / `<feature>` placeholders in
    // prose. With raw-HTML passthrough on (the default), Vue's template compiler
    // treats a bare `<name>` as an unclosed tag and the build fails. Turning it
    // off escapes stray angle brackets as text; code spans, fenced blocks, and
    // VitePress containers (::: tip) are unaffected.
    html: false,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/docs/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#0d9488' }],
    ['meta', { property: 'og:title', content: 'mx docs' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Run several features in parallel across shared repos with git worktrees and coding agents.',
      },
    ],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'mx',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Tutorial', link: '/tutorial' },
      { text: 'Guides', link: '/guides/repos' },
      { text: 'Reference', link: '/reference/cli' },
      { text: 'mx.rousanali.com', link: 'https://mx.rousanali.com' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is mx?', link: '/' },
          { text: 'Why mx', link: '/why-mx' },
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Core concepts', link: '/concepts' },
        ],
      },
      {
        text: 'Tutorial',
        items: [{ text: 'Your first parallel features', link: '/tutorial' }],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Repos', link: '/guides/repos' },
          { text: 'Works & worktrees', link: '/guides/works-and-worktrees' },
          { text: 'Ports', link: '/guides/ports' },
          { text: 'Hooks & hydration', link: '/guides/hooks' },
          { text: 'Context registry', link: '/guides/context' },
          { text: 'Mission control', link: '/guides/mission-control' },
          { text: 'Menubar app', link: '/guides/menubar' },
          { text: 'Archive & resume', link: '/guides/lifecycle' },
          { text: 'Coding agents', link: '/guides/coding-agents' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI reference', link: '/reference/cli' },
          { text: 'Configuration', link: '/reference/configuration' },
          { text: 'FAQ', link: '/faq' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/rousan/mx' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/rousan/mx/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
    outline: [2, 3],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Rousan Ali',
    },
  },
});
