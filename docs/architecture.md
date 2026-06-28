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

On the runtime side it produces the v2 **container layout**: a `mx.json` file at the runtime root, each repo as a container `repos/<repo>/` holding the clone at `git/` plus per-repo `hydrate.sh` / `health.sh`, and each work carrying its worktrees under `wt/<repo>`, the per-work scratch dirs (`scripts/`, `bin/`, `files/`, `tmp/`), a `hooks/` folder of per-work lifecycle hooks, a work `CLAUDE.md`, and a `.claude/settings.json` context-index hook. See [runtime-model](runtime-model.md).

Key files in `packages/core/src/`:

- `errors.ts` — the `MxError` class with a string `code` (`'NO_REPO'`, `'DIRTY'`, `'NEED_CONFIRMATION'`, …)
- `types.ts` — `Work`, `Worktree`, `RepoSummary`, `RuntimeOpts`, `InferredContext`
- `runtime.ts` — runtime discovery (`discoverRuntime`, `requireRuntime`, `defaultRuntime`), the `initRuntime` / `syncRuntime` lifecycle, `ensureWorkScaffolding` (creates `wt/`/`scripts/`/`bin/`/`files/`/`tmp/`/`hooks/`/`sessions/` and stamps the work `CLAUDE.md`, `.claude/settings.json`, and the per-work lifecycle hook scripts `hooks/{pre,post}-{archive,unarchive}.sh` — via `WORK_HOOK_EVENTS` / `workHookScript` / `workHookScriptBody` — all stamp-if-missing), work-manifest read/write, `inferContext` (a repo is inferred from the `wt/<repo>` segment), and the path helpers (`reposDir`, `repoGitDir`, `worksDir`, `workDir`, `worktreesDir` → `wt/`, `worktreePath` → `wt/<repo>`, `workHooksDir`, `workHookScript`, `workspaceFile`). The repo container's clone lives at `repos/<repo>/git/`; worktrees live at `works/<work>/wt/<repo>`. `ensureWorkScaffolding` also stamps the work `CLAUDE.md` (a small `workClaudeMd(name)`-generated default, stamp-if-missing).
- `migrations.ts` — runtime layout versioning: read/write `mx.json`, the `RUNTIME_VERSION` this CLI supports, the version gate, and the registered migration steps. The v1 → v2 step runs both `migrateRepoLayout` (moves each clone into `git/` + `git worktree repair`) and `migrateWorkLayout` (moves each work's flat worktrees into `wt/` via `git worktree move`, creates the new scratch dirs, stamps the work `CLAUDE.md`, and rewrites the `.code-workspace` folder paths to `wt/<repo>`). Validates the full migration chain before mutating; raises `RUNTIME_VERSION_MISMATCH` / `CLI_TOO_OLD` / `NO_MIGRATION` / `BAD_VERSION`. `migrateRuntime(root, { dryRun })` threads a `dryRun` flag through every step (and through `migrateRepoLayout` / `migrateWorkLayout` / `ensureWorkScaffolding`): each guards its mutations but still returns the paths it would touch, so `mx migrate --dry-run` previews the plan without changing anything.
- `repos.ts` — `repoAdd` (clone from a remote), `repoNew` (create a fresh local repo: `git init` on main + README + initial commit), `repoFetch`, `repoInfo`, `repoRemove`, `listReposInfo`, `repoHealth` / `listRepoHealth` (purely local health snapshot plus the captured `health.sh` `extra` field); the CLI stamps per-repo `hydrate.sh` / `health.sh` into the container after add/new
- `works.ts` — `workNew` (scaffolds the work via `ensureWorkScaffolding`), `worktreeAdd` (creates the worktree under `wt/<repo>` and registers the `wt/<repo>` folder path in the `.code-workspace`) / `worktreeList` / `worktreeRemove` / `worktreeSetup`, port helpers (`portSet`, `portUnset`, `portList`, `nextFreePort`, `allocatedPorts`), `archiveWork` / `unarchiveWork`, `workDestroy`, `listWorksInfo`, `WorkSummary = Work & { sessions: number }`; runs `hydrate.sh` after `worktreeAdd`
- `status.ts` — `statusRuntime` → `StatusResult` (`{runtime, context, repos, works, archivedWorksCount}`)
- `templates.ts` — `stampClaudeMd`, `stampContextIndex`, `stampRepoScripts`, `stampWorkClaudeSettings`, `removeStaleRuntimeReadme` (the per-work `CLAUDE.md` is stamped inline by `ensureWorkScaffolding` in `runtime.ts`, not from a template file)
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
- `hydrate.ts` — runs the per-repo `hydrate.sh` hook (env + positional args, cwd = worktree) after `worktree add` and for `worktree hydrate`; classifies non-zero exits (warning when automatic, `HYDRATE_FAILED` when explicit). Also home to the macOS `mx work new -o` Terminal+editor open helper
- `workhooks.ts` — `runWorkHook(root, work, event, quiet)`: runs a per-work lifecycle hook (`hooks/<event>.sh`, cwd = work folder, env + positional args) if present, returning a `{ran, ok, missing}` outcome. `commands/work.ts` calls it around `archive`/`unarchive`: a `pre-*` non-zero exit aborts the op (`HOOK_FAILED`), a `post-*` non-zero exit only warns
- `help.ts` — `mx help` text
- `commands/global.ts` — `init`, `status`, `sync`, `update`, `migrate`, plus `renderStatus()`
- `commands/repo.ts` — `add`, `new` (local repo; `--quick` chains a `dev-<name>` work + `develop` worktree + optional `-o` open), `ls`, `fetch`, `info`, `health`, `rm`, plus `renderHealthList` / `renderHealthDetail` (detail renders the captured `health.sh` `extra`)
- `commands/work.ts` — `new` (incl. `-o`), `ls`, `info`, `path`, `describe`, `worktree {add,ls,rm,setup}`, `port {set,unset,ls}`, `archive`, `unarchive`, `destroy`
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
  ├── repo/hydrate.sh                                          │
  ├── repo/health.sh                                         │
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
