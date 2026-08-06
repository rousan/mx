# Mission control

When you're running a fleet of features, you want one place to see them all — what's in progress, what ports are in use, what's healthy. mx gives you two complementary views: a **live web dashboard** and a set of terminal **dividers** for organizing macOS Spaces.

## The live dashboard

```bash
mx mission-control      # alias: mx mc
```

This starts a local, **read-only** web dashboard — a calm, monochrome view of:

- every repo's and work's **health**,
- a consolidated **ports board**: each port mapped to its service → worktree → work, with a clickable `localhost` URL.

It updates live over SSE. Options:

```bash
mx mc --port 8080       # choose the port (default 7777)
mx mc -o                # open the browser automatically
```

It's long-running — press `Ctrl-C` to stop. Because it's read-only, it never changes runtime state.

## Health, without the dashboard

The same health data is available on the command line:

```bash
mx health               # whole runtime: every repo + every active work
mx health --all         # include archived works
mx repo health          # just repos
mx work health          # just works
```

Health checks are purely local — they audit branches, uncommitted changes, worktree presence vs the manifest, cross-work port collisions, and archive invariants, plus whatever your `repo-health` / `work-health` hooks report. They never touch the network.

## Organizing your desktop with dividers

If you keep one macOS Space per feature (a common way to work — see [Coding agents](/guides/coding-agents)), the Spaces can blur together. `mx divider` fills a terminal with big block-letter text to act as a visual separator between groups of Spaces:

```bash
mx divider "IN REVIEW"       # take over the current terminal with the banner
mx divider "IN REVIEW" -o    # open a new fullscreen Terminal running it (macOS)
```

Drop a labeled divider Space between clusters of feature Spaces — `IN PROGRESS`, `IN REVIEW`, `PR REVIEW` — so a three-finger swipe through Mission Control always tells you what stage each feature is at. It touches no runtime state; it's purely a visual aid.

## Related

- **[Ports](/guides/ports)** — where the ports on the board come from.
- **[Coding agents](/guides/coding-agents)** — the one-Space-per-feature workflow.
