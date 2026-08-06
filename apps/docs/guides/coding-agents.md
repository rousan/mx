# Coding agents

mx was designed for the coding-agent era. A coding agent (Claude Code, Cursor, and friends) works in **one checkout at a time** — so to run several agents in parallel, you need several isolated checkouts. That's exactly what mx gives you: **one worktree, branch, ports, and agent session per feature**, all isolated, none stepping on each other.

## One agent per feature

Because each work is a fully isolated environment, you can run a separate agent session in each — a whole fleet making progress at once:

- `search-filters` — an agent working across `wt/web` + `wt/api`
- `dark-mode` — an agent in `wt/web`
- `flaky-tests` — an agent in `wt/api`

Each has its own branch and its own ports, so their dev servers and changes never collide.

## Open a work with its session

On macOS, `mx work open` (alias `-o`) opens a fullscreen Terminal in the work folder and **resumes or creates** that work's coding-agent session:

```bash
mx work -n search-filters open
# or create-and-open in one step:
mx work new search-filters web api -o
```

- No existing session → mx creates one, seeded by the `session-prompt` hook (or `--prompt`).
- One existing session → mx resumes it.

## Seed the agent with `session-prompt`

The `session-prompt` hook runs when `mx work open` **creates** a new session (not on resume). Its stdout becomes the session's initial prompt — a great place to hand the agent the feature's context automatically:

```bash
#!/usr/bin/env bash
# <runtime>/hooks/session-prompt   (cwd = the work folder)
echo "You are working on the feature '$MX_WORK'."
echo "Read ../../context/INDEX.json for shared conventions before starting."
```

Override it for a single open with `mx work open --prompt "…"`.

## Shared memory across agents

Every agent, in every work, can read the runtime's **[context registry](/guides/context)** — a shared store of conventions, decisions, and runbooks. A convention set in one feature is available to every other feature's agent, instead of being trapped in one session's history.

## A workflow that works well

One common setup, feature by feature:

- **One fullscreen macOS Space per feature** — terminal and editor split side by side.
- The **coding agent in the terminal**; dev server and git in another tab.
- **Three-finger swipe** between features; macOS Mission Control for the whole board.
- Group Spaces by stage with **[`mx divider`](/guides/mission-control#organizing-your-desktop-with-dividers)** — in progress, in review, shipped.
- On merge: write a **[session summary](/guides/lifecycle#session-summaries)**, then `mx work archive`.

The workflow is flexible — this is just one shape that fits the tool well.

## Related

- **[Context registry](/guides/context)** — shared memory every agent reads.
- **[Hooks & hydration](/guides/hooks)** — the `session-prompt` hook.
- **[Mission control](/guides/mission-control)** — dividers and the fleet view.
