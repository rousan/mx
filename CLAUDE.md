# mx — source & control panel for the mx system

This repo is the **source of truth** for **mx** ("multiplexer"), a system for running several features in parallel across shared repos using git worktrees. You are working on mx *itself* here — the CLI, the core library, the templates, the docs — not on any feature. The published CLI lives on npm as `@roulabs/mx` (command `mx`); the source is hosted at `github.com/roulabs/mx`.

mx produces a **runtime**: an `mx/` folder somewhere on the device, containing `repos/`, `works/`, and a `CLAUDE.md` stamped from the templates shipped inside the CLI. The source repo and any runtime are fully **decoupled** — this repo is never tied to a particular runtime.

## The core principle: mx owns runtime state

`mx` is the **single owner** of all runtime state — the per-work manifest (`work.json`) and the VS Code `.code-workspace`. Feature sessions in the runtime never hand-edit those files and never run raw `git worktree`; they go through `mx` commands, which read state and (for reads) emit stable JSON via `--porcelain`. The source repo and feature sessions are just harnesses around the CLI.

## Architecture

A TypeScript pnpm monorepo. **Source code and publishable npm package live in separate folders** — `apps/cli/` is the source; `npm/` is the bundled package that `npm publish` ships:

- **`packages/core` (`@mx/core`)** — pure, typed, unit-tested domain logic. Functions take inputs, return plain data, and `throw MxError`; they never `console.log` or `process.exit`, and never assume an on-disk layout (paths like the templates dir are passed in).
- **`apps/cli` (`@mx/cli`, private)** — CLI source over `@mx/core`: arg parsing, cwd→`-n` inference, output formatting (`--porcelain` vs human), exit codes. Bundled by tsup into a single dependency-free entry. The package itself is private and never published; it exists only as a workspace member so pnpm can wire `@mx/core` in.
- **`npm/` (`@roulabs/mx`)** — the publishable package. `package.json` and `README.md` are committed (public metadata + user docs). `bin/mx.js`, `templates/`, and `LICENSE` are produced by `pnpm build` (gitignored). `npm publish` runs from this folder.

New behavior is normally a core function plus thin CLI wiring.

## Running the CLI (dev vs global)

There is **no global PATH coupling to this repo**. The global `mx` exists only when you install a build: `npm i -g @roulabs/mx` (npm owns that bin).

For development, run the local build via the workspace:

```bash
pnpm install
pnpm build                     # populates npm/ (bin/mx.js + templates/ + LICENSE)
export MX_RUNTIME="$PWD/.mx"   # a gitignored dev runtime in this repo
pnpm mx init                   # = node npm/bin/mx.js init
pnpm mx status
```

`mx` reflects **built** output: after changing CLI/core code, `pnpm build` (or keep `pnpm dev` running). Templates live at `/templates` and are copied into `npm/templates/` at build, so editing them requires a rebuild to take effect.

## Finding the runtime

The CLI resolves the runtime in order:

1. `--runtime <path>` flag.
2. `$MX_RUNTIME` environment variable.
3. Default `~/mx`.

No pointer file is written anywhere. A consumer (or you, on any machine) sets `$MX_RUNTIME` once, or relies on the `~/mx` default. Commands resolve the runtime through this mechanism — never hardcode a path.

## Source-of-truth rule

The runtime's `CLAUDE.md` is an **installed copy** of `templates/CLAUDE.md` (at the repo root). The per-work `work.json` and `.code-workspace` are **generated programmatically** by the CLI (not text-substituted); `templates/{work.json,workspace.code-workspace}` hold their reference shapes.

- To change runtime guidance, edit `templates/CLAUDE.md`, run `pnpm build` (which copies the templates into `npm/templates/`), then run `mx update`.
- Templates are resolved relative to the installed bin (`<pkg>/bin/mx.js` → `<pkg>/templates/`), so the CLI works the same in dev (`npm/bin/mx.js` → `npm/templates/`) and once installed from npm.
- Never hand-edit a runtime's installed `CLAUDE.md`; the runtime carries **only** a `CLAUDE.md` (no runtime README).

## `mx update`

`mx update` re-syncs a runtime with the current mx version. Its contract is strictly **non-destructive — user data is never touched.** It:

- re-stamps the runtime `CLAUDE.md` from `templates/CLAUDE.md` (mx-owned generated content; always regenerated);
- stamps `context/INDEX.json` **only if missing** (existing index content is preserved);
- **backfills mx-owned structural directories across every work** — currently `<work>/sessions/` for any work that pre-dates that scaffolding. Future per-work or per-repo additions slot into `ensureWorkScaffolding` in `@mx/core` and propagate the same way.
- removes a stale runtime `README.md` if one lingers (legacy cleanup).

It does **not** modify `work.json` contents, `.code-workspace` files, worktree code, session body files, context body files, or anything under `repos/`. Every output path it reports in `updated` is either a re-stamped template or a newly-created empty directory.

## Testing against a runtime (hard rule)

