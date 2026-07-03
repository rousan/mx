# The runtime model

What an mx runtime looks like on disk, the contracts mx owns, and the data shapes you should expect.

## Layout

```
<runtime>/  (e.g. ~/mx, or wherever $MX_RUNTIME points)
├── .mx-root                     # empty marker file — "this is the mx root"
├── mx.json                      # runtime config: { "version": 3 } (absent = legacy v1)
├── CLAUDE.md                    # stamped from templates/CLAUDE.md; rules for feature sessions
├── hooks/                       # central HOOK HUB — one executable per lifecycle event (see § Hooks below)
│   ├── pre-worktree-create      # … post-worktree-create, pre/post-worktree-remove,
│   ├── post-worktree-create     #   pre/post-work-archive, pre/post-work-unarchive,
│   └── repo-health              #   pre/post-repo-fetch, repo-health, work-health
├── bin/                         # runtime-wide utility executables for PATH (see § Runtime bin below)
│   ├── dcs                      # mx-shipped: delete a Claude Code session by name
│   └── lcs                      # mx-shipped: list Claude Code sessions
├── context/                     # shared memory across all features (see § Context registry below)
│   ├── INDEX.json               # single source of truth for entry metadata
│   └── <path>.md                # body-only entries (nested folders allowed)
├── repos/                       # one container per repo
│   ├── repo-a/
│   │   ├── git/                 # the pristine clone — READ-ONLY reference for worktrees
│   │   └── repo.json            # repo metadata { "name": "repo-a" }
│   └── repo-b/
│       ├── git/
│       └── repo.json
└── works/                       # one folder per parallel feature
    └── feature-a/
        ├── work.json                # per-work manifest (owned by mx; never hand-edit)
        ├── feature-a.code-workspace # VS Code workspace (owned by mx; folder paths → wt/<repo>)
        ├── CLAUDE.md                # work-specific rules (stamped once, then user-owned)
        ├── wt/                      # all worktrees live here
        │   ├── repo-a/              # git worktree on the feature branch
        │   └── repo-b/              # git worktree on the feature branch
        ├── scripts/                 # ad-hoc per-work scripts (and per-work binaries)
        ├── files/                   # keepable artifacts (agent/user drop zone)
        ├── tmp/                     # throwaway scratch (deletable at any time)
        └── sessions/                # one .md per session (see § Session summaries below)
            └── 2026-06-12-14-30-flaky-checkout-rca.md
```

## Runtime versioning

`<runtime>/mx.json` holds an integer for the runtime's on-disk layout version (currently `3`). An **absent** file means a legacy **v1** runtime.

A given CLI supports exactly one runtime version, with the mapping **CLI major ⇄ runtime version** (CLI 2.x ⇄ v2). Before any runtime-touching command, mx compares the runtime's `mx.json` against the version it supports; on a mismatch it refuses with `RUNTIME_VERSION_MISMATCH`. The only commands allowed on a mismatched runtime are `mx migrate`, `mx update` (self-update the CLI — doesn't touch the runtime), `mx help`, and `mx version`.

- **Runtime older than the CLI** → run `mx migrate` to upgrade it. The **v1 → v2** step moves each clone into `repos/<repo>/git/` (`git worktree repair`) and each work's flat worktrees into `wt/` (`git worktree move`), creating the per-work dirs and rewriting `.code-workspace` paths. The **v2 → v3** step centralizes hooks: it stamps the `<runtime>/hooks/` hub, writes each repo's `repo.json`, and retires the old per-repo `hydrate.sh`/`health.sh` and per-work `hooks/` — removing them when unchanged from the mx default, **keeping them with a warning** when customized so you can migrate the logic by hand. `mx migrate` validates the whole chain before mutating; a missing step errors `NO_MIGRATION`. Pass `mx migrate --dry-run` to preview the whole plan and any warnings without changing anything.
- **Runtime newer than the CLI** → upgrade the CLI (`mx update`, then `npm i -g @roulabs/mx@<N>` for a new major). `mx migrate` against a newer runtime errors `CLI_TOO_OLD`.

