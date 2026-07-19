---
layout: home

hero:
  name: mx
  text: Parallel work across shared repos
  tagline: Run several features at once with isolated git worktrees, branches, and ports — switch instantly, no stashing or branch-juggling.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Why mx
      link: /overview
    - theme: alt
      text: GitHub
      link: https://github.com/rousan/mx

features:
  - title: Isolated per-feature environments
    details: Each feature is a "work" with its own git worktrees, feature branches, and per-service ports. Nothing collides; switching is instant.
  - title: mx owns the state
    details: The work manifest and VS Code workspace are managed only through mx commands. Read stable JSON with --porcelain; never hand-edit runtime files.
  - title: One runtime, many repos
    details: Clone repos once into a single runtime; fork lightweight worktrees per feature that share the pristine clone's object store.
  - title: Lifecycle hooks
    details: A central hook hub fires on worktree create/remove, archive/unarchive, and fetch — hydrate deps, copy env files, allocate ports, in any language.
  - title: Great for parallel AI coding sessions
    details: Open a work in a fullscreen Terminal that resumes or creates its Claude Code session, seeded by a dynamic session-prompt hook.
  - title: Live mission control
    details: A local, read-only web dashboard streams repo/work health and a consolidated ports board over SSE.
---