**Never test the CLI against a real/production runtime.** Point `$MX_RUNTIME` at a throwaway `/tmp` runtime (or this repo's `.mx/`) and test there:

```bash
export MX_RUNTIME=/tmp/mx-sbx
node npm/bin/mx.js init              # or: pnpm mx init
```

Use locally-created throwaway git repos as clone sources (`git init` in `/tmp/...`) so tests need no network. Since the runtime location is env-only (no pointer file), sandbox runs can't corrupt a real runtime — but still target `/tmp`. `MX_TEMPLATES_DIR` is available as an override for tests that want a fixture templates dir.

## Layout

```
mx/                                  # pnpm workspace (TypeScript); repo = github.com/roulabs/mx
├── package.json                     # root scripts: build / dev / mx / typecheck / lint / test
├── pnpm-workspace.yaml
├── tsconfig.base.json · eslint.config.js · .prettierrc.json · .nvmrc · LICENSE
├── CLAUDE.md                        # this file — how to work on mx
├── README.md                        # dev/source guide
├── .github/workflows/ci.yml         # typecheck/lint/test/build on PRs
├── scripts/release.sh               # local release driver (pnpm release)
├── packages/
│   └── core/                        # @mx/core — pure, typed, unit-tested domain logic
│       └── src/                     #   errors, types, fsutil, json, git, templates,
│                                    #   runtime, ports, repos, works, status, index
├── templates/                       # source-of-truth runtime assets (no code; copied to npm/templates at build)
│   ├── CLAUDE.md                    # feature-session rules
│   ├── work.json                    # reference shape
│   └── workspace.code-workspace
├── apps/
│   └── cli/                         # @mx/cli (private) — CLI source
│       ├── src/                     # args, output, help, paths, main, commands/{global,repo,work}
│       └── tsup.config.ts           # bundles src/bin/mx.ts -> ../../npm/bin/mx.js, copies assets
└── npm/                             # @roulabs/mx — publishable package
    ├── package.json                 # committed (public metadata)
    ├── README.md                    # committed (consumer docs)
    ├── bin/mx.js                    # built by `pnpm build` (gitignored)
    ├── templates/                   # copied from /templates by build (gitignored)
    └── LICENSE                      # copied from repo root by build (gitignored)
```

## The runtime model

```
mx/ (a runtime, e.g. ~/mx or ./.mx)
├── .mx-root            # marker file
├── CLAUDE.md           # from /templates/CLAUDE.md
├── context/            # shared memory across all features (see runtime CLAUDE.md § Context registry)
│   ├── INDEX.json      # source of truth for entry metadata; stamped by mx init (only if missing)
│   └── <path>.md       # body-only entries; agent owns content and nesting
├── repos/<repo>/       # pristine clones — read-only reference
└── works/<feature>/    # one folder per feature
    ├── work.json       # manifest, owned by mx; carries isArchived + archived_at when archived
    ├── <feature>.code-workspace
    ├── sessions/       # one md per session, written when the user asks at end-of-session
    └── <repo>/         # git worktree on the feature branch (absent while archived)
```

`templates/CLAUDE.md` is the **authoritative description** of how feature sessions behave (never edit `repos/`, never hand-edit `work.json`, never raw-`git` worktrees, ask before adding a worktree, keep branches on teardown, per-service free-port allocation). Keep it consistent with the CLI.

## Command contracts

Implemented in `apps/cli` over `@mx/core`. Each command resolves the runtime via the discovery order above. Reads accept `--porcelain` (stable JSON); mutations echo the resulting object; errors are `{"error","code"}` with a non-zero exit. `-n <name>` may be omitted when the cwd implies it (inside `works/<work>/…` infers the work and, in a worktree, the repo; inside `repos/<repo>/…` infers the repo).

**Global**
- **`mx init [path]`** — scaffold/adopt a runtime (target = path arg, else `$MX_RUNTIME`, else `~/mx`): create `repos/`, `works/`, `.mx-root`; stamp `CLAUDE.md`; stamp `context/INDEX.json` (only if missing — context is user data). Idempotent; no clone; no pointer written.
- **`mx status [--all] [--porcelain]`** — runtime path, repos + branches, works + worktrees + ports. Active works only by default; `--all` includes archived. Aliases: `mx s`, `mx st`.
- **`mx update`** — re-stamp the runtime `CLAUDE.md`; stamp `context/INDEX.json` only if missing; backfill `<work>/sessions/` for every work that lacks it. Never modifies user data.
- **`mx help` / `mx version`**.

**Repos** — `mx repo`: `add <git-url> [--name <n>]` (only command that clones) · `ls` · `-n <name> fetch` · `-n <name> info` · `health` (all repos, ✓/⚠ one-liner each) / `-n <name> health` (detail block: default branch, current branch, uncommitted, untracked, ahead/behind, last fetched, worktrees-in-works) · `-n <name> rm` (refuses if any work uses it). Health checks are purely local — they don't fetch; run `mx repo -n <name> fetch` first if you want a fresh comparison against origin.

**Works** — `mx work`: `new <name> [--description <t>]` (creates folder, empty `work.json`, empty `sessions/`; prints path) · `ls [--all|--archived]` (default: active only; `--all` includes archived; `--archived` shows archived only) · `-n <name> info` · `describe <t>` · `path` · `worktree add <repo> [--branch <b>] [--base <ref>]` / `ls` / `rm <repo>` · `port set <repo> <service> [<port>]` / `unset` / `ls` · `archive` (removes worktrees, keeps folder + manifest + sessions + branches; recoverable via `unarchive`) · `unarchive [<repo>=<branch>...]` (re-creates worktrees from `work.json`; positional `repo=branch` overrides per-repo when a recorded branch is missing) · `destroy --force` (PERMANENT: deletes the work folder including session summaries; branches still kept). `--base` resolves to a commit SHA (trying the ref, then `origin/<ref>`) so a bare branch name forks correctly; `worktree rm` / `archive` / `destroy` refuse on uncommitted changes; ports are unique across **all** works (no blocks). `archive` flips `isArchived: true` and stamps `archived_at` in `work.json`; `unarchive` clears them.

Deferred: `mx open` (terminal/editor layout).

## Conventions

- **TypeScript pnpm monorepo, zero runtime dependencies.** Both source packages (`@mx/core`, `@mx/cli`) use only `node:` builtins; tsup bundles `@mx/core` into the CLI so the published `@roulabs/mx` package installs no deps. Tooling (tsup, eslint, vitest, prettier) is devDeps only. `@mx/cli` is private; the published thing is the `npm/` folder.
- **Workflow:** `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` (and `pnpm dev` to watch). Add a Vitest test in `packages/core/test` for new core logic.
- **Runtime is env-addressed** (`$MX_RUNTIME` / `--runtime` / `~/mx`); never persist a runtime path in this repo. Dev uses the gitignored `.mx/` runtime.
- **Release:** local-driven via `pnpm release` (which runs `scripts/release.sh`). One-time on the publisher's machine: `npm login`. To cut a release, bump the `"version"` in `npm/package.json`, commit, then `pnpm release` — the script verifies npm auth + clean tree + fresh tag + unpublished version, runs typecheck/lint/test/build, shows a tarball preview, prompts to confirm, then `npm publish`es from `npm/` and pushes the `vX.Y.Z` tag. Publish uses `--auth-type=web` so 2FA-protected accounts get a browser confirm instead of an OTP prompt. No GitHub Actions secret to maintain; publishing targets `registry.npmjs.org` regardless of any local corp `.npmrc` registry. **Gotchas** (npm name similarity rejection on unscoped names; CDN propagation lag on first publish of a new scope; npm has no `org create` CLI command — orgs must be created at https://www.npmjs.com/org/create) are documented in `README.md` § Release.
- Keep `templates/CLAUDE.md` and the CLI's behavior consistent — they're the contract feature sessions rely on. A runtime only sees template changes after `pnpm build` (which copies them into `npm/templates/`) and `mx update`.

## Status & where to pick up

For a fresh session / new machine:

- **Done and verified:** the full TS pnpm monorepo (`@mx/core` source + `@mx/cli` source + `npm/` publishable package), all commands (`init`, `status`, `update`, `repo`, `work` incl. `worktree`/`port`/`path`), env-based runtime discovery, templates copied into `npm/templates/` at build time, CI workflow for PR checks, `scripts/release.sh` for local publishing, MIT license, and a consumer README at `npm/README.md`. `pnpm typecheck/lint/test/build` are green; the packed tarball installs via `npm i -g` and runs self-contained from outside the repo. Hosted at `github.com/roulabs/mx`, branch `main`.
- **Shipped:** `@roulabs/mx` is live on npm at https://www.npmjs.com/package/@roulabs/mx (first release `v1.0.0` on 2026-06-04). For the currently-published version, run `git describe --tags --abbrev=0` or check the npm page. End-user install: `npm i -g @roulabs/mx` → `mx` command.
- **Start working:** `pnpm install && pnpm build`, then `export MX_RUNTIME="$PWD/.mx"` and `pnpm mx init`. Iterate with `pnpm dev` (watch) + `pnpm mx ...`; run `pnpm typecheck && pnpm lint && pnpm test` before committing.
- **Next release:** bump `npm/package.json` version, commit, then `pnpm release`. The script uses `--auth-type=web` so a browser opens for 2FA-protected publish (no OTP typing).
- **Not done yet:** `mx open` (terminal/editor layout). Optional next idea: isolated per-env state (separate DB schema / container) for safe parallel runs.
- **Gotchas already handled in code (keep them):** never run mx against a real runtime — use `/tmp` or `.mx`; the first `pnpm install` on a corp npm mirror is slow, not stuck; `--base` is resolved to a commit SHA with an `origin/<ref>` fallback to avoid git's DWIM overriding `-b`; `inferContext` realpaths both sides so symlinked roots (e.g. macOS `/tmp`) match.
