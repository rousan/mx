# Command reference

Every command supported by `mx`, with flags, semantics, and examples.

## Global

### `mx init [path]`

Scaffold or adopt a runtime. Target resolution: positional `path` arg → `$MX_RUNTIME` → `~/mx`.

Creates: `repos/`, `works/`, `files/` (empty runtime-wide operational-values store — see [runtime-model](runtime-model.md#files-store-runtimefiles)), `.mx-root`, `mx.json` (stamped with the runtime version this CLI supports), `CLAUDE.md` (stamped), the central `hooks/` hub (one stamped no-op per event), the runtime `bin/` (+ shipped utilities), `context/INDEX.json` (only if missing). Idempotent.

On a fresh runtime, `mx init` stamps `mx.json` with the runtime version this CLI supports (currently `3`). When adopting an existing runtime, it refuses if that runtime's `mx.json` differs from what this CLI supports — pointing you at `mx migrate` (if the runtime is older) or at upgrading the CLI (if the runtime is newer). See [Runtime versioning](#runtime-versioning).

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
- backfills the central `hooks/` hub (stamp-if-missing per event), the runtime `bin/` and its shipped utility bins, the runtime-wide `files/` store (created empty if missing), and mx-owned structural directories across every work — `<work>/wt/`, `scripts/`, `files/`, `tmp/`, and `sessions/` for any work that pre-dates that scaffolding
- writes each repo's `repo.json`, **only if missing**
- stamps the per-work `CLAUDE.md`, **stamp-if-missing** (stamped once, then user-owned — see [The work folder](runtime-model.md#the-work-folder))
- removes a stale `<runtime>/README.md` if one lingers (legacy cleanup)

Output enumerates every path actually written:

```
✓ Synced runtime at /Users/rousan/mx
  + /Users/rousan/mx/CLAUDE.md
  + /Users/rousan/mx/hooks/post-worktree-create
  + /Users/rousan/mx/repos/app/repo.json
  + /Users/rousan/mx/works/old-feat/sessions
  + /Users/rousan/mx/works/old-feat/CLAUDE.md
```

### `mx update`

**Self-update the CLI** — not the runtime. Re-installs `@rousan/mx` within its current major via `npm i -g @rousan/mx@^<major>`, picking up the latest same-major release.

It also checks whether a newer **major** exists. If so, it prints a suggestion to cross the major deliberately:

```
A newer major is available: @rousan/mx@3.
  npm i -g @rousan/mx@3
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

### `mx doctor [--install [--yes]]`

Environment check for the **tmux workflow** ([`mx work attach`/`open`](#mx-work--n-name-attach---prompt-text)). Verifies the **required** tools (tmux, neovim, claude, git) and a **recommended** editor toolbelt (ripgrep, fd, fzf, bat, lazygit, eza, zoxide), reporting each with its detected version, then prints the exact install command for anything missing — resolved to the detected package manager (Homebrew, then apt/dnf/pacman) with distro-specific package names (`fd` is `fd-find` on Debian, `bat` is `batcat`, and eza/lazygit may need an extra repo). It also reminds tmux-resurrect users that mx sessions save and restore like any other (no special exclusion), and that [`mx work gc`](#mx-work-gc---yes) prunes any session resurrect brings back for a work you've since archived or destroyed.

When run with a runtime present, doctor additionally reports the **context registry** index size: the runtime `CLAUDE.md` `@import`s `context/INDEX.json` into every session, and Claude Code caps an imported file at ~150k chars. Doctor shows the index's size (and entry count) with a ✓ when it's under the limit, a ⚠ when it's **approaching** (≥ 85%), and a ⚠ when it's **over** — past which Claude Code may drop the tail, so the fix is to trim descriptions or move detail into body files. Porcelain adds a `contextIndex` field (`{path, exists, chars, entries, nearLimit, overLimit}`).

`--install` runs the install command after a confirmation prompt (`--yes` skips it). Errors `NO_PACKAGE_MANAGER` when none of brew/apt/dnf/pacman is found, `INSTALL_FAILED` when the install command exits non-zero. Not version-gated and touches no runtime state — a pure environment check. `--porcelain` returns `{tools, packageManager, missing, installCommand}`.

### `mx help`, `mx version` (or `--help` / `-h`, `--version` / `-v`)

Print help text or version (read from `<pkg>/package.json` at startup). Allowed even when the runtime version doesn't match.

## Runtime versioning

A runtime carries its layout version in `<runtime>/mx.json` — an integer (currently `3`). An **absent** `mx.json` file means a legacy **v1** runtime.

This CLI supports a single runtime version (`RUNTIME_VERSION = 3`), and the mapping is fixed: **CLI major version ⇄ runtime version** (CLI 3.x supports runtime v3, CLI 2.x supported v2, …).

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

`--quick` turns it into a one-shot quick-start: after creating the repo it also creates a **`dev-<name>`** work, adds a **worktree** of the repo on the **`develop`** branch, and fires the `post-worktree-create` hook. Pair with `-o`/`--open` to build the work's tmux session and open it in a new terminal, and `--description <t>` to set the work description. So a fresh experiment is one line:

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

**Metrics shown** (only rows that carry a ✓/⚠ — purely informational fields like default branch and worktrees-in-works live in `mx repo info`): current branch (✓ when it matches the default), uncommitted changes, untracked files, ahead/behind origin/<branch> (only when an upstream exists), and last fetched — shown for remote-backed repos with a 24h freshness rule (✓ within 24h, ⚠ stale otherwise). Local repos (no remote) omit ahead/behind and last fetched.

These structured checks are mx's built-in **typed source of truth** for repo health. In addition, `mx repo health` runs the central `repo-health` hook (`<runtime>/hooks/repo-health`) with `MX_REPO` set and captures its stdout into a separate `extra` field — see [Hooks](#hooks). The hook convention is **silent when healthy**: empty output (or a bare `ok`/`OK`) renders the `extra` row as ✓ `OK`, any other output renders it with a ⚠ (and the message). A missing or failing hook yields `extra: null`.

Both forms render the **same per-repo detail block** — a structured per-metric block with ✓/⚠ markers aligned in a column. The **repo name carries an aggregate ✓/⚠** so you can scan green-vs-needs-attention at a glance (✓ only when every checked row, including `extra`, is a tick). `-n <name>` shows one repo; without `-n`, every repo's block is printed in turn (alphabetical), separated by a blank line.

```
api  ⚠
  current branch    main          ✓
  uncommitted       0 changes     ✓
  untracked         0 files       ✓
  ahead of origin   0 commits     ✓
  behind of origin  1 commit      ⚠  run `mx repo -n api fetch`
  last fetched      2 days ago    ⚠  stale — run `mx repo -n api fetch`
  extra             OK            ✓
```

The `extra` row sits inline right after the metrics (no blank line); multi-line hook output continues on aligned rows below. In porcelain, the captured output is the string field `extra` (or `null`).

**Exit code is 0** even when issues are found (read-only convention). To refresh the "behind" numbers against actual origin, run `mx repo -n <name> fetch` first.

### `mx repo -n <name> rm`

Remove the repo container (clone + `repo.json`). Refuses with `IN_USE` if any work still has a worktree of it.

## Works (features)

### `mx work new <name> [<repo>[:<branch>[:<base>]]]... [--description <text>] [--branch <b>] [--base <ref>] [--open|-o]`

Create a new work: folder under `works/<name>/`, empty `work.json`, empty `.code-workspace`, the per-work directories `wt/` (where worktrees go), `scripts/`, `files/`, `tmp/`, and `sessions/`, and the work `CLAUDE.md` (stamped once with an explanatory comment, then yours to edit — see [The work folder](runtime-model.md#the-work-folder)). Prints the absolute path. All of these are **stamp-if-missing**. (Lifecycle hooks are central, not per-work — see [Hooks](#hooks).)

The name is immutable.

**Initial worktrees.** Any positional args after `<name>` are pristine repos to create worktrees for right away — the same operation as [`worktree add`](#mx-work--n-name-worktree-add-repo-worktree-name---branch-b---base-ref) (it fires `pre/post-worktree-create` per worktree), done as part of `new`. Each token is `<repo>[:<branch>[:<base>]]` (git refs can't contain `:`, so the split is unambiguous):

```bash
mx work new feat app api                                  # app + api, both on branch "feat"
mx work new feat app:hotfix api                           # app on "hotfix", api on "feat"
mx work new feat app api --branch shared                  # both on "shared"
mx work new feat muze-ai:feat:app_ib_dev scaligent:feat:migration-to-mt-service-from-cf   # per-repo base
mx work new feat app::develop                             # default branch, forked from develop
```

Resolved **per repo**:

- **branch** = explicit `<repo>:<branch>` → `--branch <b>` (a default for every repo given without its own branch) → the work name;
- **base** (fork point, same semantics as `worktree add --base`) = explicit `:<base>` → `--base <ref>` → the pristine clone's current `HEAD`.

An empty branch segment (`app::develop`) means "use the default branch". Repos are validated up front — an unknown repo or a repo listed twice fails before anything is created, so you never get a half-built work.

**`--open` / `-o`**: after creating the work, builds its tmux session and opens it in a **new terminal window** — see [`mx work open`](#mx-work--n-name-open-or-mx-work--n-name--o). Best-effort: if a terminal can't be launched (or the platform lacks one), it warns and points at `mx work -n <name> attach`, which always works in-place — the work is still created either way.

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

### `mx work -n <name> attach [--prompt <text>]`

Enter a work — the **primary** way in. Every active work maps to exactly **one tmux session** named `mx/<name>` (the `/` prefix groups mx sessions in `tmux ls`; mx also stamps a tmux `@mx_work` option on the session). `attach` builds that session if it doesn't exist yet, then hands **this** terminal to it: `tmux switch-client` when you're already inside tmux (a nested `attach` is refused by tmux), `tmux attach-session` otherwise.

The default session mx builds:

- window `main` — LEFT pane: the work's Claude Code session; RIGHT pane: `nvim wt` (the work's `wt/` worktrees folder, not the work-folder root; overridable in the `work-session` hook). Focus starts on the claude pane.
- window `run` — a 2×2 tiled grid of shells for dev servers and ad-hoc commands.
- session environment: `MX_WORK`, `MX_WORK_PATH`, `MX_RUNTIME`, `MX_TMUX=1`, `MX_CLAUDE_SESSION_ID`, plus one `MX_PORT_<worktree>_<service>` per allocated port.

After building, the [`work-session` hook](#hooks) fires (cwd = the work folder) so you can rearrange or extend the layout.

Building is **lazy and self-healing**: nothing is created until the first `attach`/`open`, and after a reboot or a manual `tmux kill-session` the next `attach` simply rebuilds it. `--porcelain` ensures the session **without** attaching (prints `{work, session, created, attach:false}`) — useful for scripts.

**The Claude session — resume-or-create, keyed to the work name.** One name per work: mx decides the pane's `claude` command by whether a session **named after the work** already exists.

- **Resume.** If a Claude session whose display name equals `<name>` exists in the work's project directory, mx runs **`claude --resume <name>`**. Claude Code resolves `--resume` by session title, so this reattaches the work's conversation by name — covering a session created by this flow *and* any older one (the pre-tmux `mx work open`, or a `claude` you ran in the folder by hand), since those are named after the work too. In the rare case of two sessions sharing the name, Claude Code shows its picker.
- **Create.** With no such session, mx runs **`claude -n <name>`** (Claude assigns the id; only the name is pinned), seeded with an initial prompt when one is resolved (see below).

mx uses `findSessionsByName` only to tell whether a session exists (so `--resume` isn't run with nothing to resume, and so a prompt is seeded only on a genuine first create). (mx deliberately does **not** use Claude Code's own `--tmux`/`--worktree` flags — mx owns worktrees and the session.)

**Initial prompt (new session only).** Resolved as: an explicit `--prompt <text>` wins (pass `--prompt ''` for none); otherwise the [`session-prompt` hook](#hooks) is fired (cwd = the work folder) and its stdout is used. If neither yields text, the session opens clean. The resolved prompt is passed to Claude as the first message (routed through a throwaway file under the work's `tmp/` so multi-line prompts need no shell escaping).

### `mx work -n <name> open` (or `mx work -n <name> -o`)

Same as `attach`, but opens the work's session in a **new terminal window** rather than the current one. macOS: a fullscreen Terminal (via osascript). Linux: the `$MX_TERMINAL` template if set (a command string containing `{cmd}`), otherwise the first available of `x-terminal-emulator`, `kitty`, `wezterm`, `alacritty`, `gnome-terminal`, `konsole`, `xterm`. If no terminal can be launched it warns and prints the `mx work -n <name> attach` line to run by hand — the session is already built, so nothing is lost. `mx work -n <name> -o` is shorthand for `… open`.

### `mx work switch [<name>]`

Jump between works' tmux sessions. With an explicit `<name>` (positional, or `-n`, or inferred from the cwd) it's exactly [`attach`](#mx-work--n-name-attach---prompt-text). Without one, it opens an **fzf picker** over this runtime's live `mx/*` sessions and attaches (or `switch-client`s) to the one you choose. Only sessions belonging to this runtime are listed (matched by each session's seeded `MX_RUNTIME`, so a same-named work in another runtime sharing the tmux server isn't shown). If `fzf` isn't installed it prints the list and asks you to pass a name; `--porcelain` returns the candidate sessions without attaching.

### `mx work gc [--yes|-y]`

Prune **orphaned** mx tmux sessions — live `mx/<work>` sessions whose work, in this runtime, is **archived** or **no longer exists**. This is the cleanup for the reboot case: mx lets tmux-resurrect save and restore its sessions like any other (so a work's custom layout survives a reboot), but resurrect may bring back a session for a work you archived or destroyed before the last save; `gc` finds and kills those.

A session is judged against **this** runtime only, matched by its seeded `MX_RUNTIME` — a destroyed-work session is pruned only when it explicitly reports this runtime, so another runtime's sessions on the same tmux server are never touched. Active works with a live session are healthy and left alone. Killing sessions is destructive, so `gc` **prompts for confirmation** (and **warns** if a pane holds a live foreground process); `--yes`/`-y` skips the prompt and is **required** with `--porcelain` or a non-TTY (else `NEED_CONFIRMATION`). Porcelain returns the pruned `{session, work, reason}` list.

### `mx work -n <name> describe <text>`

Update the work's description.

### `mx work -n <name> worktree add <repo> [<worktree-name>] [--branch <b>] [--base <ref>]`

Create a git worktree of `<repo>` inside the work at `works/<name>/wt/<worktree-name>`, on branch `<b>` (defaults to the work name). If the branch doesn't already exist, it's created. The worktree is registered in `work.json` (with its `name`) and added to the `.code-workspace`.

`<worktree-name>` is the worktree's identifier — its `wt/<name>` directory and the selector used by `rm` / `port`. It **defaults to the repo name**. Pass a distinct name to add **multiple worktrees of the same repo** to one work (e.g. `mx work -n feat worktree add app app-pr2 --branch fix`). Adding a repo a second time without a name errors (the default name collides) and tells you to pass one.

`--base <ref>` is where the new branch forks from. Accepts any ref. A bare branch name resolves to a local branch or `origin/<name>` (with fallback). Resolved to a commit SHA before `git worktree add` so git's DWIM can't override `-b`. Omit `--base` to fork from the pristine clone's current HEAD. Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit.

**Before** creation mx fires the `pre-worktree-create` hook (a non-zero exit aborts with `HOOK_FAILED`); **after** creation it fires `post-worktree-create` — the "hydrate" step — with the new worktree as cwd (see [Hooks](#hooks)). A non-zero exit there is a warning — the worktree is kept. (To skip hydration, make the hook a no-op; there is no `--no-hydrate` flag.)

### `mx work -n <name> worktree ls [--porcelain]`

List the work's worktrees, with name (repo annotated when it differs), branch, and ports. Refuses if cwd doesn't imply the work and `-n` is missing.

### `mx work -n <name> worktree rm <worktree-name>`

Remove the worktree named `<worktree-name>` (defaults to the repo name for single-worktree repos) — deletes the directory, deregisters in `work.json`. Refuses with `DIRTY` if uncommitted changes. **Branch is kept.**

### `mx work -n <name> worktree set-branch <worktree-name> [<branch>]`

Re-record a worktree's branch in `work.json` after you've switched branches inside the worktree yourself. mx **never runs the checkout** — you do it with plain `git` (`git checkout other-branch` inside `wt/<name>`), then call this so the manifest reflects reality. Only `work.json` metadata changes; no git worktree operation is performed.

The recorded branch is always read from the worktree's **live** git state, so `work.json` can't drift from git. The optional `<branch>` argument is a guard: when given, it must equal the worktree's current branch, otherwise the command fails with `BRANCH_MISMATCH` (this catches "I meant to check out X but forgot"). Omit it to simply record whatever the worktree is on.

Errors: `NO_WORKTREE` if no such worktree (or it isn't on disk, e.g. an archived work); `DETACHED` if the worktree is in detached HEAD (check out a branch first); `BRANCH_MISMATCH` if the guard argument doesn't match the live branch.

### `mx work -n <name> port set <worktree-name> <service> [<port>]`

Allocate a port for a service inside a worktree (selected by name). With `<port>`, sets that specific port; without, auto-picks the next free port (unique across **all** works in the runtime). Records in `work.json`. Two worktrees of the same repo get independent ports, even for the same service name.

mx records the binding — it does **not** wire the port into the repo's env or config. That's the agent/user's responsibility.

### `mx work -n <name> port unset <worktree-name> <service>`

Release a port. Reports which port was freed.

### `mx work -n <name> port ls [--porcelain]`

List all ports allocated within this work, aligned:

```
app.web                →  3000
app.api                →  3001
worker.billing-worker  →  3002
```

### `mx work -n <name> archive [--yes|-y]`

Soft-delete a work. Removes the worktrees, frees the branches, **kills the work's tmux session** (`mx/<name>`), but **keeps the folder, `work.json`, sessions/, and branches**. Recoverable via `unarchive`.

Sets `isArchived: true` and `archived_at: <ISO>` in `work.json`. Empties the `.code-workspace` `folders` array (settings preserved). **Frees the worktrees' ports** — they're cleared from `work.json`, so the numbers become reusable while archived (unarchive re-allocates, below). Refuses with `DIRTY` if any worktree is dirty; refuses with `ALREADY_ARCHIVED` if already archived. If the tmux session is live, the confirmation prompt names it — and **warns when a pane holds a live foreground process** (a dev server, a running `claude`) since killing the session terminates it.

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

### `mx work -n <name> unarchive [<worktree>=<branch>...]`

Restore an archived work. Re-creates worktrees from the branches recorded in `work.json`. Refuses with `NOT_ARCHIVED` if the work isn't archived. Each restored worktree is treated as freshly created — mx fires **`post-worktree-create` per worktree** (the "hydrate" step), so the hook re-installs deps and **re-allocates ports** just like a first-time `worktree add` (ports were freed on archive).

If any recorded branch no longer exists on its pristine clone, errors with `NO_REF` and a precise hint:

```
mx: cannot unarchive "feat" — branch(es) not found: app=feature-x. Re-run with explicit overrides: `mx work -n feat unarchive app=<branch>`.
```

To override per-worktree: pass `<worktree-name>=<branch>` positional args (the worktree name defaults to the repo). Overrides update `work.json`'s recorded branches to the actually-used ones.

**Lifecycle hooks:** mx fires the central `pre-work-unarchive` hook before re-creating any worktree (a non-zero exit aborts with `HOOK_FAILED`) and `post-work-unarchive` after restoration (non-zero warns only). See [Hooks](#hooks).

### `mx work -n <name> destroy --force`

**PERMANENT.** Deletes the work folder including `work.json`, `.code-workspace`, and `sessions/`, and **kills the work's tmux session**. Branches are kept (same as archive). Refuses with `DIRTY` if any worktree has uncommitted changes.

Requires `--force`. Without it, errors with `NEED_FORCE` pointing at archive:

```
mx: refusing to destroy "feat" — destroy is permanent and removes the work folder including any session summaries. Use `mx work archive` to soft-delete (recoverable via `mx work unarchive`), or re-run with `--force` if you really want this gone.
```

With `--force`, prints a loud irreversibility warning to stderr before executing.

### `mx work health [--all] [--porcelain]` / `mx work -n <name> health [--porcelain]`

Purely-local health audit of a work folder against the mx contract. With `-n <name>` (or when your cwd implies a work) it prints one work's detail block; bare `mx work health` prints a block for every **active** work, and `--all` adds archived ones.

Only health metrics (rows carrying a ✓/⚠) are shown — informational fields like the work's status and its port count live in `mx work info`. Built-in checks (the typed source of truth, surfaced as `issues` / `healthy`):

- **Stray root entries** — anything in the work-folder root that isn't mx-native (`work.json`, the `.code-workspace`, `CLAUDE.md`, and the `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` dirs). Ad-hoc files belong under `files/`, `tmp/`, or `scripts/`. Dot-prefixed entries are tolerated (the tooling-file exception, e.g. an MCP connection file).
- **Worktree presence** — the `worktrees` row shows the count with a ✓/⚠ for whether they're all as expected (recorded worktrees present on disk for an active work; removed for an archived one). It does not list worktree names — use `mx work -n <name> info` for the per-worktree detail.
- **Cross-work port collisions** — a port this work allocates that another work also allocates. `mx port set` keeps ports unique, so a collision means `work.json` was hand-edited.
- **Archive invariants** — an archived work should have its ports freed and its worktrees removed (archive does both). A leftover port or on-disk worktree is flagged.

Each failing check's detail rides inline as a hint on its own row (no separate "issues" section), and the **work name carries an aggregate ✓/⚠** (✓ only when every checked row, including `extra`, is a tick). In addition, the command runs the central `work-health` hook (`<runtime>/hooks/work-health`) with `MX_WORK` set and the work folder as cwd, capturing its stdout into the `extra` row — same **silent-when-healthy** convention as `repo-health` (empty or `ok`/`OK` → ✓ `OK`, any other output → ⚠ with the message). A missing or failing hook yields `extra: null`.

### `mx health [--all] [--porcelain]`

Whole-runtime health overview: every repo's health block (identical to `mx repo health`) followed by every active work's health block (identical to `mx work health`). `--all` includes archived works in the works section. Porcelain returns `{ "repos": [...], "works": [...] }` with the full snapshots.

### `mx mission-control [--port <n>] [--open|-o]` (alias `mx mc`)

Start a local, **read-only live web dashboard** for the runtime and block until interrupted (Ctrl-C). Open the printed `http://localhost:<port>` in a browser (a second monitor works well) for a calm, monochrome, auto-refreshing overview:

- a consolidated **ports board** — every allocated port across **all** works (active and archived), as a nested tree **work → worktree → (service · port · url)** so names aren't repeated; collisions across works flagged in red, archived works dimmed (the fast "which work owns which port, give me the URL" view);
- a **repos** grid and a **works** grid, each card showing the same health metrics as `mx repo health` / `mx work health` with an aggregate ✓/⚠ per card. The works grid shows **active works only by default**; a "show archived" checkbox reveals archived ones. (The ports board is independent — it always covers every work.)

**How it's served.** A zero-dependency `node:http` server serves a single self-contained HTML page (`GET /`) plus a JSON API: `GET /api/state` (one-shot snapshot) and `GET /api/stream` (Server-Sent Events). The page subscribes to the stream; the server recomputes on a short timer and pushes instantly on manifest changes (it `fs.watch`es `works/`, `repos/`, `mx.json`). The UI is built from `apps/mission-control/` (React + Vite + Tailwind) into one inlined `index.html` at build time and bundled into the package — **nothing from it is a runtime dependency**.

`--port` sets the starting port (default `7777`; walks upward if busy). `-o`/`--open` opens the browser (macOS). Read-only — it never mutates the runtime.

### `mx bin ls` · `mx bin path` (alias `mx bins`)

Manage the runtime-wide `bin/` directory — utility executables shared across every work, meant to be on your `PATH`. mx ships some (`dcs` / `lcs` — delete / list Claude Code sessions by name; `mx-open-all` — open every active work, or a named subset, in one fullscreen macOS Terminal.app window with a tab per work each running `mx work attach`) and you can drop your own in; any executable file is picked up.

- **`mx bin ls`** (or bare `mx bin`) — list the bins, each tagged `built-in` (shipped) or `user` (yours), with a warning on any that aren't executable. It ends with PATH guidance: a ✓ when `bin/` is already on your `PATH`, otherwise a step-by-step instruction to add `export PATH="$(mx bin path):$PATH"` to your shell startup file (`~/.zshrc`, `~/.bashrc`, …). Porcelain returns `{ "dir", "onPath", "bins": [{ "name", "path", "executable", "shipped" }] }`.
- **`mx bin path`** — print the absolute `bin/` directory, for wiring it onto `PATH`:

  ```
  export PATH="$(mx bin path):$PATH"
  ```

The directory is created by `mx init` and refreshed by `mx sync`. mx-shipped bins are **mx-owned: re-stamped (overwritten) on every sync**, like the runtime `CLAUDE.md`, so improvements land automatically; **your own bins are never touched**. To customize a shipped bin without losing it on the next sync, copy it to a new name. This is distinct from a work's `scripts/` folder (scoped to one work) — `bin/` is runtime-wide.

### `mx divider <text> [--open|-o]`

Fill a terminal with `<text>` rendered as **large block letters**, as a visual separator for your macOS Mission Control Spaces (e.g. an `IN REVIEWS` or `PR REVIEWS` window between clusters of work windows). The text auto-scales to fill the terminal and re-renders when the window resizes.

- **Rendered literally.** Spaces are kept verbatim (`"  MAIN  "` keeps its padding), and **you** control line breaks: a `\n` (or a real newline) starts a new stacked line. Nothing is auto-wrapped or collapsed — so to make a two-word label fill the window like a single word, stack it: `mx divider "IN\nPROGRESS"`.
- **Bare** (`mx divider "IN REVIEWS"`) — takes over the **current** terminal: clears it, draws the banner, and **holds** it on screen (Ctrl-C or `q` to quit). Piped/non-TTY output prints once and returns (honoring `COLUMNS`/`LINES` for size).
- **`-o` / `--open` (macOS)** — opens a **new fullscreen Terminal** running the same banner, so you can drag it into place in the Spaces strip. Off macOS this is `UNSUPPORTED` (a warning).

This is a personal window-organization aid; it touches no runtime state. The renderer is a zero-dependency 5x7 block font (`renderBanner` in `@mx/core`), so it needs no `figlet`/`banner` binary.

## Loading the context-registry index

There is **no** `SessionStart` hook. mx through v2 stamped a per-work `.claude/settings.json` whose `SessionStart` hook printed `context/INDEX.json` into every session, but Claude Code caps hook output (~2KB) so a non-trivial index was silently truncated. v3 drops the hook; `mx work new` and `mx sync` no longer stamp it, and `mx migrate` removes a default-stamped one (a customized `settings.json` is kept with a warning).

Loading the index is now the session's own job: the runtime `CLAUDE.md` instructs it to read the whole `context/INDEX.json`, uncapped, on every task. To force a fresh full load mid-session, tell the session something like "load the mx ctx index as whole".

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
| `repo-health` | during `mx repo health` (cwd = the pristine clone) | stdout captured into the report |
| `work-health` | during `mx work health` / `mx health` (cwd = the work folder) | stdout captured into the report |
| `session-prompt` | when `mx work attach`/`open` first CREATES a work's Claude session (cwd = the work folder) | stdout becomes the session's initial prompt |
| `work-session` | after mx BUILDS a work's tmux session, before attaching (cwd = the work folder) | post-style: non-zero only warns; rearrange/extend the layout |

Context arrives as `MX_*` environment variables — always `MX_EVENT` and `MX_RUNTIME`, plus event-specific ones: `MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_GIT_DIR`, `MX_REPO_PATH`, `MX_SESSION_NAME`, `MX_TMUX_SESSION`, `MX_CLAUDE_SESSION_ID`. Each shipped hook's header documents its own set and working directory. A `pre-*` non-zero exit **aborts** the operation (`HOOK_FAILED`, nothing mutated) — even in `--porcelain` mode (where hook stdio is suppressed, the abort still surfaces as a JSON `HOOK_FAILED` error); a `post-*` non-zero exit is only a warning.

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
| `OSASCRIPT` | an AppleScript step failed while opening a Terminal (macOS `-o`) |
| `TMUX_MISSING` | `tmux` is not installed / not on PATH (needed by `mx work attach`/`open`) |
| `TMUX_TOO_OLD` | `tmux` is older than the required 3.0 |
| `TMUX` | an underlying `tmux` command failed |
| `NO_PACKAGE_MANAGER` | `mx doctor --install` found no supported package manager (brew/apt/dnf/pacman) |
| `INSTALL_FAILED` | `mx doctor --install` ran the install command and it exited non-zero |
| `ALREADY_ARCHIVED` | archive called on an archived work |
| `NOT_ARCHIVED` | unarchive called on a non-archived work |
| `NEED_FORCE` | mutating action gated behind `--force` |
| `NEED_CONFIRMATION` | mutating action requires `--yes` (e.g. archive in `--porcelain` / non-TTY) |
| `RUNTIME_VERSION_MISMATCH` | runtime `mx.json` differs from the version this CLI supports — run `mx migrate` (older) or `mx update` (newer) |
| `CLI_TOO_OLD` | runtime is newer than the CLI supports — upgrade the CLI |
| `NO_MIGRATION` | no registered migration step for a version gap in the chain |
| `BAD_VERSION` | malformed `<runtime>/mx.json` file |
| `HOOK_FAILED` | a `pre-*` hook exited non-zero and aborted the operation |
| `UNSUPPORTED` | platform-unsupported action (e.g. `mx work new -o` on non-macOS; downgraded to a warning) |
| `INTERNAL` | non-`MxError` thrown — bug |
