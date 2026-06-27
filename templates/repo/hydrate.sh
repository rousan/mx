#!/usr/bin/env bash
#
# mx per-worktree hydrate hook for this repo.
#
# Runs automatically after `mx work -n <work> worktree add <this repo>` creates
# a worktree (skip with --no-hydrate; re-run with `mx work -n <work> worktree
# hydrate <this repo>`). Customize it to make a fresh worktree runnable: copy a
# .env, allocate a port and write it into the worktree, install deps, etc.
#
# mx runs this with the new worktree as the working directory and passes context
# both as positional args and environment variables:
#
#   $1 / $MX_WORKTREE_PATH   absolute path to the new worktree
#   $2 / $MX_BRANCH          branch the worktree is on
#   $MX_WORK                 work name
#   $MX_REPO                 repo name
#   $MX_BASE                 base ref it was forked from (may be empty)
#   $MX_WORK_PATH            absolute path to the work folder
#   $MX_RUNTIME              runtime root
#
# Ports stay mx-owned — allocate via mx, then wire the result in yourself, e.g.:
#   port=$(mx work -n "$MX_WORK" port set "$MX_REPO" web --porcelain | jq -r .port)
#   echo "PORT=$port" >> "$MX_WORKTREE_PATH/.env"
#
# A non-zero exit is reported as a warning and the worktree is kept.
set -euo pipefail

echo "Hydrate is done"
