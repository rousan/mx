# Repos

A **repo** is a git repository you've added to the runtime. mx clones it **once** into `repos/<repo>/git` as a pristine, read-only reference. Every feature's worktree forks from that single clone, so many features stay isolated while sharing one copy of the repository's history on disk.

::: warning Never work in the clone
You never edit, commit, or run dev servers inside `repos/<repo>/git`. It exists only as the reference that worktrees fork from. All your work happens in worktrees under `works/<feature>/wt/<repo>`.
:::

## Add a repo

```bash
mx repo add git@github.com:acme/web.git
```

This is the only command that clones. By default the repo's name is derived from the URL; override it with `--name`:

```bash
mx repo add git@github.com:acme/web.git --name frontend
```

## Create a fresh local repo

For a throwaway or experimental project you don't want on a remote yet, `mx repo new` creates a brand-new local repo (git init on `main` + a starter README + an initial commit):

```bash
mx repo new playground
```

Add `--quick` (and `-o`) to also create a `dev-playground` work with a worktree on `develop` and open it — a one-shot quick start:

```bash
mx repo new playground --quick -o
```

## List repos

```bash
mx repo ls
```

## Fetch updates

Repo clones are read-only reference, but you'll want them current before forking a new feature branch from the latest upstream:

```bash
mx repo -n web fetch      # fast-forwards the checked-out and base branches
mx repo fetch --all       # every repo
```

::: tip
Health checks and worktree creation are purely local — they don't fetch. Run `mx repo fetch` first when you want a new feature to fork from the newest upstream commit.
:::

## Check repo health

```bash
mx repo health            # every repo
mx repo -n web health     # one repo
```

Each repo's block shows only the metrics that matter — current branch vs default, uncommitted/untracked changes, ahead/behind its upstream, and when it was last fetched — plus any output from your `repo-health` hook. It's all local; it never reaches out to the network.

## Remove a repo

```bash
mx repo -n web rm
```

This refuses if any work still has a worktree of the repo — tear those works down first.

## Related

- **[Works & worktrees](/guides/works-and-worktrees)** — turn a repo into a per-feature checkout.
- **[Hooks & hydration](/guides/hooks)** — the `repo-fetch` and `repo-health` hooks.