`mx init` stamps `mx.json` on a fresh runtime and refuses to adopt an existing runtime whose version differs. A malformed `mx.json` errors `BAD_VERSION`.

## Hooks (`<runtime>/hooks/`)

All lifecycle hooks live in **one** runtime-wide directory — `<runtime>/hooks/` — with **one executable per event**, named exactly for the event (no extension). This replaces v2's per-repo `hydrate.sh`/`health.sh` and per-work `hooks/`. `mx init` stamps a documented no-op for each event; `mx sync` backfills any that are missing but **never overwrites** your edits. Because a hook fires for every repo/work, you branch on the context inside it. Write them in any language (set the shebang); delete a file to disable that event.

| event | fires | non-zero exit |
|---|---|---|
| `pre-worktree-create` / `post-worktree-create` | around `worktree add` (post = the "hydrate" step, cwd = new worktree) | pre **aborts** (`HOOK_FAILED`); post warns |
| `pre-worktree-remove` / `post-worktree-remove` | around `worktree rm` | pre **aborts**; post warns |
| `pre-work-archive` / `post-work-archive` | around `mx work archive` | pre **aborts**; post warns |
| `pre-work-unarchive` / `post-work-unarchive` | around `mx work unarchive` | pre **aborts**; post warns |
| `pre-repo-fetch` / `post-repo-fetch` | around `mx repo fetch` (cwd = git clone) | pre **aborts**; post warns |
| `repo-health` | during `mx repo health` (cwd = git clone) | stdout captured into `extra` (silent when healthy: empty/`ok` → ✓, other output → ⚠); failure → `extra: null` |
| `work-health` | during `mx work health` / `mx health` (cwd = work folder) | stdout captured into `extra` (same convention); failure → `extra: null` |

Context arrives via `MX_*` env vars — always `MX_EVENT` + `MX_RUNTIME`, plus event-specific ones like `MX_WORK`, `MX_REPO`, `MX_BRANCH`, `MX_BASE`, `MX_WORKTREE_PATH`, `MX_WORK_PATH`, `MX_GIT_DIR`, `MX_REPO_PATH`. Each shipped template documents its own set (worktree events also get `MX_WORKTREE_NAME`). To skip hydration, make `post-worktree-create` a no-op — there is no `--no-hydrate` flag or `worktree hydrate` subcommand.

## Runtime bin (`<runtime>/bin/`)

A single runtime-wide directory of utility executables shared across every work, meant to be on your `PATH`. mx ships some and you add your own; any executable file is picked up.

- **Shipped bins** come from the CLI's bundled `templates/bin/` and are stamped into `<runtime>/bin/` by `mx init` and `mx sync`. They're **mx-owned: re-stamped (overwritten) on every sync**, like the runtime `CLAUDE.md`, so improvements land automatically when you upgrade. Currently shipped: `dcs` (delete a Claude Code session by `/rename` name or id) and `lcs` (list all Claude Code sessions). To customize one without losing it on the next sync, copy it to a new name.
- **Your own bins** — drop any executable into `<runtime>/bin/`; mx never touches files it didn't ship.
- **PATH** — mx can't edit your shell config, so add the directory yourself once: `export PATH="$(mx bin path):$PATH"`. `mx bin ls` reports whether it's currently on `PATH`.

This is distinct from a work's `scripts/` (scoped to one work). See [`mx bin`](commands.md#mx-bin-ls--mx-bin-path-alias-mx-bins).

## Loading the context-registry index

