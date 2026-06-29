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

### `mx info [--all] [--porcelain]` (alias: `mx i`)

Show the runtime overview: path + version, context entry count, repos, works. The header shows the runtime layout version (`mx vN`); repos and works each show their folder path (home-collapsed to `~`). Porcelain output includes a top-level `version` field.

By default shows **active works only**; pass `--all` to include archived.

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

  works
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
- backfills the central `hooks/` hub (stamp-if-missing per event), the runtime `bin/` and its shipped utility bins, and mx-owned structural directories across every work — `<work>/wt/`, `scripts/`, `files/`, `tmp/`, and `sessions/` for any work that pre-dates that scaffolding
- writes each repo's `repo.json`, **only if missing**
- stamps the per-work `CLAUDE.md`, **stamp-if-missing** (stamped once, then user-owned — see [The work folder](runtime-model.md#the-work-folder))
- generates each work's `.claude/settings.json` context-index hook, **stamp-if-missing** (see [Per-work context-index hook](#per-work-context-index-hook))
- removes a stale `<runtime>/README.md` if one lingers (legacy cleanup)

Output enumerates every path actually written:

```
✓ Synced runtime at /Users/rousan/mx
  + /Users/rousan/mx/CLAUDE.md
  + /Users/rousan/mx/hooks/post-worktree-create
  + /Users/rousan/mx/repos/app/repo.json
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

**Auto-sync after update.** When an in-major update actually installs a newer version, `mx update` then runs **`mx sync`** automatically so the runtime picks up the new version's templates and scaffolding (the runtime `CLAUDE.md`, shipped `bin/` utilities, per-work/per-repo files). It does this by shelling out to the freshly-installed global `mx` — the running process is still the pre-update code, so an in-process sync would stamp the *old* templates. Since the update stays in-major, the runtime version still matches and sync isn't gated. It's best-effort: if the sync can't run (e.g. no runtime at the resolved path) `mx update` prints a hint rather than failing. In `--porcelain` mode the sync runs silently so the update's JSON stays the only object on stdout. (Nothing happens when you're already on the latest in-major version.)

### `mx migrate [--dry-run]`

**Upgrade an older runtime** to the version this CLI supports. This is the only runtime-touching command allowed when the runtime's `mx.json` doesn't match (see [Runtime versioning](#runtime-versioning)).

It validates the **full migration chain** (`v_current → … → supported`) *before* mutating anything:

- errors `NO_MIGRATION` if any step in the chain has no registered migration
- errors `CLI_TOO_OLD` if the runtime is **newer** than this CLI supports (upgrade the CLI with `mx update` instead)
- a friendly no-op if the runtime is already at the supported version

The registered steps:

**v1 → v2** upgrades the repo and work layouts in one pass:

- moves each pristine clone from `repos/<repo>/` into `repos/<repo>/git/` and runs `git worktree repair` so existing worktrees relink to the moved clone;
- restructures every work — moves its flat worktrees from `works/<work>/<repo>` into `works/<work>/wt/<repo>` (via `git worktree move`), creates the new `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` folders, stamps the work `CLAUDE.md`, and rewrites the `.code-workspace` folder paths to `wt/<repo>`.

**v2 → v3** centralizes hooks:

- stamps the central `<runtime>/hooks/` hub (one executable per event);
- writes each repo's `repo.json`;
- **retires the old per-repo `hydrate.sh`/`health.sh` and per-work `hooks/`** — removes them when they're unchanged from the mx default, but **keeps them with a warning** (surfaced in the output and in `warnings`/porcelain) when you customized them, so you can fold the logic into the central hooks.

**`--dry-run`** previews the migration without touching anything: it runs the same up-front validation (so an impossible migration still errors `NO_MIGRATION` / `CLI_TOO_OLD`), then prints every path it *would* move, stamp, or create and ends with "No changes were made." Nothing is moved and the runtime's `mx.json` version is left untouched, so you can review the plan before letting migrate run against an old runtime. In `--porcelain` mode the result object carries `"dryRun": true` and the planned paths in `changed`. Run it again without the flag to apply.

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

Each repo lives in a **container** at `<runtime>/repos/<repo>/`, holding the pristine clone at `git/` plus a `repo.json` metadata file (`{ "name": … }`, extensible). The commands below report the repo `path` as the container (`repos/<repo>`), not the inner git dir. (Lifecycle hooks are central — `<runtime>/hooks/` — not per-repo.)

### `mx repo add <git-url> [--name <n>]`

Clone a repo into its container at `<runtime>/repos/<repo>/git/`. The only command that clones. Name is derived from the URL (last segment minus `.git`) unless `--name` overrides.

Also writes `repo.json` (`{ "name": … }`) into the container.

### `mx repo new <name> [--quick] [-o] [--description <t>]`

Create a brand-new **local** repo (no remote) at `<runtime>/repos/<name>/git/`: `git init` on `main`, a starter `README.md`, and an initial commit (so `main` exists and worktrees can fork from it). Writes `repo.json` like `add`. This is the counterpart to `add` for quick experiments and throwaway apps you don't want to push to a remote yet — no more manual `mkdir` + `git init` + commit dance. The initial commit uses your git identity, falling back to a neutral `mx <mx@localhost>` only if none is configured. Errors `EXISTS` if the repo already exists, `BAD_ARGS` on an invalid name (must be a single path segment).

`--quick` turns it into a one-shot quick-start: after creating the repo it also creates a **`dev-<name>`** work, adds a **worktree** of the repo on the **`develop`** branch, and fires the `post-worktree-create` hook (skip with `--no-hydrate`). Pair with `-o`/`--open` to open the work in a fullscreen Terminal (macOS), and `--description <t>` to set the work description. So a fresh experiment is one line:

```
mx repo new exp --quick -o     # repo "exp", work "dev-exp", worktree on "develop", opened
```

Note on the branch: the pristine clone holds `main`, and git won't check the same branch out twice, so the worktree forks `main` onto `develop` rather than `main` itself. The pristine stays on `main`, so `mx repo health` stays clean.

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

### `mx repo -n <name> fetch` · `mx repo fetch --all`

Run `git fetch --all --prune --tags`, then best-effort fast-forward **both** the currently checked-out branch **and** the base (origin default, e.g. `main`) branch to their upstreams — fast-forward-only, so divergent/upstream-less branches are left untouched. When the base *is* the checked-out branch, only one ff happens. Fast-forwarding the base keeps `worktree add --base <b>` correct (it resolves the local branch first, so a stale local `main` would otherwise yield stale worktrees).

`--all` (`mx repo fetch --all`, or `mx repo --all fetch`) fetches **every** repo, one by one, continuing past any individual failure (failures are reported with `⚠`).

Reports the branch and the list of branches now on origin (an array, one per repo, with `--all`).

### `mx repo -n <name> info [--porcelain]`

Detail block for one repo: name, path (the container `repos/<repo>`), current branch, remote URL, and which works currently hold a worktree of it.

### `mx repo health [--porcelain]` / `mx repo -n <name> health [--porcelain]`

Purely-local health check. **No network, no fetch.** Surfaces drift from the expected "checked-out on default branch, clean working tree, in sync with origin" state.

**Checks**: default branch (from `origin/HEAD` symbolic ref, set at clone time), current branch, uncommitted changes, untracked files, ahead/behind origin/<branch> (compared against last fetch), last-fetched timestamp (`.git/FETCH_HEAD` mtime), worktrees-in-works.

These structured checks are mx's built-in **typed source of truth** for repo health. In addition, `mx repo health` runs the central `repo-health` hook (`<runtime>/hooks/repo-health`) with `MX_REPO` set and captures its stdout into a separate `extra` field — see [Hooks](#hooks). A missing, empty, or failing hook yields `extra: null` and never affects `healthy` / `issues`.

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

  repo-health
    <captured stdout of the repo-health hook, if it produced any>
```

The `repo-health` section appears only when the hook produced output. In porcelain, the captured output is the string field `extra` (or `null`).

**Exit code is 0** even when issues are found (read-only convention). To refresh the "behind" numbers against actual origin, run `mx repo -n <name> fetch` first.

### `mx repo -n <name> rm`

Remove the repo container (clone + `repo.json`). Refuses with `IN_USE` if any work still has a worktree of it.

## Works (features)

### `mx work new <name> [--description <text>] [--open|-o]`

Create a new work: folder under `works/<name>/`, empty `work.json`, empty `.code-workspace`, the per-work directories `wt/` (where worktrees go), `scripts/`, `files/`, `tmp/`, and `sessions/`, the work `CLAUDE.md` (stamped once with an explanatory comment, then yours to edit — see [The work folder](runtime-model.md#the-work-folder)), and `.claude/settings.json` (the per-work context-index hook — see [Per-work context-index hook](#per-work-context-index-hook)). Prints the absolute path. All of these are **stamp-if-missing**. (Lifecycle hooks are central, not per-work — see [Hooks](#hooks).)

The name is immutable.

**`--open` / `-o` (macOS only)**: after creating the work, opens a fullscreen Terminal `cd`'d into the work folder. (Open your editor yourself — it no longer launches one.) On non-macOS platforms this is downgraded to a warning (internally `UNSUPPORTED`) — the work is still created.

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

### `mx work -n <name> open` (or `mx work -n <name> -o`)

Open an **existing** work's dev layout — the same thing `mx work new -o` does at creation: a fullscreen Terminal `cd`'d into the work folder. macOS only; on other platforms (or a window-management failure) it warns and is a no-op. `mx work -n <name> -o` is shorthand for `… open`.

### `mx work -n <name> describe <text>`

Update the work's description.

### `mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>] [--no-hydrate]`

Create a git worktree of `<repo>` inside the work at `works/<name>/wt/<repo>`, on branch `<b>` (defaults to the work name). If the branch doesn't already exist, it's created. The worktree is also registered in `work.json` and added to the `.code-workspace` (folder path `wt/<repo>`, entry `name` = the repo name).

`--base <ref>` is where the new branch forks from. Accepts any ref. A bare branch name resolves to a local branch or `origin/<name>` (with fallback). Resolved to a commit SHA before `git worktree add` so git's DWIM can't override `-b`. Omit `--base` to fork from the pristine clone's current HEAD.

Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit.

**Before** creation mx fires the `pre-worktree-create` hook (a non-zero exit aborts with `HOOK_FAILED`); **after** creation it fires `post-worktree-create` — the "hydrate" step — with the new worktree as cwd (see [Hooks](#hooks)). A non-zero exit there is a warning — the worktree is kept. Pass `--no-hydrate` to skip the post hook.

### `mx work -n <name> worktree hydrate <repo>`

Re-run the `post-worktree-create` hook against an existing worktree on demand (same env as the automatic run). In this explicit mode a non-zero exit errors with `HOOK_FAILED`.

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

**Lifecycle hooks:** after confirmation, mx fires the central `pre-work-archive` hook (worktrees still on disk). A non-zero exit **aborts** the archive with `HOOK_FAILED` — nothing is mutated. After a successful archive it fires `post-work-archive`; a non-zero exit there is a warning only. See [Hooks](#hooks).

### `mx work -n <name> unarchive [<repo>=<branch>...]`

Restore an archived work. Re-creates worktrees from the branches recorded in `work.json`. Refuses with `NOT_ARCHIVED` if the work isn't archived.

If any recorded branch no longer exists on its pristine clone, errors with `NO_REF` and a precise hint:

```
mx: cannot unarchive "feat" — branch(es) not found: app=feature-x. Re-run with explicit overrides: `mx work -n feat unarchive app=<branch>`.
```

To override per-repo: pass `<repo>=<branch>` positional args. Overrides update `work.json`'s recorded branches to the actually-used ones.

**Lifecycle hooks:** mx fires the central `pre-work-unarchive` hook before re-creating any worktree (a non-zero exit aborts with `HOOK_FAILED`) and `post-work-unarchive` after restoration (non-zero warns only). See [Hooks](#hooks).

### `mx work -n <name> destroy --force`

**PERMANENT.** Deletes the work folder including `work.json`, `.code-workspace`, and `sessions/`. Branches are kept (same as archive). Refuses with `DIRTY` if any worktree has uncommitted changes.

Requires `--force`. Without it, errors with `NEED_FORCE` pointing at archive:

```
mx: refusing to destroy "feat" — destroy is permanent and removes the work folder including any session summaries. Use `mx work archive` to soft-delete (recoverable via `mx work unarchive`), or re-run with `--force` if you really want this gone.
```

With `--force`, prints a loud irreversibility warning to stderr before executing.

### `mx bin ls` · `mx bin path` (alias `mx bins`)

Manage the runtime-wide `bin/` directory — utility executables shared across every work, meant to be on your `PATH`. mx ships some (currently `dcs` and `lcs` — delete / list Claude Code sessions by name) and you can drop your own in; any executable file is picked up.

- **`mx bin ls`** (or bare `mx bin`) — list the bins, each tagged `built-in` (shipped) or `user` (yours), with a warning on any that aren't executable. It ends with PATH guidance: a ✓ when `bin/` is already on your `PATH`, otherwise a step-by-step instruction to add `export PATH="$(mx bin path):$PATH"` to your shell startup file (`~/.zshrc`, `~/.bashrc`, …). Porcelain returns `{ "dir", "onPath", "bins": [{ "name", "path", "executable", "shipped" }] }`.
- **`mx bin path`** — print the absolute `bin/` directory, for wiring it onto `PATH`:

  ```
  export PATH="$(mx bin path):$PATH"
  ```

The directory is created by `mx init` and refreshed by `mx sync`. mx-shipped bins are **mx-owned: re-stamped (overwritten) on every sync**, like the runtime `CLAUDE.md`, so improvements land automatically; **your own bins are never touched**. To customize a shipped bin without losing it on the next sync, copy it to a new name. This is distinct from a work's `scripts/` folder (scoped to one work) — `bin/` is runtime-wide.

## Per-work context-index hook

`mx work new` and `mx sync` generate `works/<feature>/.claude/settings.json`, a Claude Code `SessionStart` hook that prints the runtime's `context/INDEX.json` into every session launched in that work folder. This loads the context-registry catalog **deterministically** every session (relying on CLAUDE.md prose alone proved unreliable).

The hook is **per-work** (not at the runtime root) because Claude Code reads `.claude/settings.json` only from the session's launch directory, and mx sessions launch in the work folder. It is **stamp-if-missing** — user edits are preserved.

## Hooks

All lifecycle hooks live in **one place** — `<runtime>/hooks/` — with **one executable per event**, named exactly for the event (no extension). `mx init` stamps a documented no-op for each; `mx sync` backfills any that are missing but **never overwrites** your edits. Because the hooks are runtime-wide (shared by every repo and work), you branch on the context **inside** the script. Write them in **any language** — bash, Node, Python — just set the shebang and keep the file executable. Delete a hook file to disable that event.

| event | fires | non-zero exit |
|---|---|---|
| `pre-worktree-create` | before `worktree add` creates a worktree | **aborts** (`HOOK_FAILED`) |
| `post-worktree-create` | after a worktree is created — the "hydrate" step (cwd = the new worktree) | warning (worktree kept) |
| `pre-worktree-remove` / `post-worktree-remove` | around `worktree rm` | pre **aborts**; post warns |
| `pre-work-archive` / `post-work-archive` | around `mx work archive` | pre **aborts**; post warns |
| `pre-work-unarchive` / `post-work-unarchive` | around `mx work unarchive` | pre **aborts**; post warns |
| `pre-repo-fetch` / `post-repo-fetch` | around `mx repo fetch` | pre **aborts**; post warns |
| `repo-health` | during `mx repo health` | stdout captured into the report |

Context arrives as `MX_*` environment variables — always `MX_EVENT` and `MX_RUNTIME`, plus event-specific ones: `MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_GIT_DIR`, `MX_REPO_PATH`. Each shipped hook's header documents its own set and working directory. A `pre-*` non-zero exit **aborts** the operation (`HOOK_FAILED`, nothing mutated) — even in `--porcelain` mode (where hook stdio is suppressed, the abort still surfaces as a JSON `HOOK_FAILED` error); a `post-*` non-zero exit is only a warning.

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
| `HOOK_FAILED` | a hook exited non-zero — a `pre-*` hook aborted the operation, or an explicit `worktree hydrate` failed |
| `UNSUPPORTED` | platform-unsupported action (e.g. `mx work new -o` on non-macOS; downgraded to a warning) |
| `INTERNAL` | non-`MxError` thrown — bug |
