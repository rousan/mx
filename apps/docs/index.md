---
title: What is mx?
---

# What is mx?

**mx** ("multiplexer") runs several software features **in parallel** across shared repos, using git worktrees and coding agents. Each feature lives in its own isolated world — its own worktrees, branches, ports, and coding-agent session — so you switch between them instantly, and run a whole fleet of agents at once without anything colliding.

It's a single, open-source CLI:

```bash
npm i -g @rousan/mx
mx init
```

## At a glance

- **One runtime, many repos.** You clone each repo once into a single runtime folder. Those clones stay pristine and read-only.
- **A work per feature.** Each feature is a *work*: it groups a lightweight **worktree** per repo it touches, each on its own branch, sharing the pristine clone's git objects — no duplicated repos on disk.
- **Ports that never clash.** mx allocates each feature its own ports, unique across the whole runtime, so the same app runs many times side by side.
- **Ready-to-run worktrees.** Lifecycle hooks hydrate a fresh worktree the moment it's created — copy the `.env`, install deps, seed the database.
- **Shared context.** A runtime-wide registry of findings, conventions, and runbooks that every feature's agent reads from.
- **A recoverable lifecycle.** Archive a finished feature to free its ports and worktrees while keeping its branches and notes; unarchive to pick it right back up.

## Who it's for

Anyone juggling **more than one thing at a time** — a feature, an urgent bug, a review — especially when you want **coding agents** (Claude Code, Cursor, and friends) making progress on several of them in parallel. A coding agent works one checkout at a time, so a fleet of agents needs a fleet of isolated checkouts. That's exactly what mx manages for you.

## Start here

- **[Why mx](/why-mx)** — the problem this design solves, in depth.
- **[Getting started](/getting-started)** — install mx and create your first parallel feature in a couple of minutes.
- **[Core concepts](/concepts)** — the four words (runtime, repo, work, worktree) the whole tool is built on.
- **[Tutorial](/tutorial)** — a full end-to-end walkthrough: two features in parallel across two repos.

Prefer a visual tour first? Watch the **[demo deck](https://mx.rousanali.com/deck)**.
