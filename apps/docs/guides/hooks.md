# Hooks & hydration

A raw git worktree is an empty checkout — no `.env`, no installed dependencies, no seeded database. **Hooks** let mx make a fresh worktree ready to run automatically, and hook into other lifecycle moments too.

A hook is just an **executable** mx runs at a lifecycle moment. They all live in one place — `<runtime>/hooks/` — with **one file per event**, named exactly for the event. mx stamps a documented no-op for each on `mx init`; you edit them in place.

## Hydration: the `post-worktree-create` hook

The most useful hook. It fires right after a worktree is created, with the new worktree as the working directory — so it's where you copy env files, install deps, seed data, and allocate ports.

```bash
#!/usr/bin/env bash
# <runtime>/hooks/post-worktree-create
set -euo pipefail

# Hooks are runtime-wide, so branch on context via MX_* env vars.
case "$MX_REPO" in
  web|api)
    cp ~/secrets/"$MX_REPO".env .env   # config in place
    pnpm install                       # deps ready
    ;;
esac
```

Now every new worktree of `web` or `api` is ready to run the moment it exists.

## Branch on context

A hook fires for **every** repo and work, so you dispatch inside the script using `MX_*` environment variables — always `$MX_EVENT` and `$MX_RUNTIME`, plus event-specific ones like `$MX_WORK`, `$MX_REPO`, `$MX_BRANCH`, `$MX_BASE`, `$MX_WORKTREE_PATH`, `$MX_WORK_PATH`. Each shipped hook's header comment documents exactly which variables it receives.

Write them in **any language** — bash, Node, Python — just set the shebang and keep the file executable. Delete a hook file to disable that event.

## Every event

| Hook | Fires | Non-zero exit |
| --- | --- | --- |
| `pre-worktree-create` | before a worktree is created | **aborts** creation |
| `post-worktree-create` | after — the hydrate step | warning (worktree kept) |
| `pre/post-worktree-remove` | around worktree removal | pre aborts; post warns |
| `pre/post-work-archive` | around `mx work archive` | pre aborts; post warns |
| `pre/post-work-unarchive` | around `mx work unarchive` | pre aborts; post warns |
| `pre/post-repo-fetch` | around `mx repo fetch` | pre aborts; post warns |
| `repo-health` | during `mx repo health` | stdout captured into the health report |
| `work-health` | during `mx work health` | stdout captured into the health report |
| `session-prompt` | when `mx work open` creates a new agent session | stdout becomes the session's initial prompt |

`pre-*` hooks are veto points — a non-zero exit aborts the operation before anything is mutated. `post-*` hooks run after success; a non-zero exit is only a warning.

## Health hooks

`repo-health` and `work-health` augment `mx repo health` / `mx work health`. Follow the **silent-when-healthy** convention: print nothing (or a bare `ok`) when things are fine, print the problem when they're not.

```bash
#!/usr/bin/env bash
# <runtime>/hooks/work-health   (cwd = the work folder)
[ -f wt/web/.env ] || echo "web worktree is missing its .env"
```

## The `session-prompt` hook

When `mx work open` creates a new coding-agent session, this hook's stdout becomes the session's initial prompt — a great place to seed the agent with the feature's ticket, links, or task. See **[Coding agents](/guides/coding-agents)**.

## Related

- **[Coding agents](/guides/coding-agents)** — the `session-prompt` hook in context.
- **[Archive & resume](/guides/lifecycle)** — the archive/unarchive hooks.
