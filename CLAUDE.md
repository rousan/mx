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

## Detailed docs

This CLAUDE.md is the entry point. For deeper material on any topic, see `/docs/`:

- [docs/overview.md](docs/overview.md) — what mx is, the core mental model
- [docs/architecture.md](docs/architecture.md) — monorepo layout, build flow, dependency graph
- [docs/runtime-model.md](docs/runtime-model.md) — runtime layout, `work.json` schema, `INDEX.json` schema, session protocol
- [docs/commands.md](docs/commands.md) — every CLI command, flags, error codes
- [docs/development.md](docs/development.md) — dev setup, testing patterns, the `.mx/` sandbox convention
- [docs/self-hosting.md](docs/self-hosting.md) — using mx to develop mx (the dogfooding pattern)
- [docs/release.md](docs/release.md) — release runbook + every gotcha caught the hard way
- [docs/history.md](docs/history.md) — version timeline, what each release brought

When working on a specific area (release flow, command behaviour, etc.), open the matching doc — they have detail that didn't fit in this CLAUDE.md.

## Running the CLI (dev vs global)

There is **no global PATH coupling to this repo**. The global `mx` exists only when you install a build: `npm i -g @roulabs/mx` (npm owns that bin).

For development, run the local build via the workspace:

```bash
pnpm install
pnpm build                     # populates npm/ (bin/mx.js + templates/ + LICENSE)
export MX_RUNTIME="$PWD/.mx"   # a gitignored dev runtime in this repo
pnpm mx init                   # = node npm/bin/mx.js init
pnpm mx info
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

- To change runtime guidance, edit `templates/CLAUDE.md`, run `pnpm build` (which copies the templates into `npm/templates/`), then run `mx sync`.
- Templates are resolved relative to the installed bin (`<pkg>/bin/mx.js` → `<pkg>/templates/`), so the CLI works the same in dev (`npm/bin/mx.js` → `npm/templates/`) and once installed from npm.
- Never hand-edit a runtime's installed `CLAUDE.md`; the runtime carries **only** a `CLAUDE.md` (no runtime README).

## `mx sync` / `mx update` / `mx migrate`

These three are distinct — don't confuse them:

**`mx sync`** re-syncs a runtime with the current mx version (this is the command formerly called `mx update`). Its contract is strictly **non-destructive — user data is never touched.** It's same-major and subject to the version gate. It:

- re-stamps the runtime `CLAUDE.md` from `templates/CLAUDE.md` (mx-owned generated content; always regenerated);
- stamps `context/INDEX.json` **only if missing** (existing index content is preserved);
- **backfills mx-owned structural directories across every work** — `<work>/wt/`, `scripts/`, `files/`, `tmp/`, and `sessions/` for any work that pre-dates that scaffolding, plus the runtime-wide `hooks/` (the central hook hub) and `bin/` and their shipped contents. Future per-work or per-repo additions slot into `ensureWorkScaffolding` in `@mx/core` and propagate the same way.
- backfills the central hook scripts (`hooks/<event>`, stamp-if-missing), each repo's `repo.json` (when missing), and the per-work `CLAUDE.md`;
- removes a stale runtime `README.md` if one lingers (legacy cleanup).

It does **not** modify `work.json` contents, `.code-workspace` files, worktree code, session body files, context body files, user-edited hook bodies, or anything under `repos/<repo>/git/`. Its output header is "Synced runtime at …"; every reported path is either a re-stamped template or a newly-created empty directory.

**`mx update`** is now a *different* command: it **self-updates the CLI** within its current major (`npm i -g @roulabs/mx@^<major>`), detects whether a newer major exists and suggests the deliberate upgrade (`npm i -g @roulabs/mx@<N>` then `mx migrate`), and is **not** version-gated. It falls back to printing the manual command if npm is missing or the install fails. **After a successful in-major update it automatically runs `mx sync`** — by shelling out to the freshly-installed global `mx` (this process is still the old code), so the new version's templates are what get stamped; in `--porcelain` mode the sync runs silently to keep stdout a single JSON object.

**`mx migrate`** upgrades an older-version runtime up to the version this CLI supports — the only runtime command allowed on a version mismatch. It validates the full migration chain before mutating (`NO_MIGRATION` on a gap, `CLI_TOO_OLD` if the runtime is newer), and reports per-step `warnings`. The **v1 → v2** step moves each clone into `repos/<repo>/git/` and each work's flat worktrees into `wt/`. The **v2 → v3** step centralizes hooks: it stamps the `<runtime>/hooks/` hub, writes each repo's `repo.json`, and **retires the old per-repo `hydrate.sh`/`health.sh` and per-work `hooks/`** — deleting them when they're unchanged from the mx default, but **keeping them with a warning** when customized (so you can fold the logic into the central hooks). `--dry-run` previews the whole plan (and warnings) without mutating.

The CLI gates runtime commands on the runtime's `mx.json` (CLI major ⇄ runtime version); on a mismatch it refuses with `RUNTIME_VERSION_MISMATCH`, allowing only `mx migrate`, `mx update`, `mx help`, `mx version`.

## Testing against a runtime (hard rule)

**Never test the locally-built CLI against a real/production runtime.** Point `$MX_RUNTIME` at a throwaway `/tmp` runtime (or this repo's `.mx/`) and test there:

```bash
export MX_RUNTIME=/tmp/mx-sbx
node npm/bin/mx.js init              # or: pnpm mx init
```

Use locally-created throwaway git repos as clone sources (`git init` in `/tmp/...`) so tests need no network. Since the runtime location is env-only (no pointer file), sandbox runs can't corrupt a real runtime — but still target `/tmp`. `MX_TEMPLATES_DIR` is available as an override for tests that want a fixture templates dir.

This rule is **load-bearing under self-hosting** (next section): when this very source repo is checked out as a worktree inside an mx runtime, the "real runtime" is literally the one hosting your code. Running `pnpm mx sync` (or any locally-built `mx`) without `$MX_RUNTIME` set elsewhere would re-stamp the host runtime's `CLAUDE.md` with your work-in-progress template, possibly with a broken or unreleased shape. Always set `$MX_RUNTIME` to a sandbox first.

## Self-hosting: working on mx as a work inside an mx runtime

You may dogfood mx by treating its source as just another repo in an mx runtime — running several parallel feature branches of mx itself the same way you'd run parallel features of any product:

```bash
# One-time, on your productive runtime:
mx repo add git@github.com:roulabs/mx.git

