# Core concepts

The whole of mx is built on **four words**. Learn these and the rest of the tool follows.

## The four words

| Word | What it is |
| --- | --- |
| **Runtime** | One folder that holds everything — repos, works, shared context, config. |
| **Repo** | A pristine, read-only clone of a git repository, cloned once into the runtime. |
| **Work** | One feature. Groups a worktree per repo it touches, plus its branches and ports. |
| **Worktree** | A git worktree you actually code in — one checkout of a repo on a feature branch. |

Put together: a **runtime** holds your **repos**; each feature is a **work**; and inside a work, each repo you touch gets a **worktree** on its own branch.

## The runtime

A runtime is a single directory (default: `~/mx`). Everything mx manages lives inside it:

```
mx/
├── repos/<repo>/git       # pristine clones — read-only reference
├── works/<feature>/       # one folder per feature
│   ├── wt/<repo>          # the worktrees you code in
│   ├── work.json          # the manifest (owned by mx)
│   └── sessions/          # session summaries
├── context/               # shared memory across every feature
├── hooks/                 # lifecycle hook hub
├── bin/                   # runtime-wide CLI helpers
└── files/                 # shared operational values
```

mx finds the runtime in this order: the `--runtime <path>` flag, then the `$MX_RUNTIME` environment variable, then the default `~/mx`. You can keep several runtimes on one machine and switch between them by setting `$MX_RUNTIME`.

## Repos

A repo is added **once** with `mx repo add <git-url>` and cloned into `repos/<repo>/git`. That clone is **pristine and read-only** — you never edit, commit, or run dev servers in it. It exists only as the reference that worktrees fork from.

Because all worktrees of a repo share that single clone's git object store, you get full isolation between features with **no duplicated repositories on disk**.

## Works

A work is one feature. `mx work new <name>` creates a work folder, an empty manifest, and the standard sub-folders. Adding repos to the work (up front, or later with `mx work worktree add`) creates a worktree per repo.

A work can hold **worktrees of several repos** — that's how a single feature spanning a frontend and a backend is handled by one agent session. It can even hold **multiple worktrees of the same repo** (by giving them distinct names) when you need two branches of one repo side by side.

Each work owns its **ports**: `mx work port set` hands out a port that's unique across the entire runtime, so two features running the same app never collide.

Each active work also maps to exactly **one tmux session**, named `mx/<work>` — your coding agent, editor, and dev-server shells all live inside it. `mx work attach` builds that session and drops you in; archiving or destroying the work tears it down. See **[The tmux workflow](/guides/tmux)**.

## Worktrees

A worktree is a git worktree — a real checkout of a repo on a feature branch, living at `works/<feature>/wt/<repo>`. This is where you (and your coding agent) actually write code. Many worktrees can be checked out at once, in separate folders, all sharing one clone's history.

mx creates and tracks worktrees for you (`mx work new`, `mx work worktree add`) — you never run raw `git worktree` yourself.

## The one rule that governs everything

**mx owns all runtime state.** The work manifest (`work.json`) and the editor workspace file are managed *only* through `mx` commands — you never hand-edit them, and you never create or remove worktrees with raw `git`. Treat `work.json` as read-only build output: read it for orientation (every read command takes `--porcelain` for stable JSON), but change it through `mx`.

This is what keeps the manifest from ever drifting out of sync with what's actually on disk — and it's why a fleet of parallel features stays organized instead of turning into a pile of tabs and branches you track by hand.

## Where to go next

- **[Getting started](/getting-started)** — install mx and create your first work.
- **[Tutorial](/tutorial)** — run two features in parallel, end to end.
- **Guides** — [works & worktrees](/guides/works-and-worktrees), the [tmux workflow](/guides/tmux), [ports](/guides/ports), [hooks & hydration](/guides/hooks), the [context registry](/guides/context), [mission control](/guides/mission-control), and the [archive/resume lifecycle](/guides/lifecycle).
