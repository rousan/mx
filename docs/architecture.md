# Architecture

mx is a TypeScript pnpm monorepo with **source code and the publishable npm package in separate folders**.

## The three pieces

```
github.com/roulabs/mx
├── packages/core/   →  @mx/core   (source; pure domain logic)
├── apps/cli/        →  @mx/cli    (source; CLI surface; PRIVATE — never published)
└── npm/             →  mx-multiplexer / @roulabs/mx   (publishable; `pnpm build` populates it)
```

### `@mx/core` (`packages/core/`)

Pure, typed, unit-tested domain logic. Functions take inputs, return plain data, and `throw MxError`; they never `console.log`, `process.exit`, or assume a process-level convention. Paths like `templatesDir` are passed in as parameters — core has no idea where templates live on disk.

On the runtime side it produces the v3 **container layout**: a `mx.json` file at the runtime root, a central `hooks/` hub (one executable per lifecycle event), a runtime-wide `bin/` of utility executables (mx-shipped + user), each repo as a container `repos/<repo>/` holding the clone at `git/` plus a `repo.json`, and each work carrying its worktrees under `wt/<repo>`, the per-work scratch dirs (`scripts/`, `files/`, `tmp/`), a work `CLAUDE.md`, and a `.claude/settings.json` context-index hook. See [runtime-model](runtime-model.md).

Key files in `packages/core/src/`:

- `errors.ts` — the `MxError` class with a string `code` (`'NO_REPO'`, `'DIRTY'`, `'NEED_CONFIRMATION'`, …)
- `types.ts` — `Work`, `Worktree`, `RepoSummary`, `RuntimeOpts`, `InferredContext`
- `runtime.ts` — runtime discovery (`discoverRuntime`, `requireRuntime`, `defaultRuntime`), the `initRuntime` / `syncRuntime` lifecycle, `ensureWorkScaffolding` (creates `wt/`/`scripts/`/`files/`/`tmp/`/`sessions/` and stamps the work `CLAUDE.md` + `.claude/settings.json`, all stamp-if-missing), the central-hook machinery (`HOOK_EVENTS`, `runtimeHooksDir`, `hookScript`), the runtime-bin helpers (`runtimeBinDir`, `listRuntimeBins`), the repo-config helpers (`repoConfigFile`, `readRepoConfig`, `writeRepoConfig`), work-manifest read/write, `inferContext` (a repo is inferred from the `wt/<repo>` segment), and the path helpers (`reposDir`, `worksDir`, `runtimeHooksDir`, `runtimeBinDir`, `repoGitDir`, `repoConfigFile`, `workDir`, `worktreesDir` → `wt/`, `worktreePath` → `wt/<repo>`, `workspaceFile`). The repo container's clone lives at `repos/<repo>/git/`; worktrees live at `works/<work>/wt/<repo>`.
- `migrations.ts` — runtime layout versioning: read/write `mx.json`, the `RUNTIME_VERSION` this CLI supports, the version gate, and the registered migration steps. **v1 → v2** runs `migrateRepoLayout` (clones into `git/`) + `migrateWorkLayout` (worktrees into `wt/`). **v2 → v3** stamps the central `hooks/` hub (`stampRuntimeHooks`), writes each repo's `repo.json`, and retires the old per-repo/per-work scripts — `isDefaultScript()` decides delete-vs-keep, keeping customized ones and emitting a warning. Each step returns `{ changed, warnings }`; `migrateRuntime(root, templatesDir, { dryRun })` aggregates them, validates the full chain before mutating, raises `RUNTIME_VERSION_MISMATCH` / `CLI_TOO_OLD` / `NO_MIGRATION` / `BAD_VERSION`, and threads `dryRun` so `mx migrate --dry-run` previews the plan + warnings without changing anything.
- `repos.ts` — `repoAdd` (clone from a remote), `repoNew` (create a fresh local repo: `git init` on main + README + initial commit), `repoFetch`, `repoInfo`, `repoRemove`, `listReposInfo`, `repoHealth` / `listRepoHealth` (purely local health snapshot plus the captured `repo-health` hook output as `extra`); `repoAdd`/`repoNew` write `repo.json` (no per-repo scripts in v3)
- `works.ts` — `workNew` (scaffolds the work via `ensureWorkScaffolding`), `worktreeAdd` (creates the worktree under `wt/<repo>` and registers the `wt/<repo>` folder path in the `.code-workspace`) / `worktreeList` / `worktreeRemove`, port helpers (`portSet`, `portUnset`, `portList`, `nextFreePort`, `allocatedPorts`), `archiveWork` / `unarchiveWork`, `workDestroy`, `listWorksInfo`, `WorkSummary = Work & { sessions: number }`. Pure core — it never runs hooks; the CLI fires lifecycle hooks around these calls.
- `status.ts` — `statusRuntime` → `StatusResult` (`{runtime, context, repos, works, archivedWorksCount}`)
- `templates.ts` — `stampClaudeMd`, `stampContextIndex`, `stampRuntimeHooks` (copies `templates/hooks/*` into `<runtime>/hooks/`, executable, **stamp-if-missing** — user hook logic is never clobbered), `stampRuntimeBins` (copies `templates/bin/*` into `<runtime>/bin/`, executable; shipped bins are **always re-stamped** like `CLAUDE.md` while user-added bins are left untouched), `removeStaleRuntimeReadme` (the per-work `CLAUDE.md` is stamped inline by `ensureWorkScaffolding` in `runtime.ts`, not from a template file)
- `git.ts` — thin wrappers over `git` (currentBranch, remoteUrl, branchExists, isDirty, resolveBase, worktreeRepair, …)
- `fsutil.ts`, `json.ts` — small filesystem and JSON helpers
- `index.ts` — public surface

