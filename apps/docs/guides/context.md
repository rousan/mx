# Context registry

The **context registry** is a runtime-wide shared memory: findings, decisions, runbooks, conventions, and notes that every feature can read. A hard-won discovery in one feature isn't re-learned in the next — and every coding agent, in every work, reads from the same institutional knowledge.

It lives at `<runtime>/context/`.

## Two-file design

- **`INDEX.json`** — the single source of truth for entry metadata (a JSON array).
- **Body files** at `context/<path>.md` — the prose for each entry, nested in folders as you like.

To know what an entry is about without opening it, you read its metadata in `INDEX.json`.

## An index entry

Each entry in `INDEX.json` is an object with this shape:

```json
{
  "path": "auth/tokens",
  "description": "Session tokens are namespaced by tenant_id, 30-day expiry, rotated on password or role change. Read when touching multi-tenant request handling or token storage.",
  "type": "fact",
  "tags": ["auth", "security"],
  "related": ["auth/tenant-isolation"],
  "last_verified": "2026-06-05"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `path` | yes | Unique id, kebab-case segments (`auth/tokens`). The body lives at `context/auth/tokens.md`. |
| `description` | yes | 1–3 sentences: the gist, where it applies, and when it's relevant — enough to decide whether to open the body. |
| `type` | no | Free-form label — e.g. `fact`, `decision`, `runbook`, `note`, `skill`. |
| `tags` | no | Free-form tag strings. |
| `related` | no | Other entries' `path` values. |
| `last_verified` | no | ISO date, for entries where freshness matters. |

## Add an entry

1. Write the prose to `context/<path>.md` (body only — no frontmatter).
2. Add a matching object to `INDEX.json`.
3. Sanity-check that `INDEX.json` still parses.

Keep the index and the body files in sync — an orphaned body file is invisible to future readers, and a stale entry is a false positive.

## Organize it

- **Nest by subject** — `infra/cluster/setup`, `auth/tokens`, `payments/stripe/webhook-quirks`.
- **One concept per file.** If you can't fit the gist into a 1–3 sentence description, split it.
- **Cross-link** related entries via `related` in the index.

## Keep the index lean

The runtime `CLAUDE.md` `@import`s `INDEX.json` so every session auto-loads it — and Claude Code caps an imported file at **~150k characters**, past which it warns and can drop the tail. Keep `INDEX.json` to lean metadata (a `path` plus a 1–3 sentence `description`); push detail into the body `.md` files, not the index. Run [`mx doctor`](/reference/cli) to see the index's size — it flags when you're approaching or over the limit, so you can trim before entries are silently lost.

## Why it matters for agents

When you run a fleet of coding agents — one per feature — each of them can read the same `context/` registry. That's how a convention decided in one feature, or a root cause traced in another, is available to every agent working in the runtime, instead of being trapped in a single session's history.

## Related

- **[Coding agents](/guides/coding-agents)** — how agents use shared context.
- **[Core concepts](/concepts)** — where `context/` sits in the runtime.
