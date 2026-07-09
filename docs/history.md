# History

What each release brought. Reverse-chronological. Dates reflect when the corresponding tag was pushed.

## 3.6.1 — 2026-07-09

**`mx divider` renders much larger.** The banner now scales to fill the terminal (chunky letters at the largest cell size the width allows, height grown to match) instead of strict proportional scaling, which left a long label like `IN REVIEWS` tiny on a fullscreen window (7 rows). Also honors `COLUMNS`/`LINES` env vars as a size fallback for non-TTY (piped) output, so you can preview a size without going fullscreen. Renderer-only change in `@mx/core` (`renderBanner`) plus the CLI size fallback.

## 3.6.0 — 2026-07-08

**`mx divider <text> [-o]`** — fill a terminal with `<text>` as large block letters, a visual separator for macOS Mission Control Spaces (e.g. an `IN REVIEWS` / `PR REVIEWS` window between clusters of work windows). Bare, it takes over the current terminal, draws the banner, and holds it (Ctrl-C or `q` to quit); `-o` opens a new fullscreen Terminal running the same banner (macOS). The text auto-scales to fill the terminal and re-renders on resize.

- **Zero-dependency renderer:** a 5x7 block font in `@mx/core` (`renderBanner(text, cols, rows)`) — no `figlet`/`banner` binary needed. The CLI (`divider.ts`) owns the clear/hold/cursor/resize handling; `openFullscreenTerminal` (factored out of `openWorkLayout`) powers `-o`.
- Personal window-organization aid; touches no runtime state. Minor — runtime stays v3, no migration.

## 3.5.0 — 2026-07-06

**Runtime-wide `files/` store.** A new `<runtime>/files/` directory: a free-form place for operational **values** any work session can read — credentials, cluster names/URLs, usernames, API keys/tokens, endpoints, and other key-value meta a task needs to actually operate (a Playwright login, an authenticated API call, an ssh target). Created **empty** by `mx init` and backfilled by `mx sync`; mx only guarantees the directory exists and never reads, writes, or validates its contents — the layout is the agent's/user's to choose.

- **Kept distinct from its neighbours** (documented in the runtime `CLAUDE.md` template + docs): `context/` is indexed *knowledge* (findings, decisions, runbooks); `files/` is the raw *values* you plug in. Runtime `files/` is shared across every work; `works/<work>/files/` stays per-work.
- **Local-only:** mx never commits or transmits it (the runtime root isn't a git repo; `repos/` clones are separate). Storing secrets there is a deliberate local convenience.
- **Code:** `runtimeFilesDir` in `@mx/core`; created in `initRuntime`, backfilled in `syncRuntime`. Minor — runtime stays v3, no migration; existing runtimes get it on the next `mx sync`.

## 3.4.0 — 2026-07-03

**`mx work new` can create initial worktrees.** Positional args after the work name are pristine repos to make worktrees for right away, instead of a separate `mx work worktree add` per repo. Each token is `<repo>[:<branch>[:<base>]]`:

```
mx work new feat app api                                  # app + api, both on branch "feat"
mx work new feat app:hotfix api                           # app on "hotfix", api on "feat"
mx work new feat app api --branch shared                  # both on "shared"
mx work new feat muze-ai:feat:app_ib_dev scaligent:feat:migration-to-mt-service-from-cf   # per-repo base
mx work new feat app::develop                             # default branch, forked from develop
```

- **Per repo:** branch = `:<branch>` → `--branch <b>` (a default for every repo without its own) → the work name; base (fork point) = `:<base>` → `--base <ref>` → the pristine clone's `HEAD`. An empty branch segment (`app::develop`) means "default branch".
- **Validated up front:** an unknown repo or a repo listed twice fails before anything is created, so you never get a half-built work. Each worktree fires `pre/post-worktree-create` (same as `worktree add`); combines with `-o`.
- **Code:** `parseInitWorktreeSpec` + `InitWorktreeSpec` (with `branch`/`base`) in `@mx/core`; a shared `createWorktreeFiringHooks` helper in the CLI (used by both `worktree add` and `work new`). Minor — runtime stays v3, no migration.

## 3.3.0 — 2026-07-03

**`mx work open` is now session-aware — it resumes or creates the work's Claude Code session.** Opening a work (via `mx work open` / `mx work -n <name> open` / `-o`, and `mx work new -o`) no longer just drops you in a Terminal: it follows a per-work naming convention (one session named exactly `<name>`) and does the right thing.

- **Resume-or-create.** mx scans the work's own Claude project dir (`~/.claude/projects/<work-path>/`, keyed off the work folder's realpath) for sessions named `<name>`: **0** → create `claude -n <name>`; **1** → `claude --resume <id>`; **2+** → `MULTIPLE_SESSIONS` error (resume manually — `lcs <name>` then `claude --resume <id>`). The name match is **exact**, so numbered parallel sessions (`<name>-2`, `<name>-3`) are ignored and stay manual.
- **Dynamic initial prompt via a new `session-prompt` hook.** On create, the session is seeded with an initial prompt: `mx work open --prompt <text>` wins, else the central `session-prompt` hook's stdout is used (cwd = work folder; `MX_WORK` / `MX_WORK_PATH` / `MX_SESSION_NAME`), so the prompt can be generated dynamically — a global default, or varied per repo/work. Empty output → clean session. Fires only on create, never on resume.
- **Code:** new `@mx/core` `claudeSessions.ts` (`claudeProjectDirName`, `readSessionTitle`, `findSessionsByName`, `ClaudeSession`); `session-prompt` added to `HOOK_EVENTS` + a stamped no-op template; `runHookCapture` in the CLI; `openWorkLayout` takes a launch command; `--prompt` flag. Minor — runtime stays v3, no migration.

