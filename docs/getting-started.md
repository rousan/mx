# Getting started

**mx** ("multiplexer") lets you work on several features in parallel across shared repositories. Each feature is a *work* with its own git worktrees, branches, and ports, so you switch between them instantly — no stashing, no branch-juggling.

## Requirements

- **Node ≥ 22** and **git** on your `PATH`.
- macOS for the optional window helpers (`mx work open -o`, `mx divider -o`); everything else is cross-platform.

## Install

```bash
npm install -g @rousan/mx      # provides the `mx` command
```

## Point mx at a runtime

mx keeps all its state in one folder — the **runtime**. It's resolved in this order: the `--runtime <path>` flag, then `$MX_RUNTIME`, then the default `~/mx`. Set it once:

```bash
export MX_RUNTIME="$HOME/mx"   # optional; ~/mx is the default
```

## Your first work

```bash
mx init                                   # scaffold the runtime
mx repo add git@github.com:you/app.git    # clone a repo into the runtime (once)
mx work new my-feature app                # create a work + an initial worktree of "app"
cd "$(mx work -n my-feature path)"/wt/app # jump into the worktree (on branch my-feature)
```

That's it — `wt/app` is a normal git worktree on its own branch. Do your work there, commit, push, open a PR. Start a second feature the same way and both stay fully isolated.

## The mental model

- **Runtime** — one folder (`$MX_RUNTIME`) holding pristine repo clones under `repos/<repo>/git`, and one folder per feature under `works/<feature>/`.
- **Work** — a feature. Its worktrees live in `works/<feature>/wt/<repo>`, each on its own branch, sharing the pristine clone's object store.
- **mx owns the state.** The per-work `work.json` manifest and the VS Code workspace are written *only* through `mx` commands. Treat them as read-only build output; every read command takes `--porcelain` for stable JSON.

See [Overview](/overview) for the full picture, [Runtime model](/runtime-model) for what's on disk, and [Commands](/commands) for the complete CLI reference.

## Handy next steps

```bash
mx info                                    # see repos, works, worktrees, ports
mx work -n my-feature port set app web     # allocate a free port (unique across all works)
mx work -n my-feature open                 # fullscreen Terminal + Claude session (macOS)
mx mission-control                         # live web dashboard of the whole runtime
```
