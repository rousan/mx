---
layout: home

hero:
  name: mx
  text: Parallel features, one runtime
  tagline: Run several features at once — each in its own git worktree, branch, ports, and coding-agent session. Switch instantly; nothing collides.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Why mx
      link: /why-mx
    - theme: alt
      text: ← Back to mx.rousanali.com
      link: https://mx.rousanali.com

features:
  - title: One runtime, many repos
    details: Clone each repo once into a single runtime; fork lightweight worktrees per feature that share the pristine clone's git object store — no duplicated repos on disk.
  - title: A work per feature
    details: Each feature is a "work" with its own worktrees, branches, and per-service ports. Switching between features is a swipe, not a 20-minute stash-and-reinstall reset.
  - title: Ports that never clash
    details: mx allocates each feature its own ports, unique across the whole runtime — so you can run the same app many times, side by side, one per feature.
  - title: Ready-to-run worktrees
    details: Lifecycle hooks hydrate a fresh worktree the moment it's created — copy the .env, install deps, seed the database — in any language you like.
  - title: Shared context registry
    details: A runtime-wide memory of findings, conventions, and runbooks that every feature's coding agent reads from, so a hard-won discovery isn't re-learned next time.
  - title: Built for coding agents
    details: One agent per worktree means a whole fleet of Claude Code / Cursor sessions working in parallel — each isolated, none stepping on another.
---

<div style="max-width: 960px; margin: 3rem auto 0; padding: 0 1.5rem;">

## New here?

Start with **[Why mx](/why-mx)** for the problem it solves, then **[Getting started](/getting-started)** to install it and create your first parallel feature in a couple of minutes. **[Core concepts](/concepts)** explains the four words — runtime, repo, work, worktree — that the whole tool is built on.

Prefer a visual tour? Watch the **[demo deck](https://mx.rousanali.com/deck)**.

```bash
npm i -g @rousan/mx
mx init
```

</div>
