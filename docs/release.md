# Release runbook

How to ship a new version of `@roulabs/mx`, and the gotchas caught the hard way that aren't obvious from code.

## The flow (automated — primary)

Releases are **CI-driven**: every push to `main` (i.e. every merged PR) runs `.github/workflows/release.yml`, which publishes whatever version sits in `npm/package.json`.

The contract: **every merge to `main` must produce a new release.** The PR is responsible for bumping `npm/package.json`'s `"version"`. The workflow guards on this — if the version still matches an existing `vX.Y.Z` tag, the run **fails** with an error telling you to bump the version. So:

```bash
# in your PR branch, before merging:
$EDITOR npm/package.json          # bump "version"
git commit -am "release vX.Y.Z"
# open PR → merge to main → CI releases automatically
```

What the workflow does on each push to `main`:

1. Checkout with full history + tags.
2. Resolve `version` from `npm/package.json`; **fail** if `vX.Y.Z` already exists as a tag (locally or on origin) — bump the version and re-merge.
3. `pnpm install --frozen-lockfile`, then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
4. `npm publish` from `npm/`, authenticated via the `NPM_TOKEN` secret (`NODE_AUTH_TOKEN`).
5. Create + push the annotated `vX.Y.Z` tag.
6. Create a GitHub Release for the tag with auto-generated notes.

### One-time setup: the `NPM_TOKEN` secret

CI cannot use the interactive `--auth-type=web` browser flow. It needs an **npm automation token** (automation tokens bypass 2FA at publish time):

1. Sign in at <https://www.npmjs.com> as a user with publish rights on the `@roulabs` org.
2. Avatar → **Access Tokens** → **Generate New Token** → **Classic Token** → type **Automation** (or a **Granular Access Token** scoped to publish `@roulabs/mx`). Copy it — it's shown once.
3. In GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**. Name it `NPM_TOKEN`, paste the value.

`GITHUB_TOKEN` (used to push the tag and create the Release) is provided automatically by Actions; the workflow requests `contents: write` permission for it. No other secret is needed.

## The fallback flow (local, manual)

`scripts/release.sh` (`pnpm release`) still works for local/emergency publishing when CI is unavailable. It is **superseded by the workflow** for normal releases — prefer merging to `main`. One-time on the publisher's machine:

```bash
npm login
```

To cut a release manually:

```bash
$EDITOR npm/package.json          # bump "version"
git commit -am "release vX.Y.Z"
pnpm release                       # → scripts/release.sh
```

`pnpm release` (interactive — must run in a real terminal, not via stdin pipe):

