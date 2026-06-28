# Command reference

Every command supported by `mx`, with flags, semantics, and examples.

## Global

### `mx init [path]`

Scaffold or adopt a runtime. Target resolution: positional `path` arg → `$MX_RUNTIME` → `~/mx`.

Creates: `repos/`, `works/`, `.mx-root`, `mx.json` (stamped with the runtime version this CLI supports), `CLAUDE.md` (stamped), `context/INDEX.json` (only if missing). Idempotent.

On a fresh runtime, `mx init` stamps `mx.json` with the runtime version this CLI supports (currently `2`). When adopting an existing runtime, it refuses if that runtime's `mx.json` differs from what this CLI supports — pointing you at `mx migrate` (if the runtime is older) or at upgrading the CLI (if the runtime is newer). See [Runtime versioning](#runtime-versioning).

Prints a contextual hint about `$MX_RUNTIME`:
- If `$MX_RUNTIME` already points at this runtime: confirms you're set.
- If the target is the default `~/mx` and `$MX_RUNTIME` is unset: notes that no setup is needed.
- Otherwise: gives the `export MX_RUNTIME="…"` line to add to your shell config.

### `mx status [--all] [--porcelain]` (aliases: `mx s`, `mx st`)

Show the runtime overview: path + version, context entry count, repos, works. The header shows the runtime layout version (`mx vN`); repos and works each show their folder path (home-collapsed to `~`). Porcelain output includes a top-level `version` field.

By default shows **active works only**; pass `--all` to include archived. The works section header still says `(N active, M archived)` even when archived are hidden so you know they exist.

Layout:

```
  mx v2 · /Users/rousan/mx

  context  (4)

  repos
    • analytics
        ~/mx/repos/analytics
        main  git@github.com:acme/analytics.git

    • app
        ~/mx/repos/app
        main  git@github.com:acme/app.git

  works  (4 active, 2 archived — pass --all to show)
    • auth-rotation
        ~/mx/works/auth-rotation
        (no worktrees)

    • checkout-revamp
        ~/mx/works/checkout-revamp
        app     [checkout-flow]  web:3000  api:3001
        worker  [checkout-flow]  billing-worker:3002

    …
```

Monochrome: bold for section titles + active work names; dim for everything else. Archived work names are dim. Ports rendered as `service:port`.

### `mx sync`

