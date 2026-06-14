# Command reference

Every command supported by `mx`, with flags, semantics, and examples.

## Global

### `mx init [path]`

Scaffold or adopt a runtime. Target resolution: positional `path` arg → `$MX_RUNTIME` → `~/mx`.

Creates: `repos/`, `works/`, `.mx-root`, `CLAUDE.md` (stamped), `context/INDEX.json` (only if missing). Idempotent.

Prints a contextual hint about `$MX_RUNTIME`:
- If `$MX_RUNTIME` already points at this runtime: confirms you're set.
- If the target is the default `~/mx` and `$MX_RUNTIME` is unset: notes that no setup is needed.
- Otherwise: gives the `export MX_RUNTIME="…"` line to add to your shell config.

### `mx status [--all] [--porcelain]` (aliases: `mx s`, `mx st`)

Show the runtime overview: path, context entry count, repos, works.

By default shows **active works only**; pass `--all` to include archived. The works section header still says `(N active, M archived)` even when archived are hidden so you know they exist.

Layout:

```
  mx · /Users/rousan/mx

  context  (4)

  repos
    • analytics      main  /tmp/src-analytics
    • app            main  /tmp/src-app

  works  (4 active, 2 archived — pass --all to show)
    • auth-rotation
        (no worktrees)

    • checkout-revamp
        app     [checkout-flow]  web:3000  api:3001
        worker  [checkout-flow]  billing-worker:3002

    …
```

Monochrome: bold for section titles + active work names; dim for everything else. Archived work names are dim. Ports rendered as `service:port`.

### `mx update`

Re-sync the runtime with the current mx version. **Non-destructive — user data is never touched.** Specifically:

- re-stamps `<runtime>/CLAUDE.md` from `templates/CLAUDE.md` (always rewritten, mx-owned)
- stamps `<runtime>/context/INDEX.json` **only if missing** (existing index content is preserved)
- backfills mx-owned structural directories across every work — currently `<work>/sessions/` for any work that pre-dates that scaffolding
- removes a stale `<runtime>/README.md` if one lingers (legacy cleanup)

Output enumerates every path actually written:

```
✓ Updated runtime at /Users/rousan/mx
  + /Users/rousan/mx/CLAUDE.md
  + /Users/rousan/mx/works/old-feat/sessions
```

### `mx help`, `mx version` (or `--help` / `-h`, `--version` / `-v`)

Print help text or version (read from `<pkg>/package.json` at startup).

## Repos (pristine clones)

### `mx repo add <git-url> [--name <n>]`

Clone a repo into `<runtime>/repos/`. The only command that clones. Name is derived from the URL (last segment minus `.git`) unless `--name` overrides.

### `mx repo ls [--porcelain]`

List all pristine clones, one per row, with bullet markers:

```
• analytics      main  /tmp/src-analytics
• app            main  /tmp/src-app
```

### `mx repo -n <name> fetch`

Run `git fetch --all --prune --tags`, then best-effort fast-forward the checked-out branch. Reports the branch and the list of branches now on origin.

### `mx repo -n <name> info [--porcelain]`

Detail block for one repo: name, path, current branch, remote URL, and which works currently hold a worktree of it.

### `mx repo health [--porcelain]` / `mx repo -n <name> health [--porcelain]`

Purely-local health check. **No network, no fetch.** Surfaces drift from the expected "checked-out on default branch, clean working tree, in sync with origin" state.

**Checks**: default branch (from `origin/HEAD` symbolic ref, set at clone time), current branch, uncommitted changes, untracked files, ahead/behind origin/<branch> (compared against last fetch), last-fetched timestamp (`.git/FETCH_HEAD` mtime), worktrees-in-works.

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
```

**Exit code is 0** even when issues are found (read-only convention). To refresh the "behind" numbers against actual origin, run `mx repo -n <name> fetch` first.

### `mx repo -n <name> rm`

Remove the pristine clone. Refuses with `IN_USE` if any work still has a worktree of it.

## Works (features)

### `mx work new <name> [--description <text>]`

Create a new work: folder under `works/<name>/`, empty `work.json`, empty `.code-workspace`, empty `sessions/`. Prints the absolute path.

The name is immutable.

### `mx work ls [--all|--archived] [--porcelain]`

Detailed listing of works. Default: **active only**. `--all` includes archived. `--archived` filters to archived only.

Per-work block: bullet + work name (dim when archived), optional `[archived YYYY-MM-DD]` chip, description (em-dash subtitle if present), indented worktree rows with branches + ports:

```
• checkout-revamp
  — Stripe + Adyen multi-PSP rollout
  app     [checkout-flow]  web:3000  api:3001
  worker  [checkout-flow]  billing-worker:3002

• legacy-csv-export  [archived 2026-06-07]
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

### `mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>]`

Create a git worktree of `<repo>` inside the work, on branch `<b>` (defaults to the work name). If the branch doesn't already exist, it's created.

`--base <ref>` is where the new branch forks from. Accepts any ref. A bare branch name resolves to a local branch or `origin/<name>` (with fallback). Resolved to a commit SHA before `git worktree add` so git's DWIM can't override `-b`. Omit `--base` to fork from the pristine clone's current HEAD.

Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit.

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
| `ALREADY_ARCHIVED` | archive called on an archived work |
| `NOT_ARCHIVED` | unarchive called on a non-archived work |
| `NEED_FORCE` | mutating action gated behind `--force` |
| `NEED_CONFIRMATION` | mutating action requires `--yes` (e.g. archive in `--porcelain` / non-TTY) |
| `INTERNAL` | non-`MxError` thrown — bug |
