# Coding agents

mx was designed for the coding-agent era. A coding agent (Claude Code, Cursor, and friends) works in **one checkout at a time** — so to run several agents in parallel, you need several isolated checkouts. That's exactly what mx gives you: **one worktree, branch, ports, and agent session per feature**, all isolated, none stepping on each other.

## One agent per feature

Because each work is a fully isolated environment, you can run a separate agent session in each — a whole fleet making progress at once:

- `search-filters` — an agent working across `wt/web` + `wt/api`
- `dark-mode` — an agent in `wt/web`
- `flaky-tests` — an agent in `wt/api`

Each has its own branch and its own ports, so their dev servers and changes never collide.

## Open a work with its session

Each work is a **tmux session** named `mx/<work>`, with the agent already running in it. Enter a work with `attach` (this terminal) or `open` (a new window):

```bash
mx work -n search-filters attach
# open in a new terminal window instead:
mx work -n search-filters open
# or create-and-open in one step:
mx work new search-filters web api -o
```

Either way, mx builds the session if it doesn't exist yet — a `main` window with the **Claude Code session** on the left and `nvim` on the right, plus a `run` window of shells. The agent session is keyed to the work, so you always continue the **same** conversation:

- First time → mx creates it, seeded by the `session-prompt` hook (or `--prompt`).
- Re-attach → mx resumes the same session by its pinned id.

See **[The tmux workflow](/guides/tmux)** for the full model — the default layout, self-healing, and customizing it.

## Seed the agent with `session-prompt`

The `session-prompt` hook runs when mx **creates** a work's session (not on resume). Its stdout becomes the session's initial prompt — a great place to hand the agent the feature's context automatically:

```bash
#!/usr/bin/env bash
# <runtime>/hooks/session-prompt   (cwd = the work folder)
echo "You are working on the feature '$MX_WORK'."
echo "Read ../../context/INDEX.json for shared conventions before starting."
```

Override it for a single session with `mx work attach --prompt "…"` (or `open --prompt`).

## Shared memory across agents

Every agent, in every work, can read the runtime's **[context registry](/guides/context)** — a shared store of conventions, decisions, and runbooks. A convention set in one feature is available to every other feature's agent, instead of being trapped in one session's history.

## A workflow that works well

One common setup, feature by feature:

- **One tmux session per feature** (`mx work attach`) — the agent and `nvim` split in the `main` window, dev servers in the `run` window.
- **Switch features** by detaching (tmux prefix + `d`) and `attach`-ing another; each session keeps running in the background.
- Keep a terminal window per active feature if you like, and group them into **macOS Spaces** — then label the Spaces by stage with **[`mx divider`](/guides/mission-control#organizing-your-desktop-with-dividers)** (in progress, in review, shipped).
- On merge: write a **[session summary](/guides/lifecycle#session-summaries)**, then `mx work archive` (which also tears down the tmux session).

The workflow is flexible — this is just one shape that fits the tool well.

## Related

- **[The tmux workflow](/guides/tmux)** — the session, layout, and `attach`/`open`.
- **[Context registry](/guides/context)** — shared memory every agent reads.
- **[Hooks & hydration](/guides/hooks)** — the `session-prompt` and `work-session` hooks.
- **[Mission control](/guides/mission-control)** — dividers and the fleet view.
