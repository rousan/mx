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
| `session-prompt` | when `mx work attach` / `open` **creates** a work's agent session | stdout becomes the session's initial prompt |
| `work-session` | after mx builds a work's tmux session | warning (session kept) |

`pre-*` hooks are veto points — a non-zero exit aborts the operation before anything is mutated. `post-*` hooks run after success; a non-zero exit is only a warning.

## Health hooks

`repo-health` and `work-health` augment `mx repo health` / `mx work health`. Follow the **silent-when-healthy** convention: print nothing (or a bare `ok`) when things are fine, print the problem when they're not.

```bash
#!/usr/bin/env bash
# <runtime>/hooks/work-health   (cwd = the work folder)
[ -f wt/web/.env ] || echo "web worktree is missing its .env"
```

## The `session-prompt` hook

When `mx work attach` (or `open`) **creates** a work's coding-agent session, this hook's stdout becomes the session's initial prompt — a great place to seed the agent with the feature's ticket, links, or task. It fires only on **create**, never on resume, and `--prompt <text>` overrides it. See **[Coding agents](/guides/coding-agents)**.

## The `work-session` hook

mx builds every work a tmux session with a default layout — a `main` window (Claude + `nvim`) and a `run` window of shells. The `work-session` hook fires **after** mx has built that session, with the work folder as the working directory, so you can reshape the layout: add a window per repo worktree, start a dev server, swap the editor, rename panes.

Its environment adds two variables on top of the usual `MX_WORK` / `MX_WORK_PATH`:

- **`MX_TMUX_SESSION`** — the tmux session name (`mx/<work>`), i.e. your tmux target.
- **`MX_CLAUDE_SESSION_ID`** — the resumed session id (empty on a fresh create).

It's post-style — a non-zero exit only warns, and the session is kept. Delete the file to keep mx's default layout.

```bash
#!/usr/bin/env bash
# <runtime>/hooks/work-session   (cwd = the work folder)
set -euo pipefail

# Add one dedicated window per worktree under wt/.
for dir in wt/*/; do
  name="$(basename "$dir")"
  tmux new-window -t "$MX_TMUX_SESSION" -n "$name" -c "$MX_WORK_PATH/$dir"
done
```

::: tip session-prompt vs work-session
`session-prompt` seeds the **first** agent prompt (create-only). `work-session` shapes the tmux **layout** every time the session is built. See **[The tmux workflow](/guides/tmux)**.
:::

## Related

- **[The tmux workflow](/guides/tmux)** — where the `work-session` hook fits.
- **[Coding agents](/guides/coding-agents)** — the `session-prompt` hook in context.
- **[Archive & resume](/guides/lifecycle)** — the archive/unarchive hooks.
