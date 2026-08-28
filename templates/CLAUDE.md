<!-- Installed by the mx CLI. Don't hand-edit this file in the runtime —
     edit templates/CLAUDE.md in the mx source repo and run `mx sync`. -->

# mx — multiplexed parallel work across repos

**mx** ("multiplexer") is a system for running several features in parallel across shared repos,
using git worktrees. You are running inside an mx runtime. Read this fully before acting — the
rules here are not optional.

## The one idea that governs everything

**`mx` owns all runtime state.** The work manifest (`work.json`) and the VS Code workspace file
are managed *only* through `mx` commands. You **never** hand-edit `work.json` or the
`.code-workspace`, and you **never** create or remove worktrees with raw `git`. Whenever you need
to read or change the work — its repos, branches, ports — you call an `mx` command. Treat
`work.json` as read-only build output: look at it for orientation, but mutate it through `mx`.

Every read command takes `--porcelain` for stable JSON; parse that instead of scraping text.

## Runtime version gate

This runtime carries a layout version in `<runtime>/mx.json` (an integer). The `mx` CLI supports exactly
one runtime version (CLI major ⇄ runtime version). If the CLI and runtime versions don't match, **every
runtime command refuses** with error `RUNTIME_VERSION_MISMATCH` — only `mx migrate`, `mx update`,
`mx help`, and `mx version` are allowed. If you hit that error, **stop and tell the user**: run
`mx migrate` to upgrade an older runtime, or `mx update` (then a new-major install) to upgrade the CLI for
a newer runtime. Don't try to work around the gate by editing files by hand.

## What this runtime is for

`mx/` is where **feature work** happens. Sessions launched here implement a feature inside a
`works/<feature>/` folder. mx *itself* — this template, the `mx` CLI — is maintained in the
`github.com/rousan/mx` source repo. There are two valid setups for that source:

1. **It lives elsewhere** (the default): if you were opened here to change how mx works, you're in
   the wrong place — switch to that repo. Don't edit `repos/`, `works/`, or the runtime files from
   here.

2. **It's hosted as a work in this runtime** (self-hosting / dogfooding): someone has run
   `mx repo add git@github.com:rousan/mx.git` and created one or more `works/<feature>/mx/`
   worktrees for parallel mx development. In that case, working inside one of those worktrees IS
   valid — follow that worktree's own `CLAUDE.md` for the developer rules. The runtime rule that
   still applies here: **never run the worktree's locally-built mx CLI against this runtime**.
   Locally-built mx (`pnpm mx`, `node npm/bin/mx.js`) must be pointed at a sandbox (`$PWD/.mx` or
   `/tmp/...`) for any testing — otherwise it may re-stamp this `CLAUDE.md` with a work-in-progress
   template. The published `mx` on `$PATH` (from `npm i -g @rousan/mx`) is the safe one against
   this runtime.

## Layout

```
mx/
├── .mx-root                # empty marker: "this is the mx root"
├── mx.json                 # runtime config: { "version": 3 }
├── CLAUDE.md               # this file (installed by the mx CLI)
├── hooks/                  # the central HOOK HUB — one script per lifecycle event (see § Hooks)
│   ├── pre-worktree-create · post-worktree-create   # post = "hydrate" a new worktree
│   ├── pre-worktree-remove · post-worktree-remove
│   ├── pre-work-archive · post-work-archive
│   ├── pre-work-unarchive · post-work-unarchive
│   ├── pre-repo-fetch · post-repo-fetch
│   ├── repo-health         # augments `mx repo health`
│   ├── work-health         # augments `mx work health`
│   ├── session-prompt      # generates the initial prompt for a new session (mx work attach/open)
│   └── work-session        # customizes a work's tmux session layout after mx builds it
├── bin/                    # runtime-wide utility executables (put on PATH); mx ships some, add your own (see § Runtime bin)
├── context/                # shared memory across all features (see § Context registry)
│   ├── INDEX.json          # single source of truth — metadata for every entry
│   └── <path>.md           # body-only entries; nested folders allowed
├── files/                  # runtime-wide FREE-FORM store for operational values every work can read
│                           #   (creds, cluster names, tokens, key-value meta); empty by default (see § Files store)
├── repos/<repo>/           # per-repo container
│   ├── git/                # the PRISTINE clone (read-only reference)
│   └── repo.json           # repo metadata: { "name": "<repo>" }
└── works/                  # one folder per feature/work
    └── feature-a/
        ├── work.json       # manifest — owned by `mx`, do not hand-edit
        ├── feature-a.code-workspace  # owned by `mx` (folder paths point at wt/<repo>)
        ├── CLAUDE.md       # work-specific rules — stamped once, then yours to edit (mx never overwrites)
        ├── wt/             # ALL worktrees live here
        │   ├── repo-a/     # worktree of repo-a on this feature's branch
        │   └── repo-b/     # worktree of repo-b on this feature's branch
        ├── scripts/        # ad-hoc per-work scripts (also fine for per-work binaries)
        ├── files/          # artifacts worth keeping (agent/user drop zone)
        ├── tmp/            # throwaway scratch — may be deleted at any time
        └── sessions/       # session summaries (see § Session summaries)
```

