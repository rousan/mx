# The runtime model

What an mx runtime looks like on disk, the contracts mx owns, and the data shapes you should expect.

## Layout

```
<runtime>/  (e.g. ~/mx, or wherever $MX_RUNTIME points)
├── .mx-root                     # empty marker file — "this is the mx root"
├── CLAUDE.md                    # stamped from templates/CLAUDE.md; rules for feature sessions
├── context/                     # shared memory across all features (see § Context registry below)
│   ├── INDEX.json               # single source of truth for entry metadata
│   └── <path>.md                # body-only entries (nested folders allowed)
├── repos/                       # pristine clones — READ-ONLY reference for worktrees
│   ├── repo-a/
│   └── repo-b/
└── works/                       # one folder per parallel feature
    └── feature-a/
        ├── work.json                # per-work manifest (owned by mx; never hand-edit)
        ├── feature-a.code-workspace # VS Code workspace (owned by mx)
        ├── sessions/                # one .md per session (see § Session summaries below)
        │   └── 2026-06-12-14-30-flaky-checkout-rca.md
        ├── repo-a/                  # git worktree on the feature branch
        └── repo-b/                  # git worktree on the feature branch
```

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
| **mx** (programmatic) | `.mx-root` marker, `repos/<repo>/` (created by `repo add` clone; touched only by `repo fetch`/`repo rm`), `works/<feature>/` (created by `work new`), `work.json`, `.code-workspace`, `sessions/` (directory only — files are agent-written), `context/INDEX.json` (only the starter empty array is stamped; subsequent edits are by the agent) |
| **mx-stamped templates** (rewritten on `mx update`) | `<runtime>/CLAUDE.md` (always rewritten), `<runtime>/context/INDEX.json` (only if missing — never overwrites user content) |
| **The user / agent** (mx never touches) | All worktree code, `context/<path>.md` body files, `INDEX.json` content after init, `sessions/*.md` files |

`mx update` is non-destructive: it re-stamps the mx-owned generated content (runtime `CLAUDE.md`), backfills mx-owned structural directories that are missing (e.g. `<work>/sessions/` for works that pre-date that scaffolding), and removes a stale `<runtime>/README.md` if one lingers. It never modifies anything in the "user / agent owns" column.

## Discovery: `--runtime` / `$MX_RUNTIME` / `~/mx`

The CLI resolves the runtime in this order, picking the first that's set:

1. `--runtime <path>` flag
2. `$MX_RUNTIME` environment variable
3. Default `~/mx`

No pointer file is written anywhere in the source tree — runtimes are entirely env-addressed. This lets you have multiple independent runtimes on one machine (one productive, several test sandboxes) by just changing `$MX_RUNTIME`.

## `inferContext` — cwd → work / repo

When you're inside `<runtime>/works/<work>/...`, `mx work info` (etc.) infer the work from the cwd. Same for `<runtime>/repos/<repo>/...` inferring the repo. So you can drop `-n <name>` in most contexts.

Implementation: `inferContext(root)` in `runtime.ts` does a `realpath` comparison so symlinked runtime roots (e.g. macOS `/tmp` → `/private/tmp`) still match.