# Per feature (repeatable for as many parallel mx features as you want):
mx work new improve-mx-status-ui
mx work -n improve-mx-status-ui worktree add mx --branch improve-mx-status-ui
cd $(mx work -n improve-mx-status-ui path)/wt/mx
```

Each feature lives at `<runtime>/works/<feature-name>/wt/mx/` as its own worktree on its own branch. You can have any number of them open at once; each is independent.

### The strict rule under self-hosting

There are two `mx` binaries available inside a self-hosted worktree, and they must be used for different things:

| binary | what it runs | use for |
|---|---|---|
| `mx` (on `$PATH`) | the **globally installed** `@roulabs/mx` — published version | productive runtime operations: `mx i`, `mx work archive feat`, etc. **Safe** against the productive runtime. |
| `pnpm mx ...` or `node npm/bin/mx.js ...` | the **locally-built** CLI from your in-progress code | **testing only** — must always be pointed at a sandbox runtime, never the productive one. |

The hard rule: **the locally-built CLI never sees the productive runtime.** Before any test, set `$MX_RUNTIME` to a sandbox:

```bash
export MX_RUNTIME="$PWD/.mx"           # gitignored, per-worktree sandbox (recommended)
# or, for a fully throwaway one:
export MX_RUNTIME=/tmp/mx-sbx-$(date +%s)
```

A useful trick: `direnv` (or a shell function on `cd`) can auto-set `MX_RUNTIME=$PWD/.mx` whenever you're inside one of these worktrees, so reflex-correct behaviour comes free. Outside the worktree, `MX_RUNTIME` stays at your productive runtime; inside, it's the sandbox.

### Multiple parallel mx-feature works

Each `works/<feature>/wt/mx/` is fully independent: its own branch, its own `.mx/` sandbox if testing, its own commits, its own pushes. Switch between them by `cd` — no mode or state to remember. The Vitest suite isolates itself in `/tmp/...` regardless, so unit tests work the same in every feature work.

### Caveats

- **Don't archive the work you're sitting in.** `mx work -n improve-mx archive` deletes the worktree directory; your shell ends up in a deleted path. `cd` out first.
- **The work's outer runtime CLAUDE.md and this source repo's CLAUDE.md both load** inside a worktree. They describe different layers (runtime conventions vs mx developer rules) and don't conflict — but be aware Claude sees both.
- **Releases work as normal:** `pnpm release` reads `npm/package.json`, builds, publishes from `npm/`. It doesn't care that the source is hosted inside an mx runtime.

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
│                                    #   runtime, migrations, ports, repos, works, status, index
├── templates/                       # source-of-truth runtime assets (no code; copied to npm/templates at build)
│   ├── CLAUDE.md                    # feature-session rules
│   ├── work.json                    # reference shape
│   └── workspace.code-workspace
├── apps/
│   └── cli/                         # @mx/cli (private) — CLI source
│       ├── src/                     # args, output, help, paths, selfupdate, setup, main,
│       │                            #   commands/{global,repo,work}
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
├── mx.json             # runtime config: { "version": 3 } (absent = legacy v1)
├── CLAUDE.md           # from /templates/CLAUDE.md
├── hooks/              # central HOOK HUB: one executable per event (stamp-if-missing; any language)
│   └── {pre,post}-{worktree-create,worktree-remove,work-archive,work-unarchive,repo-fetch} · repo-health · work-health
├── bin/                # runtime-wide utility executables for PATH; mx ships some (re-stamped on sync), user adds more (untouched)
├── context/            # shared memory across all features (see runtime CLAUDE.md § Context registry)
│   ├── INDEX.json      # source of truth for entry metadata; stamped by mx init (only if missing)
│   └── <path>.md       # body-only entries; agent owns content and nesting
├── repos/<repo>/       # per-repo container
│   ├── git/            # the pristine clone — read-only reference
│   └── repo.json       # repo metadata { "name": … } (extensible); NO per-repo scripts in v3
└── works/<feature>/    # one folder per feature
    ├── work.json       # manifest, owned by mx; carries isArchived + archived_at when archived
    ├── <feature>.code-workspace  # owned by mx; folder paths point at wt/<repo>
    ├── CLAUDE.md       # work-specific rules — stamped once (comment + empty), then user-owned
    ├── wt/             # all worktrees: wt/<repo>, git worktree on the feature branch (absent while archived)
    ├── scripts/        # ad-hoc per-work scripts, incl. per-work binaries (stamp-if-missing dir)
    ├── files/          # keepable artifacts — agent/user drop zone (stamp-if-missing dir)
    ├── tmp/            # throwaway scratch, deletable any time (stamp-if-missing dir)
    └── sessions/       # one md per session, written when the user asks at end-of-session
```