### `@mx/cli` (`apps/cli/`)

Thin CLI over `@mx/core`. Handles arg parsing, cwd→`-n` inference, output formatting (`--porcelain` vs human), exit codes. **Private**, never published — exists only as a workspace member so pnpm can wire `@mx/core` in.

Key files in `apps/cli/src/`:

- `bin/mx.ts` — entrypoint; just calls `main()`
- `main.ts` — version read from `<pkg>/package.json` at startup; alias handling (`mx i` → `info`); top-level dispatch; applies the runtime version gate before runtime-touching commands (allowing only `migrate`, `update`, `help`, `version` on a mismatch)
- `args.ts` — argv parser with `Flags`: `porcelain`, `help`, `version`, `force`, `yes`, `all`, `archived`, `open`, `noHydrate`, `dryRun`, `quick`, `runtime`, `name`, `description`, `branch`, `base`
- `output.ts` — `emit(human, data)`, `fail(err)`, the monochrome style helpers (`dim`, `bold`), the plain glyphs (`check()` = ✓, `warn()` = ⚠), and `confirmYesNo()` (sync TTY prompt via `spawnSync('/bin/sh', ['-c', 'read REPLY'])`)
- `paths.ts` — `templatesDir()` resolves `<pkg>/bin/mx.js` → `<pkg>/templates`
- `selfupdate.ts` — `mx update`: self-updates the CLI within its major via `npm i -g @roulabs/mx@^<major>`, detects a newer major and prints the deliberate upgrade suggestion, falls back to printing the manual command if npm is missing or the install fails
- `hooks.ts` — the single hook runner: `runHook(root, event, ctx, quiet)` executes `<runtime>/hooks/<event>` (any shebang) with `ctx.cwd` + merged `MX_*` env if present, returning `{ran, ok, missing}`; `runPreHook` throws `HOOK_FAILED` on non-zero (abort), `runPostHook` warns. `commands/{work,repo}.ts` call these around worktree create/remove, work archive/unarchive, and repo fetch. (Replaced v2's `hydrate.ts` + `workhooks.ts`.)
- `open.ts` — the macOS `mx work new -o` / `mx work open` helper (fullscreen Terminal in the work folder)
- `help.ts` — `mx help` text
- `commands/global.ts` — `init`, `status`, `sync`, `update` (self-update, then `autoSyncAfterUpdate` shells the freshly-installed global `mx sync`), `migrate`, plus `renderStatus()`
- `commands/repo.ts` — `add`, `new` (local repo; `--quick` chains a `dev-<name>` work + `develop` worktree + optional `-o` open), `ls`, `fetch` (wrapped in `pre/post-repo-fetch` hooks), `info`, `health`, `rm`, plus `renderHealthList` / `renderHealthDetail` (detail renders the captured `repo-health` hook output)
- `commands/work.ts` — `new` (incl. `-o`), `ls`, `info`, `path`, `describe`, `worktree {add,ls,rm,hydrate}` (fires the worktree-create/remove hooks), `port {set,unset,ls}`, `archive`, `unarchive` (fire the work-archive/unarchive hooks), `destroy`
- `commands/bin.ts` — `mx bin` / `mx bins`: `ls` (tags shipped vs user bins by checking the bundled `templates/bin/`, flags non-executable ones, reports PATH membership) and `path`; dispatched from `main.ts`
- `tsup.config.ts` — bundles `src/bin/mx.ts` → `../../npm/bin/mx.js`; on success, copies templates/ and LICENSE into `npm/`

### `npm/` (the publishable package)

Committed:
- `npm/package.json` — public metadata (`@roulabs/mx`, version, bin → `bin/mx.js`, `publishConfig.access: public`)
- `npm/README.md` — consumer docs

Built by `pnpm build` (gitignored):
- `npm/bin/mx.js` — bundled, single-file CLI (`@mx/core` is `noExternal`-bundled in)
- `npm/templates/` — copied verbatim from `/templates/` at the repo root
- `npm/LICENSE` — copied from the repo root

`npm publish` runs from this folder.

## Build flow

```
templates/                        scripts/release.sh
  ├── CLAUDE.md                   (the release driver)
  ├── work.json                                              ┐
  ├── workspace.code-workspace                               │
  ├── hooks/<event>                                          │
  ├── bin/<tool>                                             │
  └── context/INDEX.json                                     │ pnpm release
                       │                                     │   ↓
                       ↓ (tsup onSuccess copy)               │ pnpm typecheck/lint/test/build
                                                             │ npm publish --auth-type=web from npm/
packages/core/src/  ┐                                        │ git tag -a vX.Y.Z; git push HEAD; git push tag
                    ├── (tsup noExternal bundle)             │
apps/cli/src/       ┘                                        │
                     ↓                                       │
                  npm/bin/mx.js                              │
                  npm/templates/                             │
                  npm/LICENSE                                │
                  npm/package.json   (committed)             │
                  npm/README.md      (committed)             │
                                                             ↓
                                                          @roulabs/mx@X.Y.Z on npm
                                                          tag vX.Y.Z on GitHub
```

## Zero runtime dependencies

`@roulabs/mx` ships with **no `dependencies`** in its `package.json`. The CLI uses only Node builtins (`node:fs`, `node:path`, `node:child_process`, `node:url`, …). `@mx/core` is `noExternal`-bundled into the CLI by tsup so it's not declared either. Tooling (tsup, eslint, vitest, prettier) is `devDependencies` only.

## Workflow

```bash
pnpm install
pnpm build         # populate npm/ (bin/mx.js + templates/ + LICENSE)
pnpm typecheck     # tsc --noEmit across packages
pnpm lint          # eslint
pnpm test          # vitest
pnpm dev           # tsup --watch
pnpm mx -- <args>  # run the local build (= node npm/bin/mx.js)
pnpm release       # the local release driver (scripts/release.sh)
```

See [development](development.md) for more on the dev loop and testing.

## CI

`.github/workflows/ci.yml` runs `typecheck/lint/test/build` on every PR. `.github/workflows/release.yml` publishes on every push to `main` (i.e. each merged PR): it checks out, runs the same pipeline, `npm publish`es from `npm/` (auth via the `NPM_TOKEN` secret), tags `vX.Y.Z`, and creates a GitHub Release — failing the run if the version in `npm/package.json` matches an existing tag (so every merge must bump). `pnpm release` (`scripts/release.sh`) remains a local fallback. See [release](release.md).
