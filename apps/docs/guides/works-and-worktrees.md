# Works & worktrees

A **work** is one feature. A **worktree** is a git worktree inside that work — a real checkout of a repo on a feature branch, living at `works/<feature>/wt/<name>`, where you and your coding agent actually write code.

A work can hold **worktrees of several repos** (a feature spanning a frontend and a backend), and even **several worktrees of the same repo** (two branches of one repo side by side).

::: warning mx owns the state
mx is the single owner of the work manifest (`work.json`) and the editor workspace. You never hand-edit those files, and you never run raw `git worktree` — always go through `mx` commands, so the manifest can't drift from what's on disk.
:::

## Create a work

The simplest form creates the work and its first worktree at once:

```bash
mx work new search-filters web
```

List repos to add a worktree per repo the feature touches:

```bash
mx work new search-filters web api
```

Per repo you can pin the branch and where it forks from with `<repo>:<branch>:<base>`:

```bash
mx work new search-filters web:search-filters:main api:search-filters:develop
```

- **branch** defaults to `--branch`, then the work name.
- **base** (where to fork from) defaults to `--base`, then the clone's current `HEAD`. A bare branch name resolves to that local branch or `origin/<name>`.

Add `-o` / `--open` to open the work immediately (see [Coding agents](/guides/coding-agents)).

## Add a worktree to an existing work

If a feature grows to touch another repo:

```bash
mx work -n search-filters worktree add api
```

Give a distinct name to hold a **second worktree of the same repo**:

```bash
mx work -n search-filters worktree add web web-hotfix --branch hotfix
```

The name (`web-hotfix` here) is the `wt/<name>` directory and the selector you'll use later. It defaults to the repo name.

::: tip Creating a worktree runs a hook
The moment a worktree is created, mx fires the `post-worktree-create` hook so it can be hydrated (copy `.env`, install deps, seed data). See **[Hooks & hydration](/guides/hooks)**.
:::

## List worktrees

```bash
mx work -n search-filters worktree ls
mx work -n search-filters info --porcelain   # full manifest as JSON
```

## Switch a worktree to another branch

mx never runs `git checkout` for you. Switch branches the normal way inside the worktree, then tell mx so the manifest stays truthful:

```bash
cd "$(mx work -n search-filters path)/wt/web"
git checkout other-branch
mx work -n search-filters worktree set-branch web        # re-records the live branch
```

Pass an optional branch name as a guard — it must match what the worktree is actually on, else mx errors (`BRANCH_MISMATCH`).

## Remove a worktree

```bash
mx work -n search-filters worktree rm web-hotfix
```

Refuses if the worktree has uncommitted changes.

## Tear down a work

When a feature is fully merged and you want it gone:

```bash
mx work -n search-filters destroy
```

This removes the worktrees and the work folder but **keeps the branches**. It refuses if any worktree has uncommitted changes. To pause a feature instead of destroying it, use **[archive](/guides/lifecycle)**.

## Related

- **[Ports](/guides/ports)** — give each worktree's services a port.
- **[Archive & resume](/guides/lifecycle)** — park a work and bring it back.
- **[Core concepts](/concepts)** — the runtime / repo / work / worktree model.
