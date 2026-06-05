<!-- Installed by the mx CLI. Don't hand-edit this file in the runtime —
     edit templates/CLAUDE.md in the mx source repo and run `mx update`. -->

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

## What this runtime is for

`mx/` is where **feature work** happens. Sessions launched here implement a feature inside a
`works/<feature>/` folder. mx *itself* — this template, the `mx` CLI — is maintained in a separate
**mx source checkout** (the `github.com/roulabs/mx` repo), outside this tree. If you were opened
here to change how mx works, you're in the wrong place: switch to that repo. Don't edit `repos/`,
`works/`, or the runtime files from here.

## Layout

```
mx/
├── CLAUDE.md               # this file (installed by the mx CLI)
├── .mx-root                # empty marker: "this is the mx root"
├── context/                # shared memory across all features (see § Context registry)
│   ├── INDEX.json          # single source of truth — metadata for every entry
│   └── <path>.md           # body-only entries; nested folders allowed
├── repos/                  # PRISTINE reference clones, each on its default branch
│   ├── repo-a/
│   └── repo-b/
└── works/                  # one folder per feature/work
    └── feature-a/
        ├── work.json       # manifest — owned by `mx`, do not hand-edit
        ├── feature-a.code-workspace
        ├── repo-a/         # worktree of repo-a on this feature's branch
        └── repo-b/         # worktree of repo-b on this feature's branch
```

- `repos/<repo>` are **source-of-truth clones** — read-only reference. Worktrees fork from them
  and share their `.git` object store. Never edit, commit, or run dev servers in `repos/`.
- `works/<feature>/<repo>` are **worktrees**, each on its own feature branch. All work happens here.

## work.json (per-work manifest, owned by mx)

```json
{
  "name": "feature-a",
  "description": "Add a chatbox to the answer panel",
  "worktrees": [
    { "repo": "repo-a", "branch": "feature-a", "ports": { "web": 3000, "api": 3001 } },
    { "repo": "repo-b", "branch": "feature-a", "ports": { "worker": 3002 } }
  ]
}
```

- One worktree per repo. `ports` is a `service -> port` map local to that worktree.
- The work's `name` is immutable. There is no port-block concept — each port is allocated
  individually and is unique across **all** works.

## Orient yourself at the start of every session

1. You are launched from a **work folder** (`works/<feature>/`), not a single repo. There is no "main repo."
2. Read the work's state with `mx work -n <feature> info --porcelain` to learn its repos, branches, and ports.
3. When you edit a repo's worktree, follow that repo's own `CLAUDE.md`, linters, and conventions —
   its instructions live inside the worktree and apply.
4. The work root is **not** a git repo. Run build/test/git commands from inside the relevant worktree.
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

Primary path:

1. Read `<runtime>/context/INDEX.json` — every entry's metadata in one Read.
2. Open files at `<runtime>/context/<path>.md` for entries whose metadata matches the current task.

When INDEX descriptions don't surface what you need — and often they won't — fall back to anything that works:

- **Grep `<runtime>/context/`** for keywords. Frequently the term you need lives in a body, not in any description.
- **`ls` the folder recursively** to spot entries on disk that aren't indexed (orphans), and read them directly when relevant.
- **Follow `related` chains** outward from a known-relevant entry to find the rest of a cluster.
- **Read everything** if the registry is small (< ~30 entries) and you're starting unfamiliar work — cheaper than guessing.

INDEX is the *primary* discovery surface, not the only one. Use whatever gets you to the right entry fastest — direct grep, full-content scan, recursive read, following links, your judgment.

A 30-second skim of INDEX is free; do it before any non-trivial task. Skip only for typo-fix-level work.

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

## How to do things (always via mx)

You are launched from the work folder, so you can **omit `-n <feature>`** — mx infers the work from
your cwd (and the repo, when you're inside a worktree). The commands below show `-n <feature>` for
clarity; dropping it works while you're inside the work.

- **See the work:** `mx work info --porcelain` (or `mx work -n <feature> info --porcelain`)
- **Add a repo to the work (needs a worktree):** if a repo you need has no worktree yet, **stop and
  ask the user.** Only when they say so, run:
  ```
  mx work -n <feature> worktree add <repo> [--branch <b>] [--base <ref>]
  ```
  This creates the worktree from the pristine clone, registers it in `work.json`, and adds it to the
  workspace — all at once. Never run `git worktree add` yourself.
  - `--branch <b>` is the **new** branch to create (defaults to the work name; if it already exists, it's reused).
  - `--base <ref>` is where to **fork from** — any ref. A bare branch name (e.g. `main`,
    `migration-to-mt-service-from-cf`) resolves to that local branch or, failing that, `origin/<name>`.
    Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit. Omit
    `--base` to fork from the pristine clone's current HEAD.
- **Allocate a port:** `mx work -n <feature> port set <repo> <service>` returns a free port (unique
  across all works). This only records the port in `work.json` — **you** must then wire that port
  into the repo's own env/config (`.env`, `PORT=`, etc.) and remap any outbound URL to a sibling
  service to its allocated port too. Release with `port unset`.
- **Tear down (user-initiated, after merge):** `mx work -n <feature> destroy` removes the worktrees
  and the work folder but **keeps the branches**. It refuses if any worktree has uncommitted changes.

## Hard rules

1. **Never edit, stage, commit, or run dev servers inside `repos/`.** Those clones are read-only base for worktrees.
2. **Never hand-edit `work.json` or the `.code-workspace`.** Change them only through `mx` commands.
3. **Never create or remove worktrees with raw `git`.** Use `mx work ... worktree add/rm`.
4. **Creating a worktree requires the user in the loop** — only when they explicitly tell you to in this session.
5. **Don't destroy anything unless asked.** Worktrees stay until the user confirms the feature is merged.
   Teardown keeps feature branches; never delete them.

## The one rule that matters most

`repos/` is read-only reference; real work lives in worktrees under `works/<feature>/`; and `mx`
owns the manifest. If a repo you need has no worktree yet, ask before adding one — then add it with `mx`.