## 3.2.0 — 2026-07-03

**`mx work worktree set-branch <worktree> [<branch>]` — re-record a worktree's branch in `work.json`.** mx never runs `git checkout` for you: you switch branches inside the worktree the normal way, then this command updates the manifest to match. It reads the worktree's **live** git branch (so `work.json` can't drift from reality) and writes only that metadata — no git worktree/checkout operation is performed.

- **Guard argument.** The optional `<branch>` must equal the worktree's actual branch or the command fails with `BRANCH_MISMATCH` — a safety net for "I meant to check out X but forgot". Omit it to record whatever the worktree is on.
- **Errors:** `NO_WORKTREE` (unknown worktree, or not on disk — e.g. an archived work), `DETACHED` (detached HEAD — check out a branch first), `BRANCH_MISMATCH` (guard mismatch).
- **Code:** `worktreeSetBranch` + `WorktreeSetBranchResult` in `@mx/core` (`works.ts`); `set-branch` case in `apps/cli/src/commands/work.ts`. Minor — runtime stays v3, no migration.

## 3.1.1 — 2026-07-01

Docs only — no change to the published CLI or runtime behavior. Adds a
`docs/sessions/` folder with a detailed session log (the 3.0.0 → 3.1.0 work:
health commands, the SessionStart-hook removal, and `mx mission-control`) so a
fresh agent can pick up the project cold. Cut as its own release because the
repo contract bumps the version on every merge to `main`.

## 3.1.0 — 2026-06-30

**`mx mission-control` — a live web dashboard (alias `mx mc`).** Run it to start a local, **read-only** dashboard for the whole runtime and open `http://localhost:7777` (a second monitor works well): a calm, monochrome, auto-refreshing view of every repo's and work's health, plus a consolidated **ports board** (port → url → service → worktree → work, collisions flagged, archived dimmed) for the fast "which work owns which port, give me the URL" lookup.

- **Zero-dependency server.** A hand-written `node:http` server serves a single self-contained HTML page (`/`), a JSON snapshot (`/api/state`), and a **Server-Sent Events** stream (`/api/stream`). It recomputes on a short timer and pushes instantly on manifest changes (`fs.watch` on `works/`, `repos/`, `mx.json`). `--port` walks upward if busy (default 7777); `-o` opens the browser.
- **UI ships as a prebuilt static file.** New private workspace `apps/mission-control/` (React + Vite + Tailwind) builds to one inlined `index.html` (`vite-plugin-singlefile`), copied into `npm/mission-control/` at build time. React/Vite/Tailwind are dev-only — the published `@roulabs/mx` keeps **zero runtime dependencies**. `pnpm build` builds the dashboard before the CLI so the copy step finds `dist/`.
- **Code:** `commands/missionControl.ts` + `paths.ts#missionControlHtml()` in the CLI; `--port` flag; reuses `listRepoHealth` / `listWorkHealth` from `@mx/core`. Read-only — never mutates the runtime. Minor — runtime stays v3, no migration.

Also cleaned two stale references to the removed `mx work worktree hydrate` command / `--no-hydrate` flag in the stamped `templates/` (the `post-worktree-create` hook header and the runtime `CLAUDE.md`).

## 3.0.0 — 2026-06-29

**Hooks are centralized into one runtime-wide hub — a breaking layout change (runtime v3).** The per-repo `hydrate.sh`/`health.sh` and per-work `hooks/` are gone; all lifecycle hooks now live in **`<runtime>/hooks/`**, one executable per event, and you branch on `MX_*` context inside.

- **Events:** `pre/post-worktree-create` (post = the old "hydrate"), `pre/post-worktree-remove`, `pre/post-work-archive`, `pre/post-work-unarchive`, `pre/post-repo-fetch`, `repo-health`, and `work-health`. `pre-*` non-zero exit aborts the operation (`HOOK_FAILED`); `post-*` warns; `repo-health` / `work-health` stdout feeds `mx repo health` / `mx work health`.
- **Any language.** A hook is just an executable — bash, Node, Python — keyed off its shebang. mx stamps a documented no-op per event (stamp-if-missing, so your logic is never clobbered); delete a file to disable that event.
- **Repos** now carry a `repo.json` (`{ "name": … }`, extensible) and **no scripts**. `mx repo add`/`new` write it; the CLI fires hooks around `worktree add`/`rm`, `archive`/`unarchive`, and `repo fetch`.
- **Migration v2 → v3** (`mx migrate`): stamps the `hooks/` hub, writes each `repo.json`, and **retires the old scripts — deleting defaults, but keeping anything you customized with a warning** so you can fold the logic into the central hooks. `--dry-run` previews the plan + warnings.
- **CLI:** new `apps/cli/src/hooks.ts` runner (replaces `hydrate.ts` + `workhooks.ts`); `HYDRATE_FAILED` folded into `HOOK_FAILED`. **Core:** `HOOK_EVENTS` / `hookScript` / `runtimeHooksDir`, `repoConfigFile` / `readRepoConfig` / `writeRepoConfig`, `stampRuntimeHooks` in `@mx/core`; `RUNTIME_VERSION = 3`.

**Multiple worktrees of one repo per work.** Each worktree now has a **`name`** (its `wt/<name>` directory and the `rm`/`port`/unarchive selector), defaulting to the repo name. Pass a distinct name to add several worktrees of the same repo to one work: `mx work -n feat worktree add app app-pr2 --branch fix`. Selectors (`worktree rm`, `port set`, `unarchive <name>=<branch>`) are by worktree name; ports are independent per worktree. `work.json` now always records `name` (uniform shape — `mx migrate` backfills it into existing manifests, `= repo`). Back-compatible: a name-less entry defaults to `repo`, and v2 couldn't hold two worktrees of one repo, so nothing needs moving. New `worktreeName` / `findWorktreeByName` in `@mx/core`; hooks gain `$MX_WORKTREE_NAME`.

**Archive frees ports; unarchive re-hydrates per worktree.** `mx work archive` now clears each worktree's `ports` (the worktrees and their servers are gone, so the numbers become reusable). `mx work unarchive` re-creates the worktrees and fires `post-worktree-create` for **each** one, so the hook re-installs and re-allocates ports exactly like a fresh `worktree add`.

**Dropped `mx work worktree hydrate` and `--no-hydrate`.** With hooks as the source of truth, the dedicated subcommand and flag are redundant: `post-worktree-create` always fires on `worktree add` (make it a no-op to skip), and you re-run it by re-invoking the hook yourself.

**Work health + a whole-runtime overview.** New `mx work health` (and `mx work -n <name> health`) audits a work folder the way `mx repo health` audits a clone — purely local: stray non-mx-native files in the work root, worktrees recorded in `work.json` but missing on disk, cross-work port collisions (which only happen via a hand-edited `work.json`), and archive invariants (an archived work should have its ports freed and worktrees removed). Bare `mx work health` covers every active work; `--all` adds archived. New `mx health [--all]` prints every repo's block followed by every active work's block in one view. Adds the `work-health` central hook (captured as `extra`), `workHealth` / `listWorkHealth` / `WorkHealth` in `@mx/core`, and `commands/health.ts` in the CLI.

**Removed the per-work `SessionStart` context-index hook.** v2 stamped `works/<feature>/.claude/settings.json` with a `SessionStart` hook that printed `context/INDEX.json` into each session, but Claude Code caps hook output (~2KB), so a real index was truncated. v3 drops it: `mx work new`/`mx sync` no longer stamp it, and `mx migrate` removes a default-stamped one (a customized `settings.json` is kept with a warning). Loading the index is now the session's job — the runtime `CLAUDE.md` says to read the whole `INDEX.json` uncapped, and you can say "load the mx ctx index as whole" to force a fresh read. New `isDefaultClaudeSettings()` in the v2 → v3 migration.

After upgrading the CLI (`npm i -g @roulabs/mx@latest`), run **`mx migrate`** once per runtime.

## 2.8.0 — 2026-06-29

**`mx bin ls` spells out the PATH setup.** When `<runtime>/bin/` isn't on your `PATH`, the listing now ends with a clear, multi-line instruction — add `export PATH="$(mx bin path):$PATH"` to your shell startup file (`~/.zshrc`, `~/.bashrc`, …) and restart — instead of a terse one-liner. When it is on `PATH`, it confirms with a ✓. CLI-only cosmetic change.

## 2.7.0 — 2026-06-29

Four changes in one release: a runtime-wide `bin/`, `mx update` auto-syncing, removal of the redundant per-work `bin/`, and `-o` opening only the Terminal.

**Runtime-wide `bin/` for utility executables.** New **`<runtime>/bin/`** — a single directory of utility executables shared across every work, meant to be on your `PATH`. mx ships `dcs` (delete a Claude Code session by `/rename` name or id) and `lcs` (list all Claude Code sessions) from the CLI's bundled `templates/bin/`. Shipped bins are **mx-owned: re-stamped (overwritten) on every `mx init`/`mx sync`**, like the runtime `CLAUDE.md`, so improvements ship to you automatically; **your own bins are never touched** (to customize a shipped one, copy it to a new name). New **`mx bin`** (alias `mx bins`): `mx bin ls` lists every bin tagged `built-in` vs `user`, flags non-executable ones, and reports whether `bin/` is on `PATH`; `mx bin path` prints the directory for `export PATH="$(mx bin path):$PATH"`. New `runtimeBinDir` / `listRuntimeBins` and `stampRuntimeBins` in `@mx/core`, `commands/bin.ts` in the CLI.

**`mx update` now auto-runs `mx sync`.** After a successful in-major self-update, `mx update` shells out to the freshly-installed global `mx` to run `mx sync`, so the runtime immediately picks up the new version's templates and scaffolding (runtime `CLAUDE.md`, shipped `bin/`, etc.). Best-effort — a sync failure prints a hint rather than failing the update; in `--porcelain` mode the sync runs silently. Nothing happens when you're already on the latest in-major version.

**Removed the per-work `bin/`** added in 2.3.0 — it was redundant with each work's `scripts/`. New works no longer get a `bin/`; `ensureWorkScaffolding` dropped it. Existing per-work `bin/` directories are left exactly as they are — `mx sync` neither creates, touches, nor deletes them.

**`-o`/`--open` now opens only the Terminal.** Previously `mx work new -o`, `mx work open`, and `mx repo new --quick -o` launched a fullscreen Terminal **and** a fullscreen editor (Cursor → VS Code) on the work's `.code-workspace`. The editor launch is dropped — `-o` just opens a fullscreen Terminal `cd`'d into the work folder; open your editor yourself. The `.code-workspace` file is still generated, so you can open it whenever you like. `openWorkLayout` lost its `workspace` parameter.

Minor — no runtime-layout change.

## 2.5.0 — 2026-06-28

**`mx repo new` — create a local repo, no remote.** The counterpart to `mx repo add` for quick experiments and throwaway apps you don't want to push anywhere: `mx repo new <name>` runs `git init` on `main`, writes a starter `README.md`, makes an initial commit (so `main` exists and worktrees can fork from it), and stamps the per-repo `hydrate.sh`/`health.sh` — removing the manual `mkdir` + `git init` + commit dance. The commit uses your git identity, falling back to a neutral `mx <mx@localhost>` only when none is configured.

`--quick` turns it into a **one-shot quick-start**: it also creates a `dev-<name>` work, adds a worktree of the repo on the `develop` branch, and runs hydrate — pair with `-o` to open the Terminal + editor layout. So a fresh experiment is one line: `mx repo new exp --quick -o` (→ repo `exp`, work `dev-exp`, worktree on `develop`). Because the pristine clone holds `main` (git won't check a branch out twice), the worktree forks `main` onto `develop`; the pristine stays on `main` so `mx repo health` stays clean. New `--quick` CLI flag; `repoNew` in `@mx/core`. Minor — no runtime-layout change.

## 2.4.0 — 2026-06-28

**`mx migrate --dry-run`.** Preview a migration without touching anything. It runs the same up-front chain validation (so an impossible migration still errors `NO_MIGRATION` / `CLI_TOO_OLD`), then prints every path it *would* move, stamp, or create and ends with "No changes were made." — the runtime's `mx.json` version and all files are left exactly as they were. Useful before letting migrate run against an old runtime. Porcelain output carries `"dryRun": true` and the planned paths in `changed`. Implemented by threading a `dryRun` flag through `migrateRuntime` and the underlying `migrateRepoLayout` / `migrateWorkLayout` / `ensureWorkScaffolding` (each guards its mutations but still reports what it would do). New `--dry-run` CLI flag. Minor — no runtime-layout change.

## 2.3.0 — 2026-06-28

**Per-work `bin/` directory.** _(Reverted in 2.7.0 — redundant with `scripts/`.)_ Every work now gets a `bin/` folder alongside `scripts/`, `files/`, `tmp/`, and `hooks/` — a place for executables and binaries a session builds or downloads (compiled tools, fetched CLIs, helper binaries). It starts empty and is owned by the user/agent; mx just creates the directory. `mx work new` creates it and `mx sync` backfills it (stamp-if-missing) on existing v2 runtimes — no migration or version bump needed, so it ships as a minor. Added by listing `bin` in `ensureWorkScaffolding`; `inferContext` treats it like the other non-`wt/` work subdirs (implies the work, no repo).

## 2.2.0 — 2026-06-28

**Per-work lifecycle hooks for archive/unarchive.** Each work now has a `hooks/` folder with four mx-stamped, executable **no-op** scripts: `pre-archive.sh`, `post-archive.sh`, `pre-unarchive.sh`, `post-unarchive.sh`. mx runs them around `mx work archive` / `mx work unarchive`:

- A **`pre-*`** hook runs before anything is mutated (worktrees still on disk for archive; none yet for unarchive). A non-zero exit **aborts** the operation with the new error code `HOOK_FAILED` — a veto point (e.g. block archive when a branch has unpushed commits).
- A **`post-*`** hook runs after the operation succeeds; a non-zero exit is a warning only.

Each runs with the work folder as cwd and gets context via positional args (`$1` event, `$2` work path) and env vars (`MX_EVENT`, `MX_WORK`, `MX_WORK_PATH`, `MX_RUNTIME`). The scripts are mx-owned but user-editable; `mx work new` stamps them, and `mx sync` backfills `hooks/` (stamp-if-missing) on any existing v2 runtime — **no migration or version bump needed**, so this ships as a minor. New: `WORK_HOOK_EVENTS` / `workHooksDir` / `workHookScript` in `@mx/core`, the CLI runner `apps/cli/src/workhooks.ts`, and the `HOOK_FAILED` error code.

## 2.1.1 — 2026-06-28

Docs/comment cleanup only — no behavior change. Fixed lingering `mx status` references (renamed to `mx info` in 2.1.0) in code comments and the CLAUDE.md command list, and corrected `docs/architecture.md`'s stale "no release workflow" claim (the CI release workflow has existed since 2.0.0).

## 2.1.0 — 2026-06-28

CLI surface polish (runtime stays v2, no migration):

- **`mx status` → `mx info`** (alias `mx i`). Renamed for consistency with `repo info` / `work info`. The old `status`/`s`/`st` are removed — a **breaking CLI change**, but the runtime layout is unchanged, so per mx's "major = runtime-layout version" rule it ships as a minor.
- **`mx info` shows more.** Header now includes the runtime version (`mx vN`); the repos and works sections show each entry's path; porcelain gains a top-level `version` field; the works-section `(N active, M archived)` count suffix was dropped.
- **`mx repo ls`** restyled to match `mx work ls` (bold name / dim path / dim `branch  remote`, blank line between).
- **`mx repo -n <name> path`** — print the repo container path (for shell substitution), mirroring `mx work … path`.
- **`mx work -n <name> open`** (and `-o`) — open an existing work's fullscreen Terminal + editor layout (the same thing `mx work new -o` does at creation).
- **`mx repo fetch`** now fast-forwards **both** the checked-out and base (origin default) branch, so a worktree forked from the base isn't stale. **`mx repo fetch --all`** (or `mx repo --all fetch`) fetches every repo one by one, continuing past individual failures.

## 2.0.0 — 2026-06-27

**Runtime versioning + container repo layout — the first major.** Several intertwined changes that together cross to runtime **v2**:

- **Runtime versioning.** A new `<runtime>/mx.json` file holds the layout version (`2`; absent = legacy v1). The CLI supports exactly one runtime version, mapped **CLI major ⇄ runtime version**. A **version gate** now precedes every runtime-touching command: on a mismatch it refuses with `RUNTIME_VERSION_MISMATCH` and points at `mx migrate`. The only commands allowed on a mismatched runtime are `mx migrate`, `mx update`, `mx help`, `mx version`. `mx init` stamps `mx.json` on a fresh runtime and refuses to adopt one whose version differs.
- **Container repo layout.** Pristine clones moved from a flat `repos/<repo>/` to `repos/<repo>/git/`, with the container also holding per-repo scripts. `mx repo ls`/`info`/`health` report the container path.
- **Work-folder restructure.** A work's worktrees moved from flat (`works/<work>/<repo>`) into `works/<work>/wt/<repo>`, and the work folder gained a stamped-once-then-user-owned `CLAUDE.md` (loads alongside the runtime `CLAUDE.md` for work-specific rules) plus three scratch dirs: `scripts/` (ad-hoc scripts), `files/` (keepable artifacts), `tmp/` (throwaway, deletable any time). The work-folder root is now reserved for mx-native files — sessions/users put non-mx files in `files/`/`tmp/`/`scripts/`, never the root. `.code-workspace` folder entries now point at `wt/<repo>` (name stays the repo name); `inferContext` reads the repo from the `wt/<repo>` segment.
- **`mx update` → `mx sync` (rename).** The old re-stamp command is now `mx sync` (header "Synced runtime at …"); same behavior plus it backfills per-repo `hydrate.sh`/`health.sh`, the per-work scaffolding (`wt/`/`scripts/`/`files/`/`tmp/`/`sessions/`), the per-work `CLAUDE.md`, and per-work `.claude/settings.json` (all stamp-if-missing). **`mx update` is now a new command** that self-updates the CLI within its major (`npm i -g @roulabs/mx@^<major>`), detects a newer major and suggests the deliberate upgrade, and is *not* version-gated.
- **`mx migrate` (new).** Upgrades an older runtime up to the supported version; validates the whole chain before mutating (`NO_MIGRATION` on a gap, `CLI_TOO_OLD` if the runtime is newer). The v1 → v2 step upgrades **both** layouts: it moves clones into `git/` (`git worktree repair`) **and** restructures every work — moving flat worktrees into `wt/` (`git worktree move`), creating the new scratch dirs, stamping the work `CLAUDE.md`, and rewriting the `.code-workspace` folder paths to `wt/<repo>`.
- **Per-repo scripts (new).** `repos/<repo>/hydrate.sh` runs automatically after `worktree add` (cwd = new worktree; positional `$1`/`$2` + `MX_*` env; non-zero = warning); `--no-hydrate` skips it and `mx work … worktree hydrate <repo>` re-runs it (`HYDRATE_FAILED` on non-zero). `repos/<repo>/health.sh` augments `mx repo health` via a captured `extra` field, never affecting `healthy`/`issues`.
- **Per-work context-index hook (new).** `mx work new` / `mx sync` generate `works/<feature>/.claude/settings.json`, a Claude Code `SessionStart` hook that loads `context/INDEX.json` into every session launched in the work folder.
- **`mx work new -o` / `--open` (macOS).** Opens a fullscreen Terminal in the work folder plus a fullscreen editor (Cursor → VS Code) on the workspace; non-macOS downgrades to a warning (`UNSUPPORTED`). `mx work -n <name> open` (and `-o`) does the same for an existing work.
- **`mx status` → `mx info` (rename).** The runtime overview is now `mx info` (alias `mx i`; the old `mx s`/`mx st` aliases removed), consistent with `repo info`/`work info`. Its header shows the runtime version (`mx vN`); the repos and works sections show each entry's path; `mx repo ls` adopts the same clean shape as `mx work ls`; the works-section count suffix was dropped. Adds `mx repo -n <name> path` and a top-level `version` field to the porcelain output.
- **Listing paths.** `mx work ls` and `mx repo ls` show the folder path (human collapses `$HOME` to `~`; porcelain adds an absolute `path` field).
- **`mx repo fetch`** now fast-forwards **both** the checked-out and base (origin default) branch, so a worktree forked from the base isn't stale; `mx repo fetch --all` (or `mx repo --all fetch`) fetches every repo one by one.
- **New error codes:** `RUNTIME_VERSION_MISMATCH`, `CLI_TOO_OLD`, `NO_MIGRATION`, `BAD_VERSION`, `HYDRATE_FAILED`, `UNSUPPORTED`, `OSASCRIPT`.

**Breaking:** the on-disk runtime layout changed (clones moved to `git/`; each work's worktrees moved to `wt/<repo>`) — existing runtimes must run `mx migrate` after upgrading the CLI, which restructures both repos and works in one step; `mx update` no longer means "re-stamp" (that's `mx sync` now).

## 1.11.0 — 2026-06-12

**Documented the self-hosting pattern in both CLAUDE.md files.** Source CLAUDE.md gained a "## Self-hosting" section covering the dogfooding setup, the two-binary distinction (global `mx` for productive operations, `pnpm mx` for testing-only sandbox use), and direnv convention. Runtime CLAUDE.md template's "What this runtime is for" now lists two valid setups — mx-source elsewhere (default) or hosted as a work in this runtime — and names the rule that still applies under self-hosting: never run the worktree's locally-built CLI against this runtime, use a sandbox. Pure docs; no code. Minor bump because the runtime template change requires a `mx update` to propagate.

*(Note: this release commit landed on the `improve-mx` feature branch, not `main`, due to working from a self-hosted worktree. Not yet shipped to npm at the time of writing — release pending.)*

## 1.10.1 — 2026-06-12

**Fixed the archive prompt aborting immediately on macOS.** 1.10.0 used `fs.readSync(0, …)` to read the y/N answer; on macOS that returns EAGAIN immediately because Node leaves stdin in non-blocking mode in certain TTY conditions. Switched to `spawnSync('/bin/sh', ['-c', "IFS= read -r REPLY && printf '%s' \"$REPLY\""])`. The shell `read` builtin blocks on TTY correctly across macOS and Linux.

## 1.10.0 — 2026-06-12

**`mx work archive` prompts for confirmation.** Instead of just printing a warning and proceeding, archive now asks `Proceed? (y/N)` first. Only `y` / `yes` proceeds; anything else aborts cleanly with `Aborted.` (exit 0). New `--yes` / `-y` flag skips the prompt; **required** when stdin isn't a TTY or with `--porcelain` (mx errors with code `NEED_CONFIRMATION` otherwise). Breaking for scripts calling archive non-interactively — they must add `--yes`.

## 1.9.0 — 2026-06-08

**`mx status` and `mx work ls` default to active works only.** Archived works are hidden unless `--all` is passed. `--archived` (ls-only) still filters to archived-only. `--all` flag re-added (it was removed in 1.3.1). `StatusResult` gains `archivedWorksCount: number` so the works section header can show `(4 active, 2 archived — pass --all to show)` even when archived are hidden. **Breaking for porcelain consumers:** the JSON output now respects the filter too (archived excluded by default).

## 1.8.0 — 2026-06-12

**`mx repo health` — purely local health checks on pristine clones.** New command, two modes:
- `mx repo health` — list mode, one line per repo with `✓`/`⚠` prefix and issue summary
- `mx repo -n <name> health` — detail mode, structured per-metric block with aligned markers

Checks: on-default-branch, uncommitted changes, untracked files, ahead/behind origin (against last-fetched state), last-fetched age, worktrees-in-works. No network — purely local; run `mx repo -n <name> fetch` first for fresh "behind" numbers. Exits 0 always (read-only convention).

## 1.7.1 — 2026-06-08

**Archived work names render dim + bullet list markers.** In list/status views, archived work names lose their bold weight (active names stay bold, archived recede with dim). Adds `•` bullet markers before repo and work names in `mx status`, `mx work ls`, and `mx repo ls`. The `(4)` count after the `repos` section header in `mx status` dropped — bullets self-count.

## 1.7.0 — 2026-06-08

**Monochrome CLI**, per-work counts dropped. Removed `cyan` / `green` / `yellow` / `red` helpers from `output.ts`. Only `bold` + `dim` weight changes remain. `✓` and `⚠` survive as plain glyphs (shape carries the semantic). The `mx:` error prefix is now bold instead of red. Per-work `N worktrees / N sessions` counts dropped from `mx work ls` and `mx status` — the worktree rows themselves are the indicator. Section-level summary counts stay (`repos (4)`, `works (4 active, 2 archived)`, `context (4)`).

## 1.6.1 — 2026-06-07

**Worktree repo names cyan to match branches.** Under each work, the worktree repo name (e.g. `app`, `worker`) used to be plain text; now cyan, matching the cyan branch brackets next to it. Visually subordinates to the bold work name. Also fixed inconsistency: `mx status` rendered branch brackets dim while `mx work ls` / `mx work info` had them cyan — aligned to cyan everywhere. *(Reverted in 1.7.0 when color was removed entirely.)*

## 1.6.0 — 2026-06-06

**`mx work ls` shows full per-work detail.** Was a single compact line per work; now a per-work block with bold name + chip + worktree count + session count, dim em-dash description, indented worktree rows with branches + ports. `WorkSummary` unified with `StatusWork` to `Work & { sessions: number }`. **Small breaking porcelain change**: `works[i].worktrees` was a number (count), now an array of Worktree objects (plus new `works[i].sessions` field). Scripts reading the count should switch to `worktrees.length`.

## 1.5.0 — 2026-06-06

**Semantic color across every human-facing command.** Three new color helpers (`green`, `yellow`, `red`) plus `check()` / `warn()` symbols. `mx:` error prefix went red on stderr. Bold for primary identifiers, dim for low-priority metadata, cyan for accent IDs, green for ✓, yellow for ⚠, red for errors. `mx work info` switched from raw JSON dump to a structured block in human mode. *(Largely reverted in 1.7.0 — see above.)*

## 1.4.1 — 2026-06-06

**Active works first, archived after** in `mx status` and `mx work ls`. Within each group, alphabetical. Was alphabetically-interleaved.

## 1.4.0 — 2026-06-06

**`mx status` surfaces context entries + per-work sessions.** New `context (N entries)` section between mx header and repos. Each work line shows `N sessions` count. Aligned columns reserve a fixed-width slot for the archived chip across all rows. Additive porcelain JSON fields: `context.entries`, `works[i].sessions`.

## 1.3.2 — 2026-06-06

**More breathing room in `mx status`.** Blank line between works in the works section. Worktree rows indent 4 spaces deeper than the parent work name (was 2) for clearer hierarchy.

## 1.3.1 — 2026-06-06

**`mx work ls` shows all by default; drop `--all` flag.** Default became "show every work, mark archived" (was active-only). `--archived` retained as the archived-only filter. Move the chip from before the work name to after, matching `mx status`. *(Re-reverted in 1.9.0 — defaults flipped back to active-only.)*

## 1.3.0 — 2026-06-06

**Redesigned `mx status` UI + shortcut aliases.** Sectioned (repos / works), aligned columns, bold section titles, dim metadata, cyan ports, archived chip. ANSI helpers (`dim`/`bold`/`cyan`) gated on `stdout.isTTY && !NO_COLOR`. New aliases `mx s` and `mx st` for `mx status`.

## 1.2.2 — 2026-06-06

**`mx update` backfills per-work scaffolding non-destructively.** Now iterates every work and creates `<work>/sessions/` if missing — backfills the v1.2.0 feature for pre-existing runtimes. Single helper `ensureWorkScaffolding(root, name)` in `@mx/core` so future per-work or per-repo additions slot in cleanly.

## 1.2.1 — 2026-06-05

**INDEX.json reads are unconditional.** Runtime CLAUDE.md context-registry section now says reading `INDEX.json` is a hard rule on every task, trivial or not. The "read everything" fallback is no longer gated on registry size — when in doubt, better than guessing.

## 1.2.0 — 2026-06-05

**`mx work archive` / `unarchive`, `destroy --force`, per-work `sessions/`.** Soft-delete lifecycle for works: archive removes worktrees but keeps folder + manifest + sessions + branches; unarchive re-creates worktrees (with optional `repo=branch` overrides). `mx work destroy` hardened to require `--force`. `work.json` gains `isArchived` + `archived_at`. New `<work>/sessions/` folder pre-created on `mx work new`. Runtime CLAUDE.md template gains a `## Session summaries` section with the single-trigger protocol (user explicit ask at end-of-session only).

## 1.1.1 — 2026-06-05

**Documented the context registry read latitude + explicit write triggers** in the runtime CLAUDE.md template. Read section reframed: INDEX is primary surface but agent has full latitude (grep, recursive ls, follow related chains). New "When and what to write" section with three triggers (user asks; mid-session discovery propose-and-confirm; end-of-session synthesis).

## 1.1.0 — 2026-06-05

**Context registry: INDEX.json-driven runtime memory.** New `<runtime>/context/` folder. `INDEX.json` is the single source of truth for entry metadata (closed schema: `path`, `description`, `type`, `tags`, `related`, `last_verified`); body files at `context/<path>.md` hold only prose. `mx init` stamps the starter empty array; `mx update` stamps it only if missing.

## 1.0.2, 1.0.1, 1.0.0 — 2026-06-05

**Initial publish + early fixes.** 1.0.0 was the first npm publish (under `@roulabs/mx` after `mxcli` was rejected for similarity to `mx-cli`). 1.0.1 fixed `mx version` to read from `package.json` at startup instead of a hardcoded literal. 1.0.2 was a docs-only republish to surface the release-flow gotchas in the npm package page.

## Pre-1.0 (in this thread's source history)

- **Restructured into `/npm` (publishable) + `/apps/cli` (source-only)** — separated publish artifacts from source.
- **`/templates` promoted to repo root** (out of `apps/cli/templates/`) — runtime assets are pure content, not code.
- **`mx init` prints contextual `$MX_RUNTIME` setup hints** — three branches for "already set", "default location", or "needs export".
- **Switched from CI-driven publish (.github/workflows/release.yml) to local `pnpm release`** — no NPM_TOKEN secret to rotate every 90 days.
- **Renamed `mx-multiplexer` → `mxcli` → `@roulabs/mx`** as we hit npm's similarity heuristic.

## Roadmap / not done yet

- Per-runtime support for non-Claude agents (templates for `AGENTS.md` for Codex, `.cursorrules` for Cursor, etc.) — the storage layer is already agent-agnostic; the instruction-file layer is the per-agent adapter
- Optional: isolated per-env state (separate DB schema / container) for safe parallel runs
- Release script could refuse to release from a non-`main` branch (or push to main explicitly when on a feature branch) — see the [release](release.md) "gotcha 5"

*(Done in 2.0.0: terminal + editor layout — shipped as `mx work new -o` / `--open` on macOS.)*