Re-sync the runtime with the current mx version (this is the command formerly called `mx update`). **Non-destructive — user data is never touched.** It is same-major and subject to the [version gate](#runtime-versioning). Specifically:

- re-stamps `<runtime>/CLAUDE.md` from `templates/CLAUDE.md` (always rewritten, mx-owned)
- stamps `<runtime>/context/INDEX.json` **only if missing** (existing index content is preserved)
- backfills mx-owned structural directories across every work — `<work>/wt/`, `scripts/`, `files/`, `tmp/`, and `sessions/` for any work that pre-dates that scaffolding
- stamps the per-work `CLAUDE.md`, **stamp-if-missing** (stamped once, then user-owned — see [The work folder](runtime-model.md#the-work-folder))
- backfills per-repo `hydrate.sh` / `health.sh` in each repo container, **stamp-if-missing** and executable (see [Per-repo scripts](#per-repo-scripts))
- generates each work's `.claude/settings.json` context-index hook, **stamp-if-missing** (see [Per-work context-index hook](#per-work-context-index-hook))
- removes a stale `<runtime>/README.md` if one lingers (legacy cleanup)

Output enumerates every path actually written:

```
✓ Synced runtime at /Users/rousan/mx
  + /Users/rousan/mx/CLAUDE.md
  + /Users/rousan/mx/repos/app/hydrate.sh
  + /Users/rousan/mx/works/old-feat/sessions
  + /Users/rousan/mx/works/old-feat/.claude/settings.json
```

### `mx update`

**Self-update the CLI** — not the runtime. Re-installs `@roulabs/mx` within its current major via `npm i -g @roulabs/mx@^<major>`, picking up the latest same-major release.

It also checks whether a newer **major** exists. If so, it prints a suggestion to cross the major deliberately:

```
A newer major is available: @roulabs/mx@3.
  npm i -g @roulabs/mx@3
  mx migrate
```

Crossing a major is always a deliberate user action — `mx update` never does it automatically (a new major implies a runtime migration). `mx update` is **not** subject to the version gate: you may need it precisely because your runtime is a newer major than the CLI on `$PATH`. If `npm` is missing or the install fails, it prints the manual command for you to run instead.

### `mx migrate`

**Upgrade an older runtime** to the version this CLI supports. This is the only runtime-touching command allowed when the runtime's `mx.json` doesn't match (see [Runtime versioning](#runtime-versioning)).

It validates the **full migration chain** (`v_current → … → supported`) *before* mutating anything:

- errors `NO_MIGRATION` if any step in the chain has no registered migration
- errors `CLI_TOO_OLD` if the runtime is **newer** than this CLI supports (upgrade the CLI with `mx update` instead)
- a friendly no-op if the runtime is already at the supported version

The registered **v1 → v2** step upgrades **both** the repo and work layouts in one pass:

- moves each pristine clone from `repos/<repo>/` into `repos/<repo>/git/` and runs `git worktree repair` so existing worktrees relink to the moved clone;
- restructures every work — moves its flat worktrees from `works/<work>/<repo>` into `works/<work>/wt/<repo>` (via `git worktree move`), creates the new `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` folders, stamps the work `CLAUDE.md`, and rewrites the `.code-workspace` folder paths to `wt/<repo>`.

### `mx help`, `mx version` (or `--help` / `-h`, `--version` / `-v`)

Print help text or version (read from `<pkg>/package.json` at startup). Allowed even when the runtime version doesn't match.

## Runtime versioning

A runtime carries its layout version in `<runtime>/mx.json` — an integer (currently `2`). An **absent** `mx.json` file means a legacy **v1** runtime.

This CLI supports a single runtime version (`RUNTIME_VERSION = 2`), and the mapping is fixed: **CLI major version ⇄ runtime version** (CLI 2.x supports runtime v2, CLI 3.x will support v3, …).

**The version gate.** Before any runtime-touching command runs, mx compares the runtime's `mx.json` to the version it supports. On a mismatch it **refuses** the command with error code `RUNTIME_VERSION_MISMATCH` and points you at `mx migrate`. The only commands allowed on a mismatched runtime are:

- `mx migrate` — upgrades the runtime (the fix for an older runtime)
- `mx update` — self-updates the CLI (the fix for a newer runtime; doesn't touch the runtime)
- `mx help`, `mx version` — informational

A malformed `mx.json` file errors with `BAD_VERSION`.

## Repos (pristine clones)

Each repo lives in a **container** at `<runtime>/repos/<repo>/`, holding the pristine clone at `git/` plus mx-owned per-repo scripts (`hydrate.sh`, `health.sh`). The commands below report the repo `path` as the container (`repos/<repo>`), not the inner git dir.

### `mx repo add <git-url> [--name <n>]`

Clone a repo into its container at `<runtime>/repos/<repo>/git/`. The only command that clones. Name is derived from the URL (last segment minus `.git`) unless `--name` overrides.

Also stamps the per-repo scripts `hydrate.sh` and `health.sh` into the container (see [Per-repo scripts](#per-repo-scripts)).

### `mx repo ls [--porcelain]`

List all pristine clones in the same clean shape as `mx work ls`: bold name, dim container path, dim `branch  remote`, a blank line between entries. Human output collapses `$HOME` to `~`; porcelain adds an absolute `path` field per repo.

```
• analytics
  ~/mx/repos/analytics
  main  git@github.com:acme/analytics.git

• app
  ~/mx/repos/app
  main  git@github.com:acme/app.git
```

### `mx repo -n <name> path`

Print the absolute path to the repo's container (`repos/<repo>`). Plain output, for shell substitution: `cd "$(mx repo -n app path)"`. Errors `NO_REPO` if the repo doesn't exist.

### `mx repo -n <name> fetch`

Run `git fetch --all --prune --tags`, then best-effort fast-forward **only the currently checked-out branch** (not the base/default branch, not any other branch). Reports the branch and the list of branches now on origin.

### `mx repo -n <name> info [--porcelain]`

Detail block for one repo: name, path (the container `repos/<repo>`), current branch, remote URL, and which works currently hold a worktree of it.

### `mx repo health [--porcelain]` / `mx repo -n <name> health [--porcelain]`

Purely-local health check. **No network, no fetch.** Surfaces drift from the expected "checked-out on default branch, clean working tree, in sync with origin" state.

**Checks**: default branch (from `origin/HEAD` symbolic ref, set at clone time), current branch, uncommitted changes, untracked files, ahead/behind origin/<branch> (compared against last fetch), last-fetched timestamp (`.git/FETCH_HEAD` mtime), worktrees-in-works.

These structured checks are mx's built-in **typed source of truth** for repo health. In addition, `mx repo health` now also runs the repo's `health.sh` hook (if any) and captures its stdout into a separate `extra` field — see [Per-repo scripts](#per-repo-scripts). A missing, empty, or failing hook yields `extra: null` and never affects `healthy` / `issues`.

**List mode** (no `-n`): one line per repo with ✓/⚠ at the start, issues summarized inline:

```
⚠ analytics      2 untracked files
✓ app          
⚠ web-marketing  1 commit behind origin/main
✓ worker       
```

**Detail mode** (`-n <name>`): structured per-metric block with ✓/⚠ markers aligned in a column:

```
worker
  default branch      main        
  current branch      main          ✓
  uncommitted         0 changes     ✓
  untracked           0 files       ✓
  ahead of origin     0 commits     ✓
  behind of origin    1 commit      ⚠  run `mx repo -n worker fetch`
  last fetched        2 hours ago    
  worktrees in works  1                used by: checkout-revamp

  health.sh
    <captured stdout of the repo's health.sh, if it produced any>
```

The `health.sh` section appears only when the hook produced output. In porcelain, the captured output is the string field `extra` (or `null`).

**Exit code is 0** even when issues are found (read-only convention). To refresh the "behind" numbers against actual origin, run `mx repo -n <name> fetch` first.

### `mx repo -n <name> rm`

Remove the repo container (clone + scripts). Refuses with `IN_USE` if any work still has a worktree of it.

## Per-repo scripts

Each repo container holds two mx-owned-but-user-customizable hooks: `repos/<repo>/hydrate.sh` and `repos/<repo>/health.sh`. Both are stamped on `mx repo add` and backfilled by `mx sync` — always **stamp-if-missing** and executable, so your edits are preserved.

### `hydrate.sh` — runs after `worktree add`

Default body just `echo "Setup is done"`. It runs **automatically after** `mx work … worktree add <repo>`, with the **new worktree as the working directory**. Context is passed both ways:

- **positional args**: `$1` = worktree path, `$2` = branch
- **env vars**: `MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_RUNTIME`

A non-zero exit during automatic post-`worktree add` execution is a **warning** — the worktree is kept.

Typical uses: copy a `.env`, allocate a port with `mx work … port set` and wire it into config, install dependencies.

- Pass `--no-hydrate` to `worktree add` to skip running it.
- Re-run it on demand with `mx work -n <name> worktree hydrate <repo>` (see below) — in that explicit mode, a non-zero exit errors with `HYDRATE_FAILED`.

### `health.sh` — augments `mx repo health`

Default is a documented no-op (no output). When present and producing output, its stdout is captured into the `extra` field of `mx repo health` (shown as a `health.sh` section in detail view). It runs with the **git clone** as cwd; env: `MX_REPO`, `MX_REPO_PATH`, `MX_GIT_DIR`, `MX_RUNTIME`. A missing / empty / failing hook yields `extra: null` and never affects `healthy` / `issues`.

## Works (features)

### `mx work new <name> [--description <text>] [--open|-o]`

Create a new work: folder under `works/<name>/`, empty `work.json`, empty `.code-workspace`, the per-work directories `wt/` (where worktrees go), `scripts/`, `files/`, `tmp/`, and `sessions/`, the work `CLAUDE.md` (stamped once with an explanatory comment, then yours to edit — see [The work folder](runtime-model.md#the-work-folder)), and `.claude/settings.json` (the per-work context-index hook — see [Per-work context-index hook](#per-work-context-index-hook)). Prints the absolute path. All of these are **stamp-if-missing**.

The name is immutable.

**`--open` / `-o` (macOS only)**: after creating the work, opens a fullscreen Terminal `cd`'d into the work folder plus a fullscreen editor (Cursor, falling back to VS Code) on the work's `.code-workspace`. You merge the two windows into Split View by hand. On non-macOS platforms this is downgraded to a warning (internally `UNSUPPORTED`) — the work is still created.

### `mx work ls [--all|--archived] [--porcelain]`

Detailed listing of works. Default: **active only**. `--all` includes archived. `--archived` filters to archived only.

Per-work block: bullet + work name (dim when archived), optional `[archived YYYY-MM-DD]` chip, the work folder path (human output collapses `$HOME` to `~`; porcelain adds an absolute `path` field per work), description (em-dash subtitle if present), indented worktree rows with branches + ports:

```
• checkout-revamp  ~/mx/works/checkout-revamp
  — Stripe + Adyen multi-PSP rollout
  app     [checkout-flow]  web:3000  api:3001
  worker  [checkout-flow]  billing-worker:3002

• legacy-csv-export  [archived 2026-06-07]  ~/mx/works/legacy-csv-export
  — ad-hoc CSV exports for finance team
  analytics  [legacy-export-2024]
```

Active works first, archived after. Blank line between works.

### `mx work -n <name> info [--porcelain]`

Detail block for one work: name, description, worktree count, and indented worktree rows.

### `mx work -n <name> path`

Print the absolute path to the work folder. Designed for shell substitution:

```bash
cd "$(mx work -n feat path)"
```

Plain output, no decoration.

### `mx work -n <name> describe <text>`

Update the work's description.

### `mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>] [--no-hydrate]`

Create a git worktree of `<repo>` inside the work at `works/<name>/wt/<repo>`, on branch `<b>` (defaults to the work name). If the branch doesn't already exist, it's created. The worktree is also registered in `work.json` and added to the `.code-workspace` (folder path `wt/<repo>`, entry `name` = the repo name).

`--base <ref>` is where the new branch forks from. Accepts any ref. A bare branch name resolves to a local branch or `origin/<name>` (with fallback). Resolved to a commit SHA before `git worktree add` so git's DWIM can't override `-b`. Omit `--base` to fork from the pristine clone's current HEAD.

Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit.

**After** the worktree is created, the repo's `hydrate.sh` runs automatically with the new worktree as cwd (see [Per-repo scripts](#per-repo-scripts)). A non-zero exit here is a warning — the worktree is kept. Pass `--no-hydrate` to skip running it.

### `mx work -n <name> worktree hydrate <repo>`

Re-run the repo's `hydrate.sh` against an existing worktree on demand (same env + positional args as the automatic run). In this explicit mode a non-zero exit errors with `HYDRATE_FAILED`.

### `mx work -n <name> worktree ls [--porcelain]`

List the work's worktrees, with branch + ports. Refuses if cwd doesn't imply the work and `-n` is missing.

### `mx work -n <name> worktree rm <repo>`

Remove the worktree (deletes the worktree directory, deregisters in `work.json`). Refuses with `DIRTY` if uncommitted changes. **Branch is kept.**

### `mx work -n <name> port set <repo> <service> [<port>]`

Allocate a port for a service inside a worktree. With `<port>`, sets that specific port; without, auto-picks the next free port (unique across **all** works in the runtime). Records in `work.json`.

mx records the binding — it does **not** wire the port into the repo's env or config. That's the agent/user's responsibility.

### `mx work -n <name> port unset <repo> <service>`

Release a port. Reports which port was freed.

### `mx work -n <name> port ls [--porcelain]`

List all ports allocated within this work, aligned:

```
app.web                →  3000
app.api                →  3001
worker.billing-worker  →  3002
```

### `mx work -n <name> archive [--yes|-y]`

Soft-delete a work. Removes the worktrees, frees the branches, but **keeps the folder, `work.json`, sessions/, and branches**. Recoverable via `unarchive`.

Sets `isArchived: true` and `archived_at: <ISO>` in `work.json`. Empties the `.code-workspace` `folders` array (settings preserved). Refuses with `DIRTY` if any worktree is dirty; refuses with `ALREADY_ARCHIVED` if already archived.

**Prompts for confirmation** before doing anything:

```
⚠ About to archive work feat.
  Worktrees will be removed; folder, work.json, branches, and sessions/ are preserved.
  Make sure any pending session summary is written into works/feat/sessions/ first.

Proceed? (y/N)
```

Only `y` / `yes` (case-insensitive) proceeds; anything else aborts with `Aborted.` (exit 0).

`--yes` / `-y` skips the prompt. **Required** when stdin isn't a TTY (piped, scripted) or with `--porcelain` — otherwise mx errors with code `NEED_CONFIRMATION`.

### `mx work -n <name> unarchive [<repo>=<branch>...]`

Restore an archived work. Re-creates worktrees from the branches recorded in `work.json`. Refuses with `NOT_ARCHIVED` if the work isn't archived.

If any recorded branch no longer exists on its pristine clone, errors with `NO_REF` and a precise hint:

```
mx: cannot unarchive "feat" — branch(es) not found: app=feature-x. Re-run with explicit overrides: `mx work -n feat unarchive app=<branch>`.
```

To override per-repo: pass `<repo>=<branch>` positional args. Overrides update `work.json`'s recorded branches to the actually-used ones.

### `mx work -n <name> destroy --force`

**PERMANENT.** Deletes the work folder including `work.json`, `.code-workspace`, and `sessions/`. Branches are kept (same as archive). Refuses with `DIRTY` if any worktree has uncommitted changes.

Requires `--force`. Without it, errors with `NEED_FORCE` pointing at archive:

```
mx: refusing to destroy "feat" — destroy is permanent and removes the work folder including any session summaries. Use `mx work archive` to soft-delete (recoverable via `mx work unarchive`), or re-run with `--force` if you really want this gone.
```

With `--force`, prints a loud irreversibility warning to stderr before executing.

## Per-work context-index hook

`mx work new` and `mx sync` generate `works/<feature>/.claude/settings.json`, a Claude Code `SessionStart` hook that prints the runtime's `context/INDEX.json` into every session launched in that work folder. This loads the context-registry catalog **deterministically** every session (relying on CLAUDE.md prose alone proved unreliable).

The hook is **per-work** (not at the runtime root) because Claude Code reads `.claude/settings.json` only from the session's launch directory, and mx sessions launch in the work folder. It is **stamp-if-missing** — user edits are preserved.

## Output conventions

- `--porcelain` (or `--json`) on reads emits stable JSON; mutations also emit JSON of the result object.
- Errors in `--porcelain` mode: `{"error": "<message>", "code": "<CODE>"}` on stdout, exit 1.
- Errors in human mode: `mx: <message>` to stderr (bold `mx:` prefix when stderr is a TTY), exit 1.
- Success markers: `✓` (plain glyph, shape is the semantic).
- Warnings: `⚠` (plain glyph).
- Style is monochrome — only `bold` and `dim` weight changes. Honours `NO_COLOR` and non-TTY stdout.

## Error codes

| code | meaning |
|---|---|
| `BAD_ARGS` | missing or malformed argument |
| `NO_RUNTIME` | not an mx runtime (no `.mx-root` at the resolved path) |
| `NO_REPO` | requested repo doesn't exist |
| `NO_WORK` | requested work doesn't exist |
| `NO_MANIFEST` | work folder exists but `work.json` doesn't |
| `NO_WORKTREE` | work has no worktree for the requested repo |
| `NO_REF` | branch / ref not found (during `worktree add --base` or `unarchive`) |
| `NO_TEMPLATE` | a runtime template file is missing on disk |
| `EXISTS` | something already exists (repo, work, worktree) |
| `IN_USE` | resource is used elsewhere (e.g. repo has worktrees in works) |
| `DIRTY` | git worktree has uncommitted changes |
| `PORT_TAKEN` | requested port is already allocated to another work/service |
| `NO_PORT` | `port unset` for a service that has no port set |
| `GIT` | an underlying `git` command failed (message includes git's stderr) |
| `OSASCRIPT` | an AppleScript step failed during `mx work new -o` (macOS) |
| `ALREADY_ARCHIVED` | archive called on an archived work |
| `NOT_ARCHIVED` | unarchive called on a non-archived work |
| `NEED_FORCE` | mutating action gated behind `--force` |
| `NEED_CONFIRMATION` | mutating action requires `--yes` (e.g. archive in `--porcelain` / non-TTY) |
| `RUNTIME_VERSION_MISMATCH` | runtime `mx.json` differs from the version this CLI supports — run `mx migrate` (older) or `mx update` (newer) |
| `CLI_TOO_OLD` | runtime is newer than the CLI supports — upgrade the CLI |
| `NO_MIGRATION` | no registered migration step for a version gap in the chain |
| `BAD_VERSION` | malformed `<runtime>/mx.json` file |
| `HYDRATE_FAILED` | explicit `worktree hydrate` hook exited non-zero |
| `UNSUPPORTED` | platform-unsupported action (e.g. `mx work new -o` on non-macOS; downgraded to a warning) |
| `INTERNAL` | non-`MxError` thrown — bug |