- `repos/<repo>/git` are **source-of-truth clones** — read-only reference. Worktrees fork from them
  and share their `.git` object store. Never edit, commit, or run dev servers in `repos/`. The container
  also holds `repo.json` (`{ "name": … }`); there are **no** per-repo scripts — hooks are central.
- `hooks/` (at the runtime root) is the **single hub of lifecycle hooks** — mx runs one script per event
  (worktree create/remove, work archive/unarchive, repo fetch, repo health, work health) and you branch
  on `MX_*` inside. See § Hooks.
- `works/<feature>/wt/<repo>` are **worktrees**, each on its own feature branch. All work happens here.
- `works/<feature>/CLAUDE.md` is **work-specific guidance** that loads alongside this runtime
  `CLAUDE.md` for any session started in the work folder (Claude Code walks up from the session's cwd).
  mx stamps it once (an explanatory comment, otherwise empty) and then **never touches it** — it's where
  you and the user record rules specific to this work.
- `works/<feature>/{scripts,files,tmp}/` are the only places to put non-mx files in a work — see
  § The work folder holds mx-native files only.
- `bin/` (at the runtime root) holds **runtime-wide utility executables** meant for your `PATH` — mx
  ships a few and you can add your own. List them with `mx bin ls`. See § Runtime bin.
- `files/` (at the runtime root) is a **runtime-wide free-form store for operational values** shared by
  every work — credentials, cluster names, usernames, API keys/tokens, endpoints, any key-value meta a
  session needs to *do* things (Playwright login, calling an API, ssh, etc.). Empty by default; the
  layout is yours. See § Files store. Not to be confused with `context/` (knowledge) or a work's own
  `works/<feature>/files/` (per-work artifacts).

## Runtime bin

`<runtime>/bin/` is a single directory of utility executables shared across every work. mx ships some
(e.g. `dcs` / `lcs` for listing and deleting Claude Code sessions by name) and **you can drop your own
in** — any executable file works. It's meant to be on your `PATH`:

```
export PATH="$(mx bin path):$PATH"   # add to your shell rc once
mx bin ls                            # list bins (mx-shipped + your own), and whether bin/ is on PATH
```

mx-shipped bins are **mx-owned: re-stamped on every `mx sync`** (overwritten with the current
version's content, like the runtime `CLAUDE.md`), so improvements ship to you automatically. **Your own
bins** — any file mx doesn't ship — are never touched. To customize a shipped bin without losing it on
the next sync, copy it to a new name. This is distinct from a work's own `scripts/` folder, which is for
scripts scoped to that one work; `bin/` is runtime-wide and command-like.

## Files store

`<runtime>/files/` is a **runtime-wide, free-form store for operational values** — the concrete data a
work session needs to actually *do* things across any work: credentials, cluster names / URLs,
usernames, API keys and tokens, service endpoints, and any other key-value meta. It is created **empty**
and **the layout is entirely yours** — one `creds.env`, a nested `clusters/<name>.json`, a flat
`notes.md`, whatever fits. mx never reads, writes, or validates its contents; it only guarantees the
directory exists.

Use it when a task needs a value to operate: a Playwright browser login, calling an authenticated API,
an ssh target, a tenant/cluster name to plug into a command. Read from `$MX_RUNTIME/files/` (or the
absolute runtime path) from any work.

**How it differs from the neighbours — keep them separate:**

- **`context/` is knowledge; `files/` is values.** `context/` holds institutional memory (findings,
  decisions, runbooks, RCAs) — prose that explains *how the system works* and is indexed by
  `INDEX.json`. `files/` holds the raw operational *values* you plug in — no index, no schema, no prose
  requirement. A runbook that says "the dev cluster is reached at X with creds Y" is context; the actual
  X and Y live in `files/`.
- **Runtime `files/` is shared; a work's `works/<feature>/files/` is per-work.** The per-work one is a
  drop zone for artifacts scoped to that single work; this one is available to **every** work in the
  runtime. Put a value here when more than one work (now or later) may need it.

**Security note:** this is your **local** runtime — mx never commits or transmits `files/` (the runtime
root is not a git repo, and `repos/` clones are separate). Storing secrets here is a deliberate local
convenience; treat the machine accordingly and never copy `files/` into a repo/worktree that gets
committed.

## Hooks

A **hook** is a script mx runs at a lifecycle moment — when a worktree is created or removed, a work is
archived or unarchived, a repo is fetched, or `mx repo health` runs. They all live in **one place**,
`<runtime>/hooks/`, with **one executable per event** (named exactly for the event). mx stamps a
documented **no-op** for each on `mx init`; you edit them in place. They're stamp-if-missing — `mx sync`
re-adds any you delete but **never overwrites** your edits.

Because the hooks are runtime-wide (shared by every repo and work), you branch on the context **inside**
the script — e.g. a different hydrate for `web` vs `api`, or only for branch `release/*`. Write them in
**any language**: bash, Node, Python, anything — just set the shebang (`#!/usr/bin/env node`,
`#!/usr/bin/env python3`, …) and keep the file executable. Delete a hook file to disable that event.

| hook | fires | non-zero exit |
|---|---|---|
| `pre-worktree-create` | before `mx work worktree add` creates a worktree | **aborts** creation (`HOOK_FAILED`) |
| `post-worktree-create` | after a worktree is created — the "hydrate" step (cwd = the new worktree) | warning (worktree kept) |
| `pre-worktree-remove` / `post-worktree-remove` | around `mx work worktree rm` | pre **aborts**; post warns |
| `pre-work-archive` / `post-work-archive` | around `mx work archive` | pre **aborts**; post warns |
| `pre-work-unarchive` / `post-work-unarchive` | around `mx work unarchive` | pre **aborts**; post warns |
| `pre-repo-fetch` / `post-repo-fetch` | around `mx repo fetch` | pre **aborts**; post warns |
| `repo-health` | during `mx repo health` (cwd = the pristine clone) | stdout captured into the `extra` row (print nothing or `ok` when healthy → ✓, the problem when not → ⚠) |
| `work-health` | during `mx work health` / `mx health` (cwd = the work folder) | stdout captured into the `extra` row (same silent-when-healthy convention) |
| `session-prompt` | when `mx work attach`/`open` first CREATES a work's Claude session (cwd = the work folder) | stdout becomes the session's initial prompt (empty → clean session) |
| `work-session` | after mx BUILDS a work's tmux session, before attaching (cwd = the work folder) | post-style: a non-zero exit only warns; use it to rearrange/extend the default layout |

`pre-*` hooks are veto points (a non-zero exit aborts the operation before anything is mutated); `post-*`
hooks run after success and a non-zero exit is only a warning. Context arrives as `MX_*` environment
variables — always `$MX_EVENT` and `$MX_RUNTIME`, plus event-specific ones like `$MX_WORK`, `$MX_REPO`,
`$MX_BRANCH`, `$MX_BASE`, `$MX_WORKTREE_PATH`, `$MX_WORK_PATH`, `$MX_GIT_DIR`, `$MX_SESSION_NAME`,
`$MX_TMUX_SESSION`, `$MX_CLAUDE_SESSION_ID`. Each shipped hook's header comment documents exactly which
variables it gets and its working directory.

## The work folder holds mx-native files only

**Never create ad-hoc files directly in the work-folder root.** The root is reserved for mx-native
files (`work.json`, the `.code-workspace`, the work `CLAUDE.md`) and the mx-owned
subfolders. When you or the user need to write anything else, use one of these, never the root:

- **`files/`** — artifacts worth keeping: notes, exports, scratch docs, downloads you want to survive.
- **`tmp/`** — throwaway scratch. Its contents may be deleted at **any** time, with no guarantees —
  never rely on anything here persisting.
- **`scripts/`** — ad-hoc scripts for this work (also where any per-work helper binary goes — there is
  no per-work `bin/`; runtime-wide tools live in the runtime's `bin/`, see § Runtime bin).

The one exception: a runtime file a session legitimately needs to create at the work root for tooling
to work (e.g. an MCP connection file like `.<something>-mcp`) is fine. The rule targets *ad-hoc*
user/agent files — notes, downloads, temp outputs — not necessary tooling files.

## work.json (per-work manifest, owned by mx)

```json
{
  "name": "feature-a",
  "description": "Add a chatbox to the answer panel",
  "worktrees": [
    { "repo": "repo-a", "name": "repo-a", "branch": "feature-a", "ports": { "web": 3000, "api": 3001 } },
    { "repo": "repo-a", "name": "repo-a-pr2", "branch": "fix", "ports": { "web": 3002 } },
    { "repo": "repo-b", "name": "repo-b", "branch": "feature-a", "ports": { "worker": 3003 } }
  ]
}
```

- Each worktree has a **`name`** — its `wt/<name>` directory and the selector for `worktree rm` / `port`. It defaults to the repo name, so a work can hold **several worktrees of the same repo** by giving the extras distinct names (above, `repo-a` and `repo-a-pr2`). `ports` is a `service -> port` map local to that worktree.
- The work's `name` is immutable. There is no port-block concept — each port is allocated
  individually and is unique across **all** works.

## Orient yourself at the start of every session

1. You are launched from a **work folder** (`works/<feature>/`), not a single repo. There is no "main repo."
2. Read the work's state with `mx work -n <feature> info --porcelain` to learn its repos, branches, and ports.
3. When you edit a repo's worktree, follow that repo's own `CLAUDE.md`, linters, and conventions —
   its instructions live inside the worktree and apply. The work's own `CLAUDE.md` (at the work-folder
   root) also loads for sessions started here — read it for rules specific to this work.
4. The work root is **not** a git repo. Run build/test/git commands from inside the relevant worktree
   (`works/<feature>/wt/<repo>`).
5. If several sessions share one work, the user gives each a lane (usually one repo). Stay in your lane.

## Context registry — shared memory across every feature in this runtime

`<runtime>/context/` is mx-owned institutional memory for this runtime — findings, decisions, runbooks, notes, debugging journeys, RCAs, session summaries, project-local procedures, imported reference material, anything worth carrying across sessions. mx stamps a starter `INDEX.json` at init; everything after that is yours to shape.

### Two-file design

- **`INDEX.json`** — the **single source of truth** for all entry metadata. JSON array.
- **Body files** at `<runtime>/context/<path>.md` — **only the prose**. No frontmatter, no in-file header. To know what an entry is about, look up its `path` in INDEX.

### INDEX.json schema

Top-level JSON array of entry objects. The schema is **closed** — these fields, these types, nothing else. Adding ad-hoc fields will drift across sessions; don't.

| field | type | required | notes |
|---|---|---|---|
| `path` | `string` | yes | **The unique identifier.** Kebab-case segments separated by `/`. No `.md` extension. Regex: `^[a-z0-9-]+(/[a-z0-9-]+)*$`. File lives at `<runtime>/context/<path>.md`. |
| `description` | `string` | yes | 1–3 sentences covering (a) the gist / key claim, (b) where in the system it applies, (c) when this entry is relevant — enough to decide *whether to open the body* without actually opening it. |
| `type` | `string` | no | Free-form label. Suggested vocabulary: `fact`, `decision`, `runbook`, `note`, `skill`. |
| `tags` | `string[]` | no | Free-form tag strings. |
| `related` | `string[]` | no | Each item is another entry's `path`. |
| `last_verified` | `string` | no | ISO date `YYYY-MM-DD`. Use for entries where freshness matters. |

Example entry:

```json
{
  "path": "auth/tokens",
  "description": "Session tokens are namespaced by tenant_id, 30-day expiry, rotated on password or role change. Validation happens at the edge in middleware/auth.go before any handler runs. Read when touching multi-tenant request handling, session lifecycle, or token storage.",
  "type": "fact",
  "tags": ["auth", "security"],
  "related": ["auth/tenant-isolation"],
  "last_verified": "2026-06-05"
}
```

### Reading

The full index is **auto-loaded into every session**. This runtime `CLAUDE.md`
imports it with Claude Code's `@import` mechanism, so `INDEX.json`'s entire
contents are already in your context before you do anything — no manual read, no
truncation:

@context/INDEX.json

(The `@context/INDEX.json` line above resolves relative to this `CLAUDE.md`'s
directory — i.e. `<runtime>/context/INDEX.json` — and loads the whole file. The
first time Claude Code sees it in a new project it asks you to approve the
import once, because the path is outside the worktree you launched from. This
replaces the old `SessionStart` hook, which capped the index.)

Primary path:

1. **The `INDEX.json` above is already loaded — consult it first for every
   task**, trivial or not. Skimming the metadata index is free (it's in
   context); the cost of missing a relevant entry is high. In the unlikely event
   it isn't present (import declined, or you're outside a runtime), read the
   entire `<runtime>/context/INDEX.json` uncapped — never a truncated head.
2. Open files at `<runtime>/context/<path>.md` for entries whose metadata matches the current task.

When INDEX descriptions don't surface what you need — and often they won't — fall back to anything that works:

- **Grep `<runtime>/context/`** for keywords. Frequently the term you need lives in a body, not in any description.
- **`ls` the folder recursively** to spot entries on disk that aren't indexed (orphans), and read them directly when relevant.
- **Follow `related` chains** outward from a known-relevant entry to find the rest of a cluster.
- **Read everything** when in doubt — better than guessing.

INDEX is the *primary* discovery surface, not the only one. Use whatever gets you to the right entry fastest — direct grep, full-content scan, recursive read, following links, your judgment.

### Maintain INDEX.json as you go

When you add, rename, remove, or restructure an entry, update INDEX in the same change. Drift means orphan files (invisible to future sessions) or stale entries (false positives). After editing INDEX, sanity-check it parses as valid JSON.

### Organize as much as you can

- **Nest by subject** — `infra/cell/guide`, `auth/tokens`, `payments/stripe/webhook-quirks`. Match the domain's natural divisions.
- **One concept per file.** If you can't fit the gist + scope + when-relevant into a 1–3 sentence `description`, the file is doing too much — split it. Aim for ≤ ~200 lines per body file; line count is just a tripwire that flags "look closer." When in doubt, factor the shared concept out into its own entry and `related`-link from the children.
- **Cross-link via `related` in INDEX**, not in body content.

### When and what to write

Three triggers for new entries:

1. **When the user asks.** "Save this," "remember this," "add to context" — write the entry immediately and update INDEX.
2. **When you make a non-obvious discovery during the session.** A root cause you traced, a system invariant you confirmed, a decision reached together, a gotcha that tripped you up — propose inline: *"This seems worth saving — add it as `<path>` with this description? OK?"* Write only after the user confirms.
3. **Before ending a substantial session.** Review what was learned and propose 1–3 entries the user can approve. Catches durable findings you didn't surface mid-stream.

For ephemeral scratch (a debugging journey in progress, a hypothesis you're testing) — write without asking. It's notes; promote or delete later.

**What's worth writing:** rationale, history, gotchas, cross-system invariants, debugging journeys, RCAs, session summaries, project-local procedures, imported reference material — your call. When in doubt, save it; prune later.

## Session summaries — detailed record of each working session

Each work has a `sessions/` folder that accumulates one markdown file per working session. The goal: another agent (a fresh Claude session, or a different agent like Codex / Cursor) can read these files and start a new session with full context — including findings from external sources that may no longer be accessible.

### Single trigger — never auto-write

Write a session summary **only when the user explicitly asks at end of session**: *"add the session summary before I close"*, *"save this session"*, etc. Never auto-write. Never propose mid-session. Never proactively suggest at end of session unless asked. The user owns the trigger.

### Filename

`works/<feature>/sessions/YYYY-MM-DD-HH-MM-<slug>.md` — date, 24-hour time (dash-separated; colons aren't portable on Windows), then a short kebab-case slug describing the session's subject. Use the time you started the session (or now, if unsure).

### Content — distillation, not transcript

The summary is detailed but **not a transcript**. Capture the substance of what happened so a future agent can pick up the work without re-doing all the discovery:

- **Goal** — what we set out to do this session.
- **What we learned from external sources.** When you fetched URLs, looked at attached images, read attached files, or ran web searches: distill the relevant findings into the summary. The URL, file path, or image may not be accessible later — the *information* must live in the summary.
- **What worked** — code shipped, decisions reached, approaches that succeeded. Include commit SHAs and PR links when applicable.
- **Dead ends** — hypotheses tried and falsified, approaches abandoned, and *why* each was abandoned (saves the next session from re-running the same dead end).
- **Files touched** — paths modified, with a sentence on what changed and why.
- **State at session end** — in-flight changes, tests passing/failing, PRs open, commits ahead of main.
- **Next steps / open questions** — what should the next session pick up?
- **Cross-references** — context-registry entries (by `path`) created or updated this session; prior session files this builds on (by filename).

Length is not a virtue; completeness is. The bar: a fresh agent can read just this file and continue the work cold.

### Cross-link with the context registry

Sessions and the context registry complement each other. When this session created or updated an entry in `<runtime>/context/`, list it under "Cross-references" in the session file. Conversely, when promoting a finding into a durable registry entry, you may reference the session file in the entry's body for provenance.

## How to do things (always via mx)

You are launched from the work folder, so you can **omit `-n <feature>`** — mx infers the work from
your cwd (and the repo, when you're inside a worktree). The commands below show `-n <feature>` for
clarity; dropping it works while you're inside the work.

- **See the work:** `mx work info --porcelain` (or `mx work -n <feature> info --porcelain`)
- **Add a repo to the work (needs a worktree):** if a repo you need has no worktree yet, **stop and
  ask the user.** Only when they say so, run:
  ```
  mx work -n <feature> worktree add <repo> [<name>] [--branch <b>] [--base <ref>]
  ```
  This creates the worktree from the pristine clone at `works/<feature>/wt/<name>`, registers it in
  `work.json`, and adds it to the workspace — all at once. Never run `git worktree add` yourself.
  - `<name>` is the worktree's id (its `wt/<name>` dir + selector); it **defaults to the repo name**.
    Pass a distinct `<name>` to add a **second worktree of the same repo** to one work (e.g.
    `mx work -n <feature> worktree add app app-pr2 --branch fix`).
  - `--branch <b>` is the **new** branch to create (defaults to the work name; if it already exists, it's reused).
  - `--base <ref>` is where to **fork from** — any ref. A bare branch name (e.g. `main`,
    `migration-to-mt-service-from-cf`) resolves to that local branch or, failing that, `origin/<name>`.
    Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit. Omit
    `--base` to fork from the pristine clone's current HEAD.
  - After the worktree is created, the central `<runtime>/hooks/post-worktree-create` hook runs with the
    new worktree as the working directory (copy a `.env`, install deps, etc.) — branch on `$MX_REPO` /
    `$MX_BRANCH` / `$MX_WORKTREE_NAME` inside it. To skip hydration, make that hook a no-op.
  - A brand-new work can be created **with** its initial worktrees in one shot (still ask the user first):
    `mx work new <feature> <repo>[:<branch>[:<base>]]...` — e.g.
    `mx work new <feature> app muze-ai:<feature>:app_ib_dev`. Per repo, branch defaults to `--branch`
    then the work name, and base to `--base` then the pristine HEAD.
- **Switch a worktree to a different branch:** mx never runs `git checkout` for you — switch branches
  the normal way inside the worktree (`git checkout <other-branch>`), then tell mx so the manifest stays
  truthful:
  ```
  mx work -n <feature> worktree set-branch <worktree> [<branch>]
  ```
  This mutates **only** `work.json` — it re-reads the worktree's **live** branch and records it (so the
  manifest can't drift from git). The optional `<branch>` is a guard: if given, it must match the branch
  the worktree is actually on, else it errors (`BRANCH_MISMATCH`) — a safety net for "I forgot to check
  out first". Errors `DETACHED` on a detached HEAD (check out a branch first). Never hand-edit `work.json`
  to change a branch — use this.
- **Spin up a quick local app (no remote):** for a throwaway/experiment repo you don't want on GitHub,
  `mx repo new <name>` creates a fresh local repo (git init on `main` + README + initial commit). Add
  `--quick` (and `-o`) to also create a `dev-<name>` work + a worktree on `develop` and open it in one
  shot: `mx repo new <name> --quick -o`. Like adding any repo/worktree, **ask the user first.**
- **Allocate a port:** `mx work -n <feature> port set <repo> <service>` returns a free port (unique
  across all works). This only records the port in `work.json` — **you** must then wire that port
  into the repo's own env/config (`.env`, `PORT=`, etc.) and remap any outbound URL to a sibling
  service to its allocated port too. Release with `port unset`.
- **Enter a work (its tmux session):** every active work maps to **one tmux session** named `mx/<feature>`.
  `mx work -n <feature> attach` builds that session on first use — a `main` window (left pane: the work's
  Claude session, resumed by work name — the newest session named after the work, else a fresh one; right
  pane: `nvim wt`, the work's worktrees folder — overridable in the `work-session` hook) and a `run` window (a 2×2
  grid of shells for dev servers) — then attaches **this** terminal to it (or `switch-client`s when you're
  already inside tmux). `mx work -n <feature> open` (and `mx work new -o`) does the same but in a **new**
  terminal window. Building is lazy and self-healing: after a reboot or a manual `tmux kill-session`, the next
  `attach` just rebuilds it. Customize the layout via the `<runtime>/hooks/work-session` hook. Need extra
  terminals? Make new tmux windows/panes yourself — they belong to the session. Jump between works with
  `mx work switch` (an fzf picker over live `mx/*` sessions, or `mx work switch <feature>`). The
  `.code-workspace` is still written, so you can open the work in VS Code too if you prefer. (mx no longer
  drives editors/terminals via osascript.)
- **Disposable sessions:** mx sessions are rebuildable at any time (`mx work attach` recreates the layout), so
  they don't need to persist across reboots — after a reboot just recreate what you want with
  `mx work attach`. `mx work gc` prunes any stray orphaned `mx/<feature>` session (archived/destroyed work; only
  this runtime's, warns on live panes, confirm or `--yes`).
- **Check the toolchain:** `mx doctor` verifies the tmux workflow's dependencies (tmux, neovim, claude) plus
  the recommended editor toolbelt, and prints the exact install command for anything missing (`--install`
  runs it). Run it once on a new machine.
- **Check health:** `mx repo health` audits the pristine clones; `mx work health` audits the work folders
  (stray files in a work root, worktree presence vs `work.json`, cross-work port collisions, archive
  invariants); `mx health` shows both for the whole runtime (`--all` includes archived works). All are
  purely local. Each runs its central hook (`repo-health` / `work-health`) and captures the stdout as `extra`.
- **Live dashboard:** `mx mission-control` (alias `mx mc`) starts a local read-only web dashboard — a calm
  monochrome view of all repo/work health and a consolidated ports board (which work owns which port, with a
  `localhost` URL). Updates live over SSE. `--port <n>` sets the port (default 7777), `-o` opens the browser.
  Long-running (Ctrl-C to stop) — if you start it for the user, tell them the URL.
- **Tear down (user-initiated, after merge):** `mx work -n <feature> destroy` removes the worktrees,
  the work folder, and the work's tmux session but **keeps the branches**. It refuses if any worktree has
  uncommitted changes. (`mx work archive` likewise kills the session — it warns first if a pane holds a live
  process like a dev server or a running `claude`.)

## Hard rules

1. **Never edit, stage, commit, or run dev servers inside `repos/`.** Those clones are read-only base for worktrees.
2. **Never hand-edit `work.json` or the `.code-workspace`.** Change them only through `mx` commands.
3. **Never create or remove worktrees with raw `git`.** Use `mx work ... worktree add/rm`.
4. **Creating a worktree requires the user in the loop** — only when they explicitly tell you to in this session.
5. **Don't destroy anything unless asked.** Worktrees stay until the user confirms the feature is merged.
   Teardown keeps feature branches; never delete them.
6. **Never create ad-hoc files in the work-folder root.** Keepable artifacts go in `files/`, throwaway
   scratch in `tmp/`, scripts (and per-work binaries) in `scripts/`. The root is mx-native only (only exception: a tooling
   file a session genuinely needs there, e.g. an MCP connection file). See § The work folder holds
   mx-native files only.

## The one rule that matters most

`repos/` is read-only reference; real work lives in worktrees under `works/<feature>/wt/<repo>`; and
`mx` owns the manifest. If a repo you need has no worktree yet, ask before adding one — then add it
with `mx`.
