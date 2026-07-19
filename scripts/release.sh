#!/usr/bin/env bash
#
# Local release driver for the @rousan/mx npm package.
#
# Reads the target version from npm/package.json (you bump + commit it before
# running this), runs the full check/build pipeline, publishes to npm using
# your already-authenticated session, and tags + pushes.
#
# Usage:
#   npm login          # one-time, on this machine
#   $EDITOR npm/package.json   # bump "version"
#   git commit -am "release vX.Y.Z"
#   pnpm release
#
set -euo pipefail

cd "$(dirname "$0")/.."

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
die()   { red "✗ $*" >&2; exit 1; }
step()  { echo; cyan "→ $*"; }
ok()    { green "✓ $*"; }

# --- preflight ---------------------------------------------------------------

step "Checking npm authentication"
if ! whoami=$(npm whoami 2>/dev/null); then
  die "Not logged in to npm. Run 'npm login' first."
fi
ok "Logged in as $whoami"

step "Checking git state"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "Working tree not clean — commit or stash before releasing."
fi
ok "Working tree clean"

name=$(node -p "require('./npm/package.json').name")
version=$(node -p "require('./npm/package.json').version")
tag="v$version"

if git rev-parse --verify "refs/tags/$tag" >/dev/null 2>&1; then
  die "Tag $tag already exists locally."
fi
git fetch --quiet --tags origin
if [[ -n "$(git ls-remote --tags origin "$tag")" ]]; then
  die "Tag $tag already exists on origin."
fi

step "Checking npm registry for $name@$version"
if npm view "$name@$version" version >/dev/null 2>&1; then
  die "$name@$version is already published on npm."
fi
ok "$name@$version is not yet on npm"

# --- verify ------------------------------------------------------------------

step "Running typecheck / lint / test / build"
pnpm typecheck
pnpm lint
pnpm test
pnpm build
ok "All checks passed"

step "Tarball preview"
( cd npm && npm pack --dry-run )

# --- confirm -----------------------------------------------------------------

echo
read -p "Publish $name@$version and tag $tag? (y/N) " -n 1 -r
echo
[[ "$REPLY" =~ ^[Yy]$ ]] || die "Aborted."

# --- publish + tag -----------------------------------------------------------

step "Publishing to npm (browser will open for auth)"
( cd npm && npm publish --auth-type=web )
ok "Published $name@$version"

step "Tagging and pushing"
git tag -a "$tag" -m "$tag"
git push origin HEAD
git push origin "$tag"
ok "Pushed $tag"

echo
green "Released $name@$version"
echo "  https://www.npmjs.com/package/$name/v/$version"
echo "  https://github.com/rousan/mx/releases/tag/$tag"
