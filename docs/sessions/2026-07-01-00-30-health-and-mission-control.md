# mx work health, `mx health`, and `mx mission-control` (3.0.0 → 3.1.0)

Session of 2026-06-28 → 2026-07-01 (continued across compactions). Work: `dev-mx`
(self-hosted mx development; the worktree is `works/dev-mx/wt/mx`, the
`github.com/roulabs/mx` source repo). Two releases shipped and published.

## Goal

Continue evolving mx. Concretely, across the session:
1. Remove the capped per-work `SessionStart` context-index hook.
2. Add work-folder health checks: `mx work health`, `mx health`, a `work-health` hook.
3. Heavy UX iteration on the health output.
4. Ship a live web dashboard: `mx mission-control`.

Everything landed in two PRs against `develop → main`, both merged and published.

## Releases shipped (both merged + on npm)

- **3.0.0** — PR #12 (`develop → main`, merged `440eb82`). Title: "3.0.0: central
  hook hub, multiple worktrees per repo, health commands". (The central-hook-hub
  and multi-worktree work predated this session; this session added the health
  commands + SessionStart removal into the same open PR before merge.)
- **3.1.0** — PR #13 (merged `d0ca85a`, commit `4b4423e`). Title: "3.1.0: mx
  mission-control — live web dashboard".
- `npm view @roulabs/mx version` → **3.1.0**, `dist-tags.latest = 3.1.0`.

State at session end: working tree **clean**, `develop` == `main` == `4b4423e`'s
merge. Nothing pending. Build/typecheck/lint/85 tests all green.

## What shipped, and the key decisions

### 1. Removed the per-work SessionStart context-index hook (3.0.0)
v2 stamped `works/<feature>/.claude/settings.json` with a `SessionStart` hook
that printed `context/INDEX.json`, but Claude Code **caps hook output at ~2KB**,
so a real index was silently truncated. v3 drops it:
- `mx work new` / `mx sync` no longer stamp it; removed `workClaudeSettings`.
- The v2→v3 migration removes a **default-stamped** one (new
  `isDefaultClaudeSettings()` in `migrations.ts`); a **customized** `settings.json`
  is kept with a warning.
- The runtime `CLAUDE.md` now tells the session to read the whole `INDEX.json`
  itself, and recognizes the phrase **"load the mx ctx index as whole"** as a
  force-reload trigger.

### 2. `mx work health` / `mx health` + `work-health` hook (3.0.0)
New core module `packages/core/src/workhealth.ts`: `workHealth` /
`listWorkHealth` / `WorkHealth`. Purely-local checks (no network, no git):
- **stray root entries** — non-mx-native files in the work root (dotfiles
  tolerated for the tooling exception);
- **worktree presence** — recorded in `work.json` vs on disk;
- **cross-work port collisions** — only possible via a hand-edited `work.json`
  (since `mx port set` keeps ports unique);
- **archive invariants** — an archived work should have ports freed + worktrees
  removed.
Plus the captured `work-health` central hook stdout as `extra`. `work-health`
added to `HOOK_EVENTS`. New top-level `mx health [--all]` (`commands/health.ts`)
prints every repo block then every active work block (`--all` adds archived).

### 3. Health UX (iterated heavily — final state)
- **Metric-only rows**: health shows only rows that carry a ✓/⚠. Info-only
  fields (default branch, worktrees-in-works, work status, active-work port
  count) live in `mx info`, NOT health.
- **`last fetched`** is a metric for remote-backed repos: ✓ within 24h, ⚠ stale
  otherwise. Local repos (no remote) omit ahead/behind + last-fetched.
- **`extra` row** sits inline right after the metrics (no separate section, no
  blank line) and always shows with a marker. **Silent-when-healthy** hook
  convention: empty output OR a bare `ok`/`OK` → renders `extra OK ✓`; any other
  output → ⚠ with the message (and flags the block). Documented in the hook
  templates.
- **Aggregate ✓/⚠ next to each repo/work name** — green only when every checked
  row (incl. `extra`) is a tick, for fast scanning.
- **Inline hints, no "issues" block** — each failing check's detail rides as a
  dim hint on its own row (same style as `mx repo health`).
- **Worktree names dropped** from the work-health `worktrees` row (just a count +
  marker; names live in `mx work info`).
- `mx health` capitalizes section headers (`Repos` / `Works`) and indents each
  block 2 spaces under its header.
- Captured-hook section label is `repo-health hook` / `work-health hook`
  (matches the `<event> hook` phrasing used in `apps/cli/src/hooks.ts`).

### 4. `mx mission-control` (alias `mx mc`) — live web dashboard (3.1.0)
A local, **read-only** dashboard. The hard part (shipping it zero-dep) solved:
- **Server**: hand-written `node:http` in `apps/cli/src/commands/missionControl.ts`.
  Serves a single self-contained HTML at `/`, JSON snapshot at `/api/state`, and
  **SSE** at `/api/stream`. Recomputes on a ~2.5s tick + `fs.watch` on `works/`,
  `repos/`, `mx.json` for instant pushes. `--port` (default 7777, walks up if
  busy); `-o` opens the browser. Favicon → 204. State built in-process from
  `listRepoHealth` + `listWorkHealth`. Never mutates.
