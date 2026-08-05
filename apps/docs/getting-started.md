# Getting started

This guide takes you from zero to a running parallel feature in a few minutes. You'll install mx, create a runtime, add a repo, and spin up your first *work*.

## Prerequisites

- **Node.js 18+** and **git**.
- A repo (or two) you want to work on. mx works with any git repo — local or remote.

## Install

mx ships as a single global CLI on npm:

```bash
npm i -g @rousan/mx
```

This gives you the `mx` command. Check it:

```bash
mx version
```

## Create a runtime

A **runtime** is one folder that holds everything — your cloned repos, your per-feature works, shared context, and configuration. Create one with `mx init`:

```bash
mx init
```

By default the runtime lives at `~/mx`. You can point mx elsewhere with the `$MX_RUNTIME` environment variable or the `--runtime` flag; see [Core concepts](/concepts#the-runtime) for details.

## Add a repo

Repos are cloned **once** into the runtime as read-only reference clones. Add one:

```bash
mx repo add git@github.com:your-org/your-app.git
```

You can add as many as you like — a single feature can span several of them. List what's there:

```bash
mx repo ls
```

::: tip
mx never lets you edit the pristine clone directly. All your work happens in *worktrees* forked from it — that's what keeps many features isolated while sharing one clone on disk.
:::

## Create your first work

A **work** is one feature. Create a work and its initial worktree in a single command:

```bash
mx work new add-search your-app
```

This creates:

- a work folder for `add-search`,
- a git **worktree** of `your-app` on a new branch (`add-search` by default), forked from the pristine clone,
- an editor workspace file you can open directly.

Want the feature to span multiple repos? List them all:

```bash
mx work new add-search web api
```

Each repo gets its own worktree under the one work, so a single agent session can edit across all of them.

## Allocate a port

If your app runs a dev server, give it a port that's guaranteed unique across every work in the runtime:

```bash
mx work -n add-search port set your-app web
```

mx records the port; you then wire it into the repo's own config (`.env`, `PORT=`, etc.). Because every feature gets its own port, you can run the same app for several features at the same time without clashes.

## See everything

Get a full picture of the work — its repos, branches, and ports:

```bash
mx work -n add-search info --porcelain
```

Or launch the live dashboard for the whole runtime:

```bash
mx mission-control      # alias: mx mc
```

## Pause and resume

Done with a feature for now? **Archive** it to free its ports and worktrees while keeping the branches and any notes:

```bash
mx work -n add-search archive
```

When you're ready to pick it back up:

```bash
mx work -n add-search unarchive
```

## Next steps

- **[Core concepts](/concepts)** — the four words (runtime, repo, work, worktree) the whole tool is built on, and the one rule that governs everything.
- **[Why mx](/why-mx)** — the problems this design solves.

More in-depth guides — hooks and hydration, the context registry, multi-repo features, running mx alongside coding agents — are on the way.