There is **no** `SessionStart` hook. mx through v2 stamped a per-work `.claude/settings.json` whose `SessionStart` hook printed `context/INDEX.json` into every session, but Claude Code caps hook output (~2KB), so a non-trivial index was silently truncated. v3 drops the hook entirely (the v3 migration removes a default-stamped one — see [migrate](commands.md#mx-migrate)).

Instead, the runtime `CLAUDE.md` instructs the session to read the whole `context/INDEX.json` itself, uncapped, on every task. A user can also force a fresh full load mid-session by saying something like "load the mx ctx index as whole", which tells the session to re-read the entire file.

## The work folder

A work folder (`works/<feature>/`) is more than a flat bag of worktrees. Its shape:

- **`wt/`** — **all** worktrees live here, at `wt/<worktree-name>` (each on its branch). The worktree name defaults to the repo, so it's usually `wt/<repo>`; a work can hold several worktrees of one repo by naming the extras. `mx work … worktree add` creates them here, and the `.code-workspace` folder entries point at `wt/<name>`.
- **`CLAUDE.md`** — work-specific Claude rules. mx stamps it once (an explanatory comment, otherwise empty) and **never overwrites it** afterward. It loads **alongside** the runtime's `CLAUDE.md` for any session started in the work folder, because Claude Code walks up from the session's cwd collecting `CLAUDE.md` files. Put rules specific to this one work here.
- **`scripts/`** — ad-hoc scripts for this work (also where any per-work helper binary goes; there is no per-work `bin/` — runtime-wide tools live in the runtime's [`bin/`](#runtime-bin)).
- **`files/`** — artifacts worth keeping: notes, exports, scratch docs, downloads meant to survive.
- **`tmp/`** — throwaway scratch; its contents may be deleted at **any** time with no guarantees.
- **`sessions/`** — session summaries (see [Session summaries](#session-summaries)).

### The work folder root holds mx-native files only

The work-folder **root** is reserved for mx-native files (`work.json`, the `.code-workspace`, the work `CLAUDE.md`) and the mx-owned subfolders above. Sessions and users must **not** create ad-hoc files directly in the root — keepable artifacts go in `files/`, throwaway scratch in `tmp/`, scripts (and per-work binaries) in `scripts/`. The one exception is a runtime file a session legitimately needs at the root for tooling to work (e.g. an MCP connection file like `.<something>-mcp`); the rule targets ad-hoc user/agent files (notes, downloads, temp outputs), not necessary tooling files. The runtime `CLAUDE.md` states this rule for feature sessions.

### `inferContext` and the `wt/` segment

Because worktrees live under `wt/`, the **third** path segment of a work path is the worktree **name**: `works/<work>/wt/<name>/…` implies the work, and the repo is resolved from that worktree's `work.json` entry (the name defaults to the repo, so it's usually `wt/<repo>`). Other work subdirs (`scripts/`, `files/`, `tmp/`, `sessions/`) imply the work but **no** repo.

## `work.json` schema

```json
{
  "name": "feature-a",
  "description": "Add a chatbox to the answer panel",
  "worktrees": [
    { "repo": "repo-a", "name": "repo-a", "branch": "feature-a", "ports": { "web": 3000, "api": 3001 } },
    { "repo": "repo-a", "name": "repo-a-pr2", "branch": "fix", "ports": { "web": 3002 } },
    { "repo": "repo-b", "name": "repo-b", "branch": "feature-a", "ports": { "worker": 3003 } }
  ],
  "isArchived": false,
  "archived_at": null
}
```

Fields:

- `name` — immutable; matches the work folder name.
- `description` — free-text; set on `mx work new --description "…"` or `mx work -n <n> describe "…"`.
- `worktrees[]` — one entry per worktree. `repo` is the pristine repo; `name` is the worktree's identifier (its `wt/<name>` directory and the `rm`/`port` selector), defaulting to the repo name. A work may hold **several worktrees of the same repo** by giving the extras distinct names (above, `repo-a` and `repo-a-pr2`). `branch` is the worktree's branch; `ports` is a `service → port` map local to that worktree. (Older `work.json` may omit `name`; it then defaults to `repo`, and `mx migrate` backfills it.) When you switch a worktree to a different branch (with plain `git checkout` inside the worktree — mx never checks out for you), don't hand-edit `branch` here: run `mx work -n <name> worktree set-branch <wt-name>`, which reads the worktree's live branch and updates this field.
- `isArchived` — true after `mx work archive`; cleared by `mx work unarchive`. Archiving also **clears each worktree's `ports`** (frees them); unarchive re-creates the worktrees and fires `post-worktree-create` per worktree, where ports are re-allocated.
- `archived_at` — ISO-8601 timestamp set when `isArchived` flips to true; deleted on unarchive (absent in JSON, not `null`).

There is **no port-block concept**. Each port is allocated individually and is **unique across all works** in the runtime — when you `mx work -n <n> port set <worktree> <service>`, mx finds a free port across every work's port set.

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
| **mx** (programmatic) | `.mx-root` marker, `mx.json`, `repos/<repo>/` container incl. `git/` (created by `repo add` clone; touched only by `repo fetch`/`repo rm`/`migrate`) and `repo.json`, `works/<feature>/` (created by `work new`), `work.json`, `.code-workspace`, the per-work directories `wt/` / `scripts/` / `files/` / `tmp/` / `sessions/` (directories only — their contents are agent/user-written), the runtime `hooks/` and `bin/` directories, `context/INDEX.json` (only the starter empty array is stamped; subsequent edits are by the agent) |
| **mx-stamped templates** (rewritten / stamped on `mx sync`) | `<runtime>/CLAUDE.md` (always rewritten), `<runtime>/bin/<shipped>` (mx-owned utility bins, e.g. `dcs`/`lcs` — **always re-stamped**, like `CLAUDE.md`), `<runtime>/hooks/<event>` (stamp-if-missing — your logic, never clobbered), `<runtime>/context/INDEX.json` (only if missing — never overwrites user content), `repos/<repo>/repo.json` (written when missing), `works/<feature>/CLAUDE.md` (stamp-if-missing — stamped once, then user-owned) |
| **The user / agent** (mx never touches after stamping) | All worktree code, the contents of `wt/` / `scripts/` / `files/` / `tmp/`, your own `<runtime>/bin/` additions (any name mx doesn't ship), the `<runtime>/hooks/<event>` bodies once stamped, `context/<path>.md` body files, `INDEX.json` content after init, `sessions/*.md` files, the work `CLAUDE.md` after it's stamped |

`mx sync` is non-destructive: it re-stamps the mx-owned generated content (runtime `CLAUDE.md`), backfills mx-owned structural directories and stamp-if-missing files (the central `hooks/` hub, the runtime `bin/` and its shipped utility bins, each repo's `repo.json`, the per-work `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` directories, the per-work `CLAUDE.md`), and removes a stale `<runtime>/README.md` if one lingers. It never overwrites user-edited content in the "user / agent owns" column. (`mx update` is now a separate command that self-updates the CLI — see [commands](commands.md#mx-update).)

## Discovery: `--runtime` / `$MX_RUNTIME` / `~/mx`

The CLI resolves the runtime in this order, picking the first that's set:

1. `--runtime <path>` flag
2. `$MX_RUNTIME` environment variable
3. Default `~/mx`

No pointer file is written anywhere in the source tree — runtimes are entirely env-addressed. This lets you have multiple independent runtimes on one machine (one productive, several test sandboxes) by just changing `$MX_RUNTIME`.

## `inferContext` — cwd → work / repo

When you're inside `<runtime>/works/<work>/...`, `mx work info` (etc.) infer the work from the cwd. A repo is inferred from a worktree path `<runtime>/works/<work>/wt/<name>/...` — the segment after `wt/` is the worktree name, resolved to its repo via `work.json`; the other work subdirs (`scripts/`, `files/`, `tmp/`, `sessions/`) imply the work but no repo. Same for `<runtime>/repos/<repo>/...` inferring the repo. So you can drop `-n <name>` in most contexts.

Implementation: `inferContext(root)` in `runtime.ts` does a `realpath` comparison so symlinked runtime roots (e.g. macOS `/tmp` → `/private/tmp`) still match.
