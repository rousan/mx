# History

What each release brought. Reverse-chronological. Dates reflect when the corresponding tag was pushed.

## 2.4.0 — 2026-06-28

**`mx migrate --dry-run`.** Preview a migration without touching anything. It runs the same up-front chain validation (so an impossible migration still errors `NO_MIGRATION` / `CLI_TOO_OLD`), then prints every path it *would* move, stamp, or create and ends with "No changes were made." — the runtime's `mx.json` version and all files are left exactly as they were. Useful before letting migrate run against an old runtime. Porcelain output carries `"dryRun": true` and the planned paths in `changed`. Implemented by threading a `dryRun` flag through `migrateRuntime` and the underlying `migrateRepoLayout` / `migrateWorkLayout` / `ensureWorkScaffolding` (each guards its mutations but still reports what it would do). New `--dry-run` CLI flag. Minor — no runtime-layout change.

## 2.3.0 — 2026-06-28

**Per-work `bin/` directory.** Every work now gets a `bin/` folder alongside `scripts/`, `files/`, `tmp/`, and `hooks/` — a place for executables and binaries a session builds or downloads (compiled tools, fetched CLIs, helper binaries). It starts empty and is owned by the user/agent; mx just creates the directory. `mx work new` creates it and `mx sync` backfills it (stamp-if-missing) on existing v2 runtimes — no migration or version bump needed, so it ships as a minor. Added by listing `bin` in `ensureWorkScaffolding`; `inferContext` treats it like the other non-`wt/` work subdirs (implies the work, no repo).

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
