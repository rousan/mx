# Development

How to set up, iterate on, and test mx.

## Prerequisites

- **Node ≥ 22** and **pnpm** (`corepack enable` provides the pinned `packageManager` version)
- **git** on `$PATH`
- npm publish targets public `registry.npmjs.org`; a corp `.npmrc` registry is fine for installing deps (the first `pnpm install` on a corp mirror is slow, not stuck)

## First-time setup

```bash
git clone git@github.com:roulabs/mx.git && cd mx
pnpm install
pnpm build                       # populates npm/ (bin/mx.js + templates/ + LICENSE)
export MX_RUNTIME="$PWD/.mx"     # gitignored dev runtime in this repo
pnpm mx init                     # runs node npm/bin/mx.js init against the dev runtime
pnpm mx repo add git@github.com:you/app.git
pnpm mx work new my-feature
pnpm mx status
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
- **Templates** (`CLAUDE.md`, `work.json`, `.code-workspace`, `context/INDEX.json`, `repo/setup.sh`, `repo/health.sh`) → `/templates/`. tsup copies them into `npm/templates/` on every build. Runtimes pick up changes only after `mx sync`.

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
npm i -g @roulabs/mx
```

Within this repo, `pnpm mx` runs the local build via the workspace script (`node npm/bin/mx.js`). After changing CLI / core code: `pnpm build` (or keep `pnpm dev` watching) before the change takes effect.

Templates live at `/templates`. tsup copies them into `npm/templates/` at build, so editing them requires a rebuild to take effect.

## Gotchas already handled in code (keep them)

- `--base` is resolved to a commit SHA with an `origin/<ref>` fallback to avoid git's DWIM overriding `-b` in `worktree add`. See `resolveBase()` in `git.ts`.
- `inferContext` realpaths both sides so symlinked roots (e.g. macOS `/tmp` → `/private/tmp`) match.
- `confirmYesNo()` delegates to `spawnSync('/bin/sh', ['-c', "read REPLY"])` because Node's `fs.readSync(0, …)` returns EAGAIN immediately on macOS in non-blocking stdin mode. The shell builtin `read` blocks on TTY correctly across macOS and Linux.
- The first `pnpm install` on a corp npm mirror can be slow — not stuck.
- `mx init` is idempotent; re-stamping never clobbers `repos/`, `works/`, or existing `context/INDEX.json`.
