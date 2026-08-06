# FAQ

## How is this different from just using `git worktree`?

git worktree is the primitive mx is built on. mx is the **manager** around it: it creates and tracks worktrees for you, allocates non-clashing ports, hydrates fresh worktrees via hooks, groups multi-repo features into one work, gives every feature a recoverable lifecycle, and shows the whole fleet in one dashboard. You get the isolation of worktrees without hand-managing tabs, ports, branches, and setup.

## Do I need to use coding agents to get value from mx?

No. mx is useful for any parallel work — it just happens to be *especially* good for coding agents, because each agent needs its own isolated checkout. If you never run an agent, you still get isolated per-feature environments, non-clashing ports, and instant switching.

## Does mx work with agents other than Claude Code?

Yes. mx manages worktrees, ports, and lifecycle — it doesn't care which agent (or editor) you run inside a worktree. Claude Code, Cursor, and others all work. The one agent-specific convenience (`mx work open` resuming a named session) is currently oriented around Claude Code sessions; everything else is agent-agnostic.

## Can one feature span multiple repositories?

Yes — that's a core design point. A **work** can hold a worktree of several repos, so a single feature (and a single agent session) spans, say, a frontend and a backend. See [Works & worktrees](/guides/works-and-worktrees).

## Can I run the same app for several features at once?

Yes. mx allocates each feature its own ports, unique across the whole runtime, so the same app runs concurrently for multiple features without "address already in use." See [Ports](/guides/ports).

## Does mx duplicate my repo on disk for every feature?

No. Each repo is cloned **once**. Every worktree shares that single clone's git object store, so you get full isolation between features without duplicated repositories.

## What happens to my branches when I archive or tear down a feature?

Branches are always kept. **Archive** frees the worktrees and ports but keeps the branches and session notes (recoverable via `unarchive`). Even **destroy** keeps the branches. See [Archive & resume](/guides/lifecycle).

## Is it safe to edit `work.json` by hand?

No — mx owns the manifest. Treat `work.json` and the editor workspace file as read-only build output: read them for orientation (with `--porcelain` for stable JSON), but change them only through `mx` commands, so they can't drift from what's actually on disk.

## Where does the runtime live, and can I have more than one?

By default `~/mx`, overridable with `$MX_RUNTIME` or `--runtime`. You can keep several runtimes and switch by changing the environment variable. See [Configuration](/reference/configuration).

## How do I upgrade mx?

Run `mx update` — it bumps the CLI within its major and re-syncs the runtime. If a new major exists it points you at the deliberate upgrade, and `mx migrate` brings an older runtime up to the new version. See [Configuration](/reference/configuration#sync-vs-update-vs-migrate).

## Is mx open source?

Yes — MIT licensed, on [GitHub](https://github.com/rousan/mx), published to npm as `@rousan/mx`.

## Still stuck?

Open an issue on [GitHub](https://github.com/rousan/mx/issues), or start with the [Getting started](/getting-started) guide and the [demo deck](https://mx.rousanali.com/deck).
