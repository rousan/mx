# The runtime model

What an mx runtime looks like on disk, the contracts mx owns, and the data shapes you should expect.

## Layout

```
<runtime>/  (e.g. ~/mx, or wherever $MX_RUNTIME points)
├── .mx-root                     # empty marker file — "this is the mx root"
├── mx.json                      # runtime config: { "version": 2 } (absent = legacy v1)
├── CLAUDE.md                    # stamped from templates/CLAUDE.md; rules for feature sessions
├── bin/                         # runtime-wide utility executables for PATH (see § Runtime bin below)
│   ├── dcs                      # mx-shipped: delete a Claude Code session by name
│   └── lcs                      # mx-shipped: list Claude Code sessions
├── context/                     # shared memory across all features (see § Context registry below)
│   ├── INDEX.json               # single source of truth for entry metadata
│   └── <path>.md                # body-only entries (nested folders allowed)
├── repos/                       # one container per repo
│   ├── repo-a/
│   │   ├── git/                 # the pristine clone — READ-ONLY reference for worktrees
│   │   ├── hydrate.sh             # runs after `worktree add` (customizable)
│   │   └── health.sh            # augments `mx repo health` (customizable)
│   └── repo-b/
│       ├── git/
│       ├── hydrate.sh
│       └── health.sh
└── works/                       # one folder per parallel feature
    └── feature-a/
        ├── work.json                # per-work manifest (owned by mx; never hand-edit)
        ├── feature-a.code-workspace # VS Code workspace (owned by mx; folder paths → wt/<repo>)
        ├── CLAUDE.md                # work-specific rules (stamped once, then user-owned)
        ├── .claude/settings.json    # SessionStart hook → loads context/INDEX.json
        ├── wt/                      # all worktrees live here
        │   ├── repo-a/              # git worktree on the feature branch
        │   └── repo-b/              # git worktree on the feature branch
        ├── scripts/                 # ad-hoc per-work scripts (and per-work binaries)
        ├── files/                   # keepable artifacts (agent/user drop zone)
        ├── tmp/                     # throwaway scratch (deletable at any time)
        ├── hooks/                   # per-work lifecycle hooks (see § Per-work lifecycle hooks)
        │   ├── pre-archive.sh       # {pre,post}-{archive,unarchive}.sh — stamped no-op scripts
        │   ├── post-archive.sh
        │   ├── pre-unarchive.sh
        │   └── post-unarchive.sh
        └── sessions/                # one .md per session (see § Session summaries below)
            └── 2026-06-12-14-30-flaky-checkout-rca.md
```

## Runtime versioning

`<runtime>/mx.json` holds an integer for the runtime's on-disk layout version (currently `2`). An **absent** file means a legacy **v1** runtime.

A given CLI supports exactly one runtime version, with the mapping **CLI major ⇄ runtime version** (CLI 2.x ⇄ v2). Before any runtime-touching command, mx compares the runtime's `mx.json` against the version it supports; on a mismatch it refuses with `RUNTIME_VERSION_MISMATCH`. The only commands allowed on a mismatched runtime are `mx migrate`, `mx update` (self-update the CLI — doesn't touch the runtime), `mx help`, and `mx version`.