The runtime carries a layout `mx.json`; the CLI supports one version (CLI major ⇄ runtime version) and
gates every runtime command on a match — see § `mx sync` / `mx update` / `mx migrate` below.

`templates/CLAUDE.md` is the **authoritative description** of how feature sessions behave (never edit `repos/`, never hand-edit `work.json`, never raw-`git` worktrees, ask before adding a worktree, keep branches on teardown, per-service free-port allocation). Keep it consistent with the CLI.

## Command contracts

Implemented in `apps/cli` over `@mx/core`. Each command resolves the runtime via the discovery order above. Reads accept `--porcelain` (stable JSON); mutations echo the resulting object; errors are `{"error","code"}` with a non-zero exit. `-n <name>` may be omitted when the cwd implies it (inside `works/<work>/…` infers the work and, inside a worktree at `works/<work>/wt/<name>/…`, the repo is resolved from `work.json`; inside `repos/<repo>/…` infers the repo).

**Global**
- **`mx init [path]`** — scaffold/adopt a runtime (target = path arg, else `$MX_RUNTIME`, else `~/mx`): create `repos/`, `works/`, `.mx-root`; stamp `mx.json`, `CLAUDE.md`; stamp `context/INDEX.json` (only if missing — context is user data). Refuses to adopt a runtime whose `mx.json` differs (→ `mx migrate`, or upgrade the CLI). Idempotent; no clone; no pointer written.
- **`mx info [--all] [--porcelain]`** — runtime path, repos + branches, works + worktrees + ports. Active works only by default; `--all` includes archived. Alias: `mx i`.
- **`mx sync`** — (formerly `mx update`) re-stamp the runtime `CLAUDE.md`; stamp `context/INDEX.json` only if missing; backfill the central `hooks/` hub (stamp-if-missing), the runtime `bin/` + shipped utility bins, each repo's `repo.json`, the per-work dirs (`wt/`, `scripts/`, `files/`, `tmp/`, `sessions/`), and the per-work `CLAUDE.md`. Never modifies user data. Version-gated.
- **`mx update`** — self-update the CLI within its major (`npm i -g @roulabs/mx@^<major>`); suggests a deliberate major upgrade if one exists. Not version-gated. After a successful update it auto-runs `mx sync` (via the freshly-installed global) to refresh the runtime.
- **`mx migrate [--dry-run]`** — upgrade an older runtime to the supported version (the only runtime command allowed on a version mismatch); validates the chain first (`NO_MIGRATION` / `CLI_TOO_OLD`). v1→v2 moves clones into `git/` + worktrees into `wt/`; v2→v3 stamps the central `hooks/` hub, writes `repo.json`, and retires old per-repo/per-work scripts (default → removed, customized → kept + warned). `--dry-run` validates and prints the full plan + warnings without mutating; porcelain adds `dryRun: true`, `warnings`.
- **`mx health [--all]`** — whole-runtime health overview: every repo's health block (as `mx repo health`) followed by every active work's health block (as `mx work health`); `--all` includes archived works. Porcelain returns `{repos, works}`.
- **`mx help` / `mx version`**.

