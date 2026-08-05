# Why mx

You're never working on just one thing. A feature is in flight, an urgent bug lands, a review comes back — and each one wants a different branch, a different set of running services, and a different mental context.

With a single working copy of each repo, only one of those can be active at a time. Switching between them means the **same tax, over and over**:

- `git stash` whatever you had in progress
- check out the other branch (and create it if it's new)
- reinstall dependencies that drifted between branches
- restart dev servers — and fight "port already in use" when two apps want `:3000`
- rebuild the context in your head of where you were

And there's a newer constraint: **a coding agent can only work one checkout at a time.** If you want several agents making progress in parallel, a single working copy makes that impossible.

## "Can't I just use a tab per feature, or subagents?"

You can reach for `git worktree` by hand, or open a terminal tab per feature, or run several subagents in one session. It works — for about a day. Then the cracks show:

- **Ports.** Two dev servers, one port number. You start hand-assigning ports and tracking them in your head.
- **Hydration.** A raw `git worktree` is an empty directory — no `.env`, no `node_modules`, no seeded database. You set it up by hand, every single time.
- **Multiple repos.** A single feature often spans two or three repos (say a frontend and a backend). A plain session lives in one checkout, so the other repos are out of reach.

On top of that: no lifecycle to archive and later recover a feature, no memory shared between features, and a growing pile of tabs, folders, and branches you track by hand.

## What mx does

**mx is a manager for parallel features.** It's built on the primitives you already have — git worktrees and coding agents — and adds the management layer around them:

- **Works.** One command creates a *work* for a feature: its worktrees (one per repo it touches), branches, and editor workspace.
- **Allocated ports.** Every service gets a port that's unique across the whole runtime, so the same app can run many times at once.
- **Hydrate hooks.** A fresh worktree is made ready to run automatically — copy env, install deps, seed data — via a lifecycle hook you control.
- **Context registry.** A runtime-wide store of findings, conventions, and runbooks that every feature's agent reads from.
- **Lifecycle.** Archive a finished feature to free its ports and worktrees while keeping the branches and notes; unarchive to pick it right back up.
- **Mission control.** A live, read-only dashboard of every work, its ports, and its health — the whole fleet at a glance.

The result: instead of one feature at a time, you run **a fleet of features in parallel**, each fully isolated, each with its own agent — and switching between them is instant.

<div class="tip custom-block" style="padding-top: 8px">

Ready to try it? Head to **[Getting started](/getting-started)**.

</div>