1. **Verify `npm whoami`** — must be logged in.
2. **Working tree clean** — refuses with `git status` short output if not.
3. **Tag doesn't exist** locally or on origin (with a fresh `git fetch --tags`).
4. **Version not already published** — `npm view @roulabs/mx@X.Y.Z` returns 404.
5. **Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`** — all green.
6. **Show `npm pack --dry-run` tarball preview**.
7. **Prompt: `Publish @roulabs/mx@X.Y.Z and tag vX.Y.Z? (y/N)`** — type `y`.
8. **`npm publish --auth-type=web`** from `npm/` — opens a browser, you confirm in browser (handles 2FA cleanly).
9. **`git tag -a vX.Y.Z -m vX.Y.Z`**, **`git push origin HEAD`**, **`git push origin vX.Y.Z`**.

The script fails fast on any preflight issue — safe to re-run.

## Gotchas (catalogued so future-you doesn't relearn them)

### 1. npm CLI has no `org create` subcommand

For a brand-new scoped package (`@org/pkg`), the org must exist on npm before you can publish. The npm CLI has `npm org set / rm / ls` but **no `create`**. Orgs are created via the web UI only: <https://www.npmjs.com/org/create>. Pick the **Free** plan (unlimited public packages, no card required).

This bit us when first publishing `@roulabs/mx@1.0.0`. The publish errored with "Scope not found" until the `@roulabs` org existed on npm.

### 2. `npm view <name>` returning 404 doesn't mean a name will publish

npm has an **opaque similarity heuristic** that rejects unscoped names at publish time. `mxcli` was rejected at publish for being too similar to an existing `mx-cli` package, even though `npm view mxcli` had returned a clean 404.

**Scoped names (`@org/name`) bypass this check entirely**, which is why we settled on `@roulabs/mx` after the `mxcli` attempt failed.

### 3. 2FA-protected accounts need `--auth-type=web` to publish without an OTP prompt

If your npm account has 2FA enabled (most do today), a plain `npm publish` triggers an interactive OTP prompt — which doesn't work cleanly when stdin is piped. The fix is `npm publish --auth-type=web`: opens a browser to confirm, no OTP typing needed. `scripts/release.sh` uses this flag.

### 4. First publish of a fresh scope can take 5+ minutes to propagate

After a successful publish to a brand-new scoped org, `npm view @org/pkg` may return 404 for several minutes while the npm CDN and search index catch up. The package **is** published — the version-specific endpoint shows up immediately:

```bash
curl -s https://registry.npmjs.org/@roulabs/mx/latest | head -c 200
```

This isn't an error; just propagation lag. Don't try to "fix" by republishing.

### 5. The release script pushes `HEAD`, which might be your feature branch

`git push origin HEAD` pushes whatever branch is currently checked out. Under [self-hosting](self-hosting.md), the worktree is on a feature branch (`improve-mx`, etc.), not `main`. So the release commit lands on the feature branch, not main.

Options:
- **(a) Fast-forward the feature branch to `main` directly**: `git push origin <feature>:main` if it's a clean linear extension. Then the release commit + tag live on `main`.
- **(b) Merge to `main` first**: switch to a worktree on `main`, merge the feature, then `pnpm release` from there.

The release script doesn't yet enforce "release from main only" — that's an open improvement.

### 6. The publish only ships what's inside `npm/`

The publishable package layout is `npm/` (committed: `package.json`, `README.md`; built: `bin/`, `templates/`, `LICENSE`). Anything outside `npm/` is invisible to the npm registry — including the source code at `packages/` and `apps/`. If you add new runtime templates, ensure tsup's `onSuccess` copy step picks them up (`apps/cli/tsup.config.ts`). The `npm/templates/` directory is gitignored — it's regenerated on every build.

### 7. The runtime CLAUDE.md template change only propagates after `mx update`

If a release changes `templates/CLAUDE.md`, existing runtimes won't see it until the user runs:

```bash
npm i -g @roulabs/mx@latest
mx update
```

`mx update` is non-destructive — never modifies `work.json`, body files, or anything the user owns. But it does re-stamp `<runtime>/CLAUDE.md` from the new template.

## Version conventions

Semver, loosely interpreted (mx is at 1.x, internal-use):

- **Patch (`X.Y.Z+1`)** — bug fixes, doc-only changes, presentation tweaks, behaviour clarifications that don't change CLI surface or schema.
- **Minor (`X.Y+1.0`)** — new commands, new flags, additive porcelain fields, runtime CLAUDE.md template changes (since they're a deliberate contract update requiring `mx update`).
- **Major (`X+1.0.0`)** — reserved. We've taken a few breaking changes on minor bumps (e.g. `--all` semantics flipping in 1.9.0) because mx is internal-use; document them clearly in the commit message. A future user-base would warrant stricter major-bump discipline.

## Where to look when something is wrong

- **`pnpm publish` failing** → check `npm whoami`, check the scope exists, check the name isn't similarity-rejected, check 2FA isn't blocking.
- **Tag pushed but npm shows old version** → wait 5 minutes (CDN), then check the `/latest` endpoint directly.
- **`mx` from `$PATH` shows wrong version** → that's the globally installed one; might be stale. `npm i -g @roulabs/mx@latest` to refresh.
- **`pnpm mx version` shows the version from `npm/package.json`** — the CLI reads its own version from the package.json at startup (since v1.0.1).
