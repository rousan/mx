# Development

How to set up, iterate on, and test mx.

## Prerequisites

- **Node ≥ 22** and **pnpm** (`corepack enable` provides the pinned `packageManager` version)
- **git** on `$PATH`
- npm publish targets public `registry.npmjs.org`; a corp `.npmrc` registry is fine for installing deps (the first `pnpm install` on a corp mirror is slow, not stuck)

## First-time setup

```bash
git clone git@github.com:rousan/mx.git && cd mx
pnpm install
pnpm build                       # populates npm/ (bin/mx.js + templates/ + LICENSE)
export MX_RUNTIME="$PWD/.mx"     # gitignored dev runtime in this repo
pnpm mx init                     # runs node npm/bin/mx.js init against the dev runtime
pnpm mx repo add git@github.com:you/app.git
pnpm mx work new my-feature
pnpm mx info
```

The `.mx/` folder is gitignored — your dev runtime is local-only and disposable.

## Scripts

```bash
pnpm typecheck     # tsc --noEmit across packages/{core,cli}
pnpm lint          # eslint (typescript-eslint + jsdoc + prettier)
pnpm test          # vitest (unit tests for @mx/core; CLI logic exercised through core)
pnpm build         # tsup bundle -> npm/bin/mx.js + copy templates + LICENSE
pnpm dev           # tsup --watch
pnpm mx -- <args>  # run the local build (= node npm/bin/mx.js)
pnpm release       # local release driver (scripts/release.sh)
```

Run `pnpm typecheck && pnpm lint && pnpm test` before committing. CI (`.github/workflows/ci.yml`) does the same on every PR.

## Where to add what

- **Domain logic** → `packages/core/src/`. Add a Vitest test in `packages/core/test/`. Functions return data, throw `MxError` — no `console.log`, no `process.exit`, no on-disk-layout assumptions (paths are parameters).
- **CLI behaviour** → `apps/cli/src/commands/`. Use `emit(human, data)` from `output.ts` to handle the human / porcelain split. Use `dim`/`bold`/`check()`/`warn()` for output style. Errors in core flow up through `fail()` automatically.
- **Args parsing** → `apps/cli/src/args.ts`. Add booleans to `Flags`, default in the parser, recognize the token. Value flags use the `VALUE_FLAGS` map for both `--flag value` and `--flag=value` forms.
- **Templates** (`CLAUDE.md`, `work.json`, `.code-workspace`, `context/INDEX.json`, `hooks/<event>` scripts, `bin/<tool>`) → `/templates/`. tsup copies them into `npm/templates/` on every build. Runtimes pick up changes only after `mx sync`.

## Testing patterns

### Vitest

Tests live in `packages/core/test/core.test.ts`. The patterns:

- **`tmp()` helper** returns a fresh `/tmp/mx-test-<random>` directory per call.
- **Git fixtures** use `execFileSync('git', […], { cwd, stdio: 'ignore' })` to set up source repos and clones inline. No network — all sources are locally `git init`'d.
- **Template fixture** uses the repo's real `/templates/` directory via `path.resolve(import.meta.dirname, '..', '..', '..', 'templates')`. `MX_TEMPLATES_DIR` is available as an override if a test wants a fixture templates dir.
- **Multiple worktrees on the same branch are not possible**: git refuses to check out the same branch in two worktrees of the same repo. In tests that need multiple worktrees per repo, create distinct branches for each.

### Manual end-to-end

The unbreakable rule: **never test the locally-built CLI against a real / productive runtime.** Point `$MX_RUNTIME` at `$PWD/.mx` or `/tmp/...`:

```bash
export MX_RUNTIME=/tmp/mx-sbx
node npm/bin/mx.js init              # or: pnpm mx init
```

Use locally-created throwaway git repos as clone sources (`git init` in `/tmp/...`) so tests need no network. Since the runtime location is env-only (no pointer file), sandbox runs can't corrupt a real runtime — but still target `/tmp` or `.mx/`.

This rule is **load-bearing under self-hosting** — see [self-hosting](self-hosting.md) for why.

## Running the CLI in dev (`pnpm mx` vs global `mx`)

There is **no global PATH coupling to this repo**. The global `mx` exists only when you install a build:

```bash
npm i -g @rousan/mx
```

Within this repo, `pnpm mx` runs the local build via the workspace script (`node npm/bin/mx.js`). After changing CLI / core code: `pnpm build` (or keep `pnpm dev` watching) before the change takes effect.

Templates live at `/templates`. tsup copies them into `npm/templates/` at build, so editing them requires a rebuild to take effect.

## Gotchas already handled in code (keep them)

- `--base` is resolved to a commit SHA with an `origin/<ref>` fallback to avoid git's DWIM overriding `-b` in `worktree add`. See `resolveBase()` in `git.ts`.
- `inferContext` realpaths both sides so symlinked roots (e.g. macOS `/tmp` → `/private/tmp`) match.
- `confirmYesNo()` delegates to `spawnSync('/bin/sh', ['-c', "read REPLY"])` because Node's `fs.readSync(0, …)` returns EAGAIN immediately on macOS in non-blocking stdin mode. The shell builtin `read` blocks on TTY correctly across macOS and Linux.
- The first `pnpm install` on a corp npm mirror can be slow — not stuck.
- `mx init` is idempotent; re-stamping never clobbers `repos/`, `works/`, or existing `context/INDEX.json`.

## Documentation site (mx.rousanali.com)

There are **two** doc surfaces in this repo, on purpose:

- **`apps/landing/`** — the **public, beginner-first site** published at mx.rousanali.com. A standalone React/Vite/Tailwind app that teaches mx from zero (the problem it solves, the four-word mental model with a diagram, a four-command quickstart, a curated command reference, and an FAQ). This is what a newcomer sees. It intentionally does **not** import from `docs/` — it is hand-written for teaching, so the two can evolve independently without drift risk.
- **`docs/*.md`** — the **deep reference** (runtime model, full command flags, architecture, release runbook, history). Optional VitePress site for reading these locally; also the source the landing page links out to for exhaustive detail.

```bash
pnpm landing:dev      # landing app dev server with hot reload
pnpm landing:build    # production build -> apps/landing/dist
pnpm landing:preview  # preview the production build

pnpm docs:dev         # (optional) VitePress reference site from docs/*.md
pnpm docs:build       # -> docs/.vitepress/dist
```

The landing app lives in `apps/landing/src/`: content (features, concepts, quickstart steps, commands, FAQ) is data in `content.ts`; each page section is a component under `sections/`; `theme.ts` drives the light/dark toggle. To change copy, edit `content.ts`; to change layout, edit the relevant section.

### Hosting: Cloudflare Worker (wrangler, GitHub Actions)

The public site is served at **mx.rousanali.com** by a **Cloudflare Worker** — an assets-only Worker that serves the built `dist/` from the edge (not Cloudflare Pages). Config is `apps/landing/wrangler.jsonc` (worker name **`mx-landing`**, `assets.directory: ./dist`, SPA fallback). Deployed by the **`.github/workflows/deploy-landing.yml`** GitHub Action:

- **production** deploy (`wrangler deploy`) on every push to `main`;
- a **preview version** (`wrangler versions upload`, its own version-preview URL) on every pull request — this never touches production;
- both gated on a `paths` filter, so only changes under `apps/landing/**` (or the lockfile / root `package.json` / the workflow itself) trigger a deploy.

The workflow builds with `pnpm landing:build`, then runs wrangler in `apps/landing`. Locally you can `pnpm --filter @mx/landing exec wrangler deploy` (or `pnpm --filter @mx/landing run cf:dev` to serve the assets Worker on localhost).

Required repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with the **Workers Scripts: Edit** permission (Workers, not Pages). |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (dashboard sidebar / account URL). |

One-time Cloudflare setup:

1. The first push to `main` creates the `mx-landing` Worker. PR previews rely on Workers **preview URLs** — ensure the Worker has a `workers.dev` subdomain enabled (default) so `versions upload` yields a preview URL.
2. Attach the custom domain `mx.rousanali.com` to the Worker (Workers & Pages → mx-landing → Settings → Domains & Routes → Add → Custom domain). A DNS record is created automatically since the zone is on Cloudflare.

The workflow reports the deployment URL in the run summary. It intentionally does **not** post a PR comment; grab the preview URL from the Actions run.