- **Runtime older than the CLI** → run `mx migrate` to upgrade it. The registered v1 → v2 step upgrades both the repo and work layouts: it moves each clone into `repos/<repo>/git/` (`git worktree repair`), and restructures every work — moving its flat worktrees into `wt/` (`git worktree move`), creating the new `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` folders, stamping the work `CLAUDE.md`, and rewriting the `.code-workspace` folder paths to `wt/<repo>`. `mx migrate` validates the whole chain before mutating; a missing step errors `NO_MIGRATION`. (The `hooks/` folder and its scripts, added later, are not part of the v1 → v2 step — they're backfilled stamp-if-missing by `mx sync` on any v2 runtime.) Pass `mx migrate --dry-run` to preview the whole plan — every path it would move, stamp, or create — without changing anything; the validation still runs, so an impossible migration still errors up front.
- **Runtime newer than the CLI** → upgrade the CLI (`mx update`, then `npm i -g @roulabs/mx@<N>` for a new major). `mx migrate` against a newer runtime errors `CLI_TOO_OLD`.

`mx init` stamps `mx.json` on a fresh runtime and refuses to adopt an existing runtime whose version differs. A malformed `mx.json` errors `BAD_VERSION`.

## Per-repo scripts (`hydrate.sh`, `health.sh`)

Each repo container at `repos/<repo>/` holds two mx-owned-but-user-customizable hooks alongside the `git/` clone. Both are stamped on `mx repo add` and backfilled stamp-if-missing (executable) by `mx sync`.

- **`hydrate.sh`** (default: `echo "Setup is done"`) runs automatically after `mx work … worktree add <repo>`, with the new worktree as cwd. Context arrives as positional args (`$1` = worktree path, `$2` = branch) and env vars (`MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_RUNTIME`). A non-zero exit on the automatic run is a warning (worktree kept). Skip with `worktree add --no-hydrate`; re-run explicitly with `mx work … worktree hydrate <repo>` (non-zero exit then errors `HYDRATE_FAILED`). Typical uses: copy a `.env`, allocate + wire a port, install deps.
- **`health.sh`** (default: documented no-op) runs during `mx repo health` with the git clone as cwd; env: `MX_REPO`, `MX_REPO_PATH`, `MX_GIT_DIR`, `MX_RUNTIME`. Its stdout is captured into the `extra` field; a missing/empty/failing hook yields `extra: null` and never affects `healthy` / `issues`.

## Runtime bin (`<runtime>/bin/`)

A single runtime-wide directory of utility executables shared across every work, meant to be on your `PATH`. mx ships some and you add your own; any executable file is picked up.

- **Shipped bins** come from the CLI's bundled `templates/bin/` and are stamped into `<runtime>/bin/` by `mx init` and `mx sync`. They're **mx-owned: re-stamped (overwritten) on every sync**, like the runtime `CLAUDE.md`, so improvements land automatically when you upgrade. Currently shipped: `dcs` (delete a Claude Code session by `/rename` name or id) and `lcs` (list all Claude Code sessions). To customize one without losing it on the next sync, copy it to a new name.
- **Your own bins** — drop any executable into `<runtime>/bin/`; mx never touches files it didn't ship.
- **PATH** — mx can't edit your shell config, so add the directory yourself once: `export PATH="$(mx bin path):$PATH"`. `mx bin ls` reports whether it's currently on `PATH`.

This is distinct from a work's `scripts/` (scoped to one work). See [`mx bin`](commands.md#mx-bin-ls--mx-bin-path-alias-mx-bins).

## Per-work context-index hook (`.claude/settings.json`)

`mx work new` and `mx sync` generate `works/<feature>/.claude/settings.json` — a Claude Code `SessionStart` hook that prints the runtime's `context/INDEX.json` into every session launched in the work folder, so the context-registry catalog loads deterministically (CLAUDE.md prose alone was unreliable). It's per-work because Claude Code reads `.claude/settings.json` only from the session's launch directory, and mx sessions launch in the work folder. Stamp-if-missing — user edits are preserved.

## Per-work lifecycle hooks (`hooks/`)

Each work has a `hooks/` folder holding mx-owned-but-user-customizable scripts that fire around archive/unarchive. `mx work new` and `mx sync` stamp four documented, executable **no-op** scripts (they just `exit 0`, so an un-customized hook is inert):

| script | runs | non-zero exit |
|---|---|---|
| `pre-archive.sh` | before `mx work archive` removes worktrees (worktrees still on disk) | **aborts** the archive (`HOOK_FAILED`); nothing mutated |
| `post-archive.sh` | after a successful archive (worktrees gone, branches kept) | warning only |
| `pre-unarchive.sh` | before `mx work unarchive` re-creates worktrees (none on disk) | **aborts** the unarchive (`HOOK_FAILED`) |
| `post-unarchive.sh` | after worktrees are restored | warning only |

Each runs with the **work folder** as cwd. Context arrives as positional args (`$1` = event name, `$2` = work path) and env vars (`MX_EVENT`, `MX_WORK`, `MX_WORK_PATH`, `MX_RUNTIME`). A `pre-*` hook is a veto point (e.g. block archive when a branch has unpushed commits); a `post-*` hook is for after-the-fact cleanup or notification. The event set is `WORK_HOOK_EVENTS` in `@mx/core`; the CLI runner is `apps/cli/src/workhooks.ts`. In `--porcelain` mode hook stdio is suppressed, but a `pre-*` veto still aborts with a JSON `HOOK_FAILED` error.

## The work folder

A work folder (`works/<feature>/`) is more than a flat bag of worktrees. Its shape:

- **`wt/`** — **all** worktrees live here, one per repo at `wt/<repo>` (each on the feature branch). This is the only place worktrees go; `mx work … worktree add` creates them here, and the `.code-workspace` folder entries point at `wt/<repo>` (the entry `name` stays the bare repo name).
- **`CLAUDE.md`** — work-specific Claude rules. mx stamps it once (an explanatory comment, otherwise empty) and **never overwrites it** afterward. It loads **alongside** the runtime's `CLAUDE.md` for any session started in the work folder, because Claude Code walks up from the session's cwd collecting `CLAUDE.md` files. Put rules specific to this one work here.
- **`scripts/`** — ad-hoc scripts for this work (also where any per-work helper binary goes; there is no per-work `bin/` — runtime-wide tools live in the runtime's [`bin/`](#runtime-bin)).
- **`files/`** — artifacts worth keeping: notes, exports, scratch docs, downloads meant to survive.
- **`tmp/`** — throwaway scratch; its contents may be deleted at **any** time with no guarantees.
- **`hooks/`** — per-work lifecycle hook scripts (see [Per-work lifecycle hooks](#per-work-lifecycle-hooks-hooks)).
- **`sessions/`** — session summaries (see [Session summaries](#session-summaries)).

### The work folder root holds mx-native files only

The work-folder **root** is reserved for mx-native files (`work.json`, the `.code-workspace`, the work `CLAUDE.md`, `.claude/`) and the mx-owned subfolders above. Sessions and users must **not** create ad-hoc files directly in the root — keepable artifacts go in `files/`, throwaway scratch in `tmp/`, scripts (and per-work binaries) in `scripts/`. The one exception is a runtime file a session legitimately needs at the root for tooling to work (e.g. an MCP connection file like `.<something>-mcp`); the rule targets ad-hoc user/agent files (notes, downloads, temp outputs), not necessary tooling files. The runtime `CLAUDE.md` states this rule for feature sessions.

### `inferContext` and the `wt/` segment

Because worktrees now live under `wt/`, a repo is inferred from the **third** path segment of a work path: `works/<work>/wt/<repo>/…` implies both the work and the repo. Other work subdirs (`scripts/`, `files/`, `tmp/`, `hooks/`, `sessions/`) imply the work but **no** repo.

## `work.json` schema

```json
{
  "name": "feature-a",
  "description": "Add a chatbox to the answer panel",
  "worktrees": [
    { "repo": "repo-a", "branch": "feature-a", "ports": { "web": 3000, "api": 3001 } },
    { "repo": "repo-b", "branch": "feature-a", "ports": { "worker": 3002 } }
  ],
  "isArchived": false,
  "archived_at": null
}
```

Fields:

- `name` — immutable; matches the work folder name.
- `description` — free-text; set on `mx work new --description "…"` or `mx work -n <n> describe "…"`.
- `worktrees[]` — one per repo. `branch` is the worktree's branch. `ports` is a `service → port` map local to that worktree.
- `isArchived` — true after `mx work archive`; cleared by `mx work unarchive`.
- `archived_at` — ISO-8601 timestamp set when `isArchived` flips to true; deleted on unarchive (absent in JSON, not `null`).

There is **no port-block concept**. Each port is allocated individually and is **unique across all works** in the runtime — when you `mx work -n <n> port set <repo> <service>`, mx finds a free port across every work's port set.

## `context/INDEX.json` schema

```json
[
  {
    "path": "auth/tokens",
    "description": "Session tokens namespaced by tenant_id, 30-day expiry, rotated on password or role change. Validated at the edge in middleware/auth.go. Read when touching multi-tenant request handling or session lifecycle.",
    "type": "fact",
    "tags": ["auth", "security"],
    "related": ["auth/tenant-isolation"],
    "last_verified": "2026-06-05"
  }
]
```

**Closed schema** — these fields, these types, nothing else:

| field | type | required | notes |
|---|---|---|---|
| `path` | `string` | yes | **unique identifier**. Kebab-case segments separated by `/`. No `.md` extension. Regex `^[a-z0-9-]+(/[a-z0-9-]+)*$`. File lives at `<runtime>/context/<path>.md`. |
| `description` | `string` | yes | 1–3 sentences: gist + scope + when-relevant. Enough to decide whether to open the body. |
| `type` | `string` | no | Suggested vocab: `fact`, `decision`, `runbook`, `note`, `skill`. Free-form. |
| `tags` | `string[]` | no | Free-form tag strings. |
| `related` | `string[]` | no | Each item is another entry's `path`. |
| `last_verified` | `string` | no | ISO date `YYYY-MM-DD`. For entries where freshness matters. |

Body files (`<runtime>/context/<path>.md`) hold **only the prose** — no frontmatter, no in-file header. To know what an entry is about, look up its `path` in `INDEX.json`.

This separation is deliberate: a single Read of `INDEX.json` gives the agent every entry's metadata at once, so it can decide which file bodies to open without reading them all.

### Context-registry protocol (runtime CLAUDE.md instructs the agent to follow this)

- **Read** `INDEX.json` on every non-trivial task. Skim the descriptions; open the bodies whose metadata matches the task.
- **Fallbacks** when INDEX descriptions don't surface a match: grep the folder; `ls` recursively to spot orphans; follow `related` chains; read everything when in doubt.
- **Maintain `INDEX.json`** in the same change that adds/renames/removes a body file. Drift means orphan files (invisible) or stale entries (false positives).
- **Three write triggers**: (1) user asks ("save this", "remember this"); (2) agent makes a non-obvious discovery and proposes the entry inline, user confirms; (3) at end of a substantial session, agent reviews and proposes 1–3 entries.
- For **ephemeral scratch** (debugging journeys in progress) — write without asking.

## Session summaries

`works/<feature>/sessions/` accumulates one markdown file per working session. The goal: another agent (a fresh Claude session, or Codex / Cursor) can read these files and start a new session with full context — including findings from external sources that may no longer be accessible (URLs that 404, attached images, fetched docs).

### Single trigger only

Write a session summary **only when the user explicitly asks at end of session** ("add the session summary before I close", "save this session"). **Never auto-write. Never propose mid-session. Never proactively suggest at end of session unless asked.** The user owns the trigger.

### Filename

`works/<feature>/sessions/YYYY-MM-DD-HH-MM-<slug>.md` — date, 24-hour time (dash-separated; colons aren't portable on Windows), and a short kebab-case slug for the session's subject.

### Content shape

Distillation, **not** a transcript. Capture the substance so a future agent can pick up cold without re-doing all the discovery:

- **Goal** — what we set out to do this session.
- **What we learned from external sources** — fetched URLs, attached images, attached files, web searches. Distill the *findings* into the summary; the originals may not be accessible later.
- **What worked** — code shipped, decisions reached. Include commit SHAs / PR links.
- **Dead ends** — hypotheses tried and falsified, approaches abandoned, *why* each was abandoned.
- **Files touched** — paths modified, with a sentence on what changed.
- **State at session end** — in-flight changes, tests passing/failing, PRs open, commits ahead of main.
- **Next steps / open questions** — what should the next session pick up?
- **Cross-references** — context-registry entries created/updated this session (by `path`); prior session files this builds on (by filename).

## What mx owns vs what the user/agent owns

| owned by | what |
|---|---|
| **mx** (programmatic) | `.mx-root` marker, `mx.json`, `repos/<repo>/` container incl. `git/` (created by `repo add` clone; touched only by `repo fetch`/`repo rm`/`migrate`), `works/<feature>/` (created by `work new`), `work.json`, `.code-workspace`, the per-work directories `wt/` / `scripts/` / `files/` / `tmp/` / `hooks/` / `sessions/` (directories only — their contents are agent/user-written), the runtime `bin/` directory, `context/INDEX.json` (only the starter empty array is stamped; subsequent edits are by the agent) |
| **mx-stamped templates** (rewritten / stamped on `mx sync`) | `<runtime>/CLAUDE.md` (always rewritten), `<runtime>/bin/<shipped>` (mx-owned utility bins, e.g. `dcs`/`lcs` — **always re-stamped**, like `CLAUDE.md`), `<runtime>/context/INDEX.json` (only if missing — never overwrites user content), `repos/<repo>/{hydrate.sh,health.sh}` (stamp-if-missing), `works/<feature>/CLAUDE.md` (stamp-if-missing — stamped once, then user-owned), `works/<feature>/.claude/settings.json` (stamp-if-missing), `works/<feature>/hooks/{pre,post}-{archive,unarchive}.sh` (stamp-if-missing no-ops) |
| **The user / agent** (mx never touches after stamping) | All worktree code, the contents of `wt/` / `scripts/` / `files/` / `tmp/`, your own `<runtime>/bin/` additions (any name mx doesn't ship), `context/<path>.md` body files, `INDEX.json` content after init, `sessions/*.md` files, the work `CLAUDE.md` after it's stamped, the bodies of `hydrate.sh` / `health.sh` / `.claude/settings.json` / the work `hooks/*.sh` once stamped |

`mx sync` is non-destructive: it re-stamps the mx-owned generated content (runtime `CLAUDE.md`), backfills mx-owned structural directories and stamp-if-missing files (the runtime `bin/` and its shipped utility bins, the per-work `wt/`/`scripts/`/`files/`/`tmp/`/`hooks/`/`sessions/` directories, per-repo `hydrate.sh`/`health.sh`, the per-work `CLAUDE.md`, per-work `.claude/settings.json`, the per-work lifecycle hook scripts `hooks/{pre,post}-{archive,unarchive}.sh`), and removes a stale `<runtime>/README.md` if one lingers. It never overwrites user-edited content in the "user / agent owns" column. (`mx update` is now a separate command that self-updates the CLI — see [commands](commands.md#mx-update).)

## Discovery: `--runtime` / `$MX_RUNTIME` / `~/mx`

The CLI resolves the runtime in this order, picking the first that's set:

1. `--runtime <path>` flag
2. `$MX_RUNTIME` environment variable
3. Default `~/mx`

No pointer file is written anywhere in the source tree — runtimes are entirely env-addressed. This lets you have multiple independent runtimes on one machine (one productive, several test sandboxes) by just changing `$MX_RUNTIME`.

## `inferContext` — cwd → work / repo

When you're inside `<runtime>/works/<work>/...`, `mx work info` (etc.) infer the work from the cwd. A repo is inferred only from a worktree path `<runtime>/works/<work>/wt/<repo>/...` (the segment after `wt/`); the other work subdirs (`scripts/`, `files/`, `tmp/`, `hooks/`, `sessions/`) imply the work but no repo. Same for `<runtime>/repos/<repo>/...` inferring the repo. So you can drop `-n <name>` in most contexts.

Implementation: `inferContext(root)` in `runtime.ts` does a `realpath` comparison so symlinked runtime roots (e.g. macOS `/tmp` → `/private/tmp`) still match.