- **UI**: new private workspace `apps/mission-control/` (React 19 + Vite 6 +
  Tailwind v4). Built to ONE inlined `index.html` via `vite-plugin-singlefile`,
  copied into `npm/mission-control/` by tsup at build time. React/Vite/Tailwind
  are **dev-only** → published `@roulabs/mx` keeps **zero runtime deps**.
- **Theme auto-syncs with the OS** via `prefers-color-scheme` (Tailwind v4's
  default `dark:` variant). Light + dark both styled.
- **Semantic colors** on the monochrome canvas: green ✓ healthy, red ⚠ not.
- **Works grid**: active works by default, with a **"show archived"** checkbox.
- **Ports board**: independent of the checkbox (always every work), a **nested
  tree** `work → worktree → (service · port · url)` with cross-work collisions in
  red and archived works dimmed.

### 5. Fixes
- **No-remote repo-health false positive** (CLI + dashboard): a repo with no
  `origin/HEAD` has no default branch to compare against, so its current branch
  is no longer flagged — only a detached HEAD is. `branchOk = currentBranch !==
  null && (defaultBranch === null || isOnDefault)`. `@mx/core` already treated it
  as healthy; the bug was render-only.
- Cleaned two **stale `mx work worktree hydrate` / `--no-hydrate`** references in
  the stamped `templates/` (the `post-worktree-create` hook header and the
  runtime `CLAUDE.md`). The remaining mentions in `docs/` are either historical
  (changelog) or accurate "no longer exists" statements.

## Dead ends / reverted

- **Ports grid layout** — at the very end, reworked the ports board into a
  responsive grid of per-work cards (URL dropped, port = clickable link). The
  user asked to **undo it**; reverted (`git checkout HEAD -- App.tsx
  commands.md`) since it was uncommitted. The committed/published 3.1.0 ports
  board is the **nested-tree-with-URL** version. Do not re-introduce the grid
  unless asked.
- **`mx work new --quick <repo>`** — offered, but the user clarified they only
  meant the existing `mx repo new --quick`. Not built.

## Files touched (highlights)

New: `packages/core/src/workhealth.ts`, `apps/cli/src/commands/health.ts`,
`apps/cli/src/commands/missionControl.ts`, `apps/mission-control/**` (package.json,
vite.config.ts, tsconfig.json, index.html, src/{main.tsx,App.tsx,api.ts,lib.ts,index.css}),
`templates/hooks/work-health`.

Modified: `packages/core/src/{runtime.ts (HOOK_EVENTS += work-health, dropped
SessionStart stamping), migrations.ts (isDefaultClaudeSettings), index.ts}`,
`apps/cli/src/{args.ts (--port), main.ts, paths.ts (missionControlHtml),
help.ts, tsup.config.ts (copy mission-control dist), commands/{repo.ts,work.ts}}`,
`eslint.config.js` (ignore apps/mission-control), `.gitignore`
(`npm/mission-control/`, `.playwright-mcp/`), root `package.json` (build order),
`npm/package.json` (3.1.0), and docs: `CLAUDE.md`, `templates/CLAUDE.md`,
`README.md`, `npm/README.md`, `docs/{commands,architecture,runtime-model,history,overview}.md`.

## How to verify / pick up

- **Rich sandbox runtime** for trying the dashboard + health:
  `bash <scratchpad>/seed-rich.sh` builds `/tmp/mx-rich` (3 repos incl. one
  remote-backed, 4 works incl. 2 archived, multi-worktrees, a stray file, a port
  collision, archive-invariant violations, both health hooks). Then:
  `MX_RUNTIME=/tmp/mx-rich node <repo>/npm/bin/mx.js mc -o`. The seed script was
  in the session scratchpad (regenerate from this summary if gone).
- **Local dev build NEVER runs against `~/mx`** (it's v3, would version-gate, and
  the runtime rule forbids it). Use a `/tmp` sandbox via `MX_RUNTIME`. The
  published global `mx` on `$PATH` is the safe one against `~/mx`.
- Build: `pnpm build` (builds mission-control THEN cli so the copy finds `dist/`).
- Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Browser-verified the UI with Playwright MCP (`page.emulateMedia` to test
  light/dark; screenshots).

## Next steps / open questions

- Nothing pending. Possible future work the user floated: dashboard **actions**
  (currently read-only — could add archive/port-set from the UI later);
  a `mx work new --quick <repo>` shortcut (declined this session).
- For the user to run the new release on their real runtime:
  `npm i -g @roulabs/mx@latest` then `mx migrate` (3.0.0 had a v2→v3 migration;
  3.1.0 is same-runtime). `mx mc -o` for the dashboard.

## Conventions reinforced (apply going forward)

- **No AI attribution** in commits/PRs (no `Co-Authored-By`, no "Generated with").
- **No em dashes** in commit/PR/ticket text; human, plain phrasing.
- mx releases via `develop → main` PR; CI publishes on merge; bump
  `npm/package.json`.
- Zero runtime deps in the published package (node builtins + bundled `@mx/core`
  only; the dashboard ships as a prebuilt static file).