The version gate: every runtime-touching command first checks the runtime `mx.json` against the version the CLI supports (CLI major ⇄ runtime version); a mismatch refuses with `RUNTIME_VERSION_MISMATCH`, allowing only `mx migrate`, `mx update`, `mx help`, `mx version`.

**Repos** (clones live at `repos/<repo>/git/`, inside a per-repo container with a `repo.json`) — `mx repo`: `add <git-url> [--name <n>]` (only command that clones; writes `repo.json`) · `new <name> [--quick] [-o] [--description <t>]` (create a fresh **local** repo with no remote: `git init` on `main` + starter README + initial commit + `repo.json`; `--quick` also creates a `dev-<name>` work + a worktree on `develop` and fires `post-worktree-create`, `-o` opens it — a one-shot quick-start for throwaway apps; the worktree forks `main` onto `develop` since the pristine holds `main`) · `ls` (shows container path; porcelain `path`) · `-n <name> fetch` (fires `pre/post-repo-fetch`; fast-forwards the checked-out **and** base branches; `mx repo fetch --all` fetches every repo) · `-n <name> info` · `health` / `-n <name> health` (same per-repo detail block showing only **metric** rows that carry a ✓/⚠ — current branch (vs default), uncommitted, untracked, ahead/behind (when upstream), last fetched (remote repos, ✓ if within 24h else stale), plus the captured `repo-health` hook output as the `extra` row; the repo name gets an aggregate ✓/⚠; without `-n` it prints every repo's block in turn) · `-n <name> rm` (refuses if any work uses it). Health checks are purely local — they don't fetch; run `mx repo -n <name> fetch` first if you want a fresh comparison against origin.

**Works** — `mx work`: `new <name> [--description <t>] [--open|-o]` (creates folder, empty `work.json`, the per-work dirs `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/`, the work `CLAUDE.md`; prints path; `-o` opens a Terminal in the work folder on macOS) · `ls [--all|--archived]` (default: active only; shows folder path / porcelain `path`) · `-n <name> info` · `describe <t>` · `path` · `worktree add <repo> [<name>] [--branch <b>] [--base <ref>]` (fires `pre-worktree-create`, then `post-worktree-create`; `<name>` defaults to the repo and is the `wt/<name>` dir + selector — pass a distinct one to hold **multiple worktrees of the same repo**) / `ls` / `rm <worktree>` (fires `pre/post-worktree-remove`) · `port set <worktree> <service> [<port>]` / `unset` / `ls` · `health` / `-n <name> health` (pure-local work-folder health: stray non-mx-native files in the work root, worktree presence vs `work.json`, cross-work port collisions from hand-edits, and archive invariants — an archived work should have its ports freed and worktrees removed; plus the captured `work-health` hook output as `extra`; bare `mx work health` shows every active work, `--all` adds archived) · `archive` (fires `pre/post-work-archive`; removes worktrees, keeps folder + manifest + sessions + branches; recoverable via `unarchive`; prompts for confirmation — pass `--yes`/`-y` to skip; required for `--porcelain` and non-TTY callers) · `unarchive [<worktree>=<branch>...]` (fires `pre/post-work-unarchive`; re-creates worktrees from `work.json`; positional `<worktree>=<branch>` overrides per-worktree when a recorded branch is missing) · `destroy --force` (PERMANENT: deletes the work folder including session summaries; branches still kept). `--base` resolves to a commit SHA (trying the ref, then `origin/<ref>`) so a bare branch name forks correctly; `worktree rm` / `archive` / `destroy` refuse on uncommitted changes; ports are unique across **all** works (no blocks). `archive` flips `isArchived: true` and stamps `archived_at` in `work.json`; `unarchive` clears them. All lifecycle hooks are central (`<runtime>/hooks/<event>`); a `pre-*` non-zero exit aborts the op (`HOOK_FAILED`), a `post-*` non-zero exit only warns — see § Hooks.

**Bin** (runtime-wide utility executables at `<runtime>/bin/`, meant for `PATH`) — `mx bin` (alias `mx bins`): `ls` (list bins with an mx-shipped vs user-added tag, flag non-executable ones, and note whether `bin/` is on `PATH`; porcelain returns `{dir, onPath, bins[]}`) · `path` (print the `bin/` dir for `export PATH="$(mx bin path):$PATH"`). mx ships `dcs`/`lcs` (delete/list Claude Code sessions by name) from `templates/bin/`; shipped bins are **re-stamped (overwritten) on every `init`/`sync`** like the runtime `CLAUDE.md` (so updates land), while **user-added bins are never touched**. To customize a shipped bin, copy it to a new name. Distinct from a work's `scripts/` (per-work). Bare `mx bin` defaults to `ls`.

## Hooks (what they are)

A **hook** is a user-owned script mx runs at a lifecycle moment. As of v3 they're **centralized** in a single `<runtime>/hooks/` directory — **one executable per event**, named exactly for the event (no extension): `pre-worktree-create`, `post-worktree-create`, `pre/post-worktree-remove`, `pre/post-work-archive`, `pre/post-work-unarchive`, `pre/post-repo-fetch`, `repo-health`, and `work-health`. This replaces v2's per-repo `hydrate.sh`/`health.sh` and per-work `hooks/`.

Key properties:

- **Runtime-wide, branch inside.** A hook fires for *every* repo/work, so the user dispatches on context — `case "$MX_REPO" in …`, `if [ "$MX_BRANCH" = … ]`, etc. (e.g. a different hydrate for `web` vs `api`, or only for `release/*` branches).
- **Any language.** A hook is just an executable: bash, Node, Python, anything. Set the shebang (`#!/usr/bin/env node`, `#!/usr/bin/env python3`, …) and keep it executable. Delete the file to disable that event.
- **Context via `MX_*` env.** Always `MX_EVENT` + `MX_RUNTIME`; event-specific vars include `MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_GIT_DIR`. Each shipped template documents its own set and working directory.
- **Semantics.** `pre-*` non-zero exit **aborts** the operation (`HOOK_FAILED`, nothing mutated); `post-*` non-zero is a **warning**; `repo-health` / `work-health` stdout is captured into the `extra` row of `mx repo health` / `mx work health` (cwd = the pristine clone / the work folder). Health hooks follow a **silent-when-healthy** convention: print nothing (or a bare `ok`/`OK`) when fine (renders ✓ `OK`), print the problem when not (renders ⚠ and flags the block).
- **Ownership.** mx stamps a documented no-op per event (`templates/hooks/<event>`), stamp-if-missing; the CLI runner is `apps/cli/src/hooks.ts` and the event list / path helpers (`HOOK_EVENTS`, `hookScript`, `runtimeHooksDir`) are in `@mx/core`.

## Conventions

- **TypeScript pnpm monorepo, zero runtime dependencies.** Both source packages (`@mx/core`, `@mx/cli`) use only `node:` builtins; tsup bundles `@mx/core` into the CLI so the published `@roulabs/mx` package installs no deps. Tooling (tsup, eslint, vitest, prettier) is devDeps only. `@mx/cli` is private; the published thing is the `npm/` folder.
- **Workflow:** `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` (and `pnpm dev` to watch). Add a Vitest test in `packages/core/test` for new core logic.
- **Runtime is env-addressed** (`$MX_RUNTIME` / `--runtime` / `~/mx`); never persist a runtime path in this repo. Dev uses the gitignored `.mx/` runtime.
- **Release:** CI-driven via `.github/workflows/release.yml`. **Every merge to `main` must produce a new release** — the PR bumps `"version"` in `npm/package.json`, and on push to `main` the workflow runs typecheck/lint/test/build, `npm publish`es from `npm/` (auth via the `NPM_TOKEN` automation-token secret), tags `vX.Y.Z`, and creates a GitHub Release. If the version still matches an existing tag, the run **fails** demanding a bump (a merge without a bump is treated as a mistake). One-time setup: add an npm automation token as the `NPM_TOKEN` repo secret (see `docs/release.md`). The local `pnpm release` (`scripts/release.sh`) remains as a **manual fallback** — it verifies npm auth + clean tree + fresh tag + unpublished version, prompts to confirm, then `npm publish --auth-type=web` (browser confirm for 2FA) and pushes the tag. **Gotchas** (npm name similarity rejection on unscoped names; CDN propagation lag on first publish of a new scope; npm has no `org create` CLI command — orgs must be created at https://www.npmjs.com/org/create) are documented in `README.md` § Release.
- Keep `templates/CLAUDE.md` and the CLI's behavior consistent — they're the contract feature sessions rely on. A runtime only sees template changes after `pnpm build` (which copies them into `npm/templates/`) and `mx sync`.

## Status & where to pick up

For a fresh session / new machine:

- **Done and verified:** the full TS pnpm monorepo (`@mx/core` source + `@mx/cli` source + `npm/` publishable package), all commands (`init`, `info`, `sync`, `update`, `migrate`, `repo`, `work` incl. `worktree`/`port`/`path`/`open`), runtime versioning + container repo layout + central hook hub (v3), env-based runtime discovery, templates copied into `npm/templates/` at build time, CI workflow for PR checks, `scripts/release.sh` for local publishing, MIT license, and a consumer README at `npm/README.md`. `pnpm typecheck/lint/test/build` are green; the packed tarball installs via `npm i -g` and runs self-contained from outside the repo. Hosted at `github.com/roulabs/mx`, branch `main`.
- **Shipped:** `@roulabs/mx` is live on npm at https://www.npmjs.com/package/@roulabs/mx (first release `v1.0.0` on 2026-06-04). For the currently-published version, run `git describe --tags --abbrev=0` or check the npm page. End-user install: `npm i -g @roulabs/mx` → `mx` command.
- **Start working:** `pnpm install && pnpm build`, then `export MX_RUNTIME="$PWD/.mx"` and `pnpm mx init`. Iterate with `pnpm dev` (watch) + `pnpm mx ...`; run `pnpm typecheck && pnpm lint && pnpm test` before committing.
- **Next release:** bump `npm/package.json` version in your PR, then merge to `main` — `.github/workflows/release.yml` publishes, tags, and creates the GitHub Release automatically (auth via the `NPM_TOKEN` secret). Forgetting the bump fails the run. `pnpm release` remains a local fallback.
- **Not done yet:** per-runtime support for non-Claude agents (`AGENTS.md` for Codex, `.cursorrules` for Cursor). Optional next idea: isolated per-env state (separate DB schema / container) for safe parallel runs. (`mx open`-style terminal layout shipped in 2.0.0 as `mx work new -o`.)
- **Gotchas already handled in code (keep them):** never run mx against a real runtime — use `/tmp` or `.mx`; the first `pnpm install` on a corp npm mirror is slow, not stuck; `--base` is resolved to a commit SHA with an `origin/<ref>` fallback to avoid git's DWIM overriding `-b`; `inferContext` realpaths both sides so symlinked roots (e.g. macOS `/tmp`) match.
