#!/usr/bin/env bash
#
# mx per-repo health hook.
#
# `mx repo -n <repo> health` first runs mx's built-in structured checks (current
# vs default branch, uncommitted/untracked, ahead/behind origin, last fetched)
# and then runs this script, capturing its stdout as an extra section. Use it
# for repo-specific checks mx can't know about — e.g. node_modules present, a
# dev DB reachable, a required tool installed.
#
# Runs with the repo's git clone as the working directory. Context via env:
#   MX_REPO       repo name
#   MX_REPO_PATH  repo container (repos/<repo>)
#   MX_GIT_DIR    the git clone (repos/<repo>/git)
#   MX_RUNTIME    runtime root
#
# Whatever you echo appears under the health report. No output by default.
set -euo pipefail

# Example:
#   [ -d node_modules ] && echo "node_modules: present" || echo "node_modules: MISSING"

exit 0
