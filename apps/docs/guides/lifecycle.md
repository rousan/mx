# Archive & resume

Not every feature is active all the time. Some are waiting on review, some are parked for later, some are done. mx gives a feature a **lifecycle**: keep it active, **archive** it to reclaim resources while keeping everything recoverable, then **unarchive** it to pick up exactly where you left off.

## The three states

```
  Active  ──  mx work archive  ──▸  Archived  ──  mx work unarchive  ──▸  Back to work
```

- **Active** — worktrees, ports, and (optionally) an agent session, plus session notes as you go.
- **Archived** — worktrees and ports are **freed**, but the branches and session summaries are **kept**. Recoverable at any time.
- **Back to work** — worktrees are re-created from the manifest; continue where you left off.

## Archive a feature

```bash
mx work -n dark-mode archive
```

This removes the worktrees and frees the ports, but keeps the work folder, its manifest, its branches, and its session summaries. It refuses if any worktree has uncommitted changes. It prompts for confirmation — pass `--yes` / `-y` to skip (required for scripts and `--porcelain`).

::: tip Don't archive the work you're sitting in
Archiving deletes the worktree directory, so if your shell is inside it you'll end up in a deleted path. `cd` out first.
:::

## Resume a feature

```bash
mx work -n dark-mode unarchive
```

The worktrees are re-created from `work.json`. If a recorded branch has since been deleted, supply a replacement per worktree:

```bash
mx work -n dark-mode unarchive web=dark-mode-v2
```

## Session summaries

Every work has a `sessions/` folder that accumulates one markdown file per working session — a distilled record of what you did, what you learned, what's in flight, and what to pick up next. They're written **when you ask** at the end of a session (never automatically), so that you — or a fresh coding agent — can resume the work cold, with full context, even after archiving.

Because archiving keeps `sessions/`, a parked feature carries its whole history with it. When you unarchive months later, the notes are right there.

## Archive vs destroy

- **Archive** — reversible. Frees resources, keeps everything, brings it all back with `unarchive`.
- **Destroy** — permanent. `mx work -n <name> destroy` removes the work folder (including session summaries), though it still keeps the branches. Use it only when a feature is fully merged and you want it gone.

## Related

- **[Works & worktrees](/guides/works-and-worktrees)** — creating and tearing down works.
- **[Hooks & hydration](/guides/hooks)** — the archive/unarchive hooks.
