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

On the runtime side it produces the v2 **container layout**: a `VERSION` file at the runtime root, each repo as a container `repos/<repo>/` holding the clone at `git/` plus per-repo `setup.sh` / `health.sh`, and each work carrying a `.claude/settings.json` context-index hook. See [runtime-model](runtime-model.md).

Key files in `packages/core/src/`:

- `errors.ts` — the `MxError` class with a string `code` (`'NO_REPO'`, `'DIRTY'`, `'NEED_CONFIRMATION'`, …)
- `types.ts` — `Work`, `Worktree`, `RepoSummary`, `RuntimeOpts`, `InferredContext`
- `runtime.ts` — runtime discovery (`discoverRuntime`, `requireRuntime`, `defaultRuntime`), the `initRuntime` / `syncRuntime` lifecycle, `ensureWorkScaffolding`, work-manifest read/write, `inferContext`, and the path helpers (`reposDir`, `repoGitDir`, `worksDir`, `workDir`, `workspaceFile`). The repo container's clone now lives at `repos/<repo>/git/`.
- `migrations.ts` — runtime layout versioning: read/write `VERSION`, the `RUNTIME_VERSION` this CLI supports, the version gate, and the registered migration steps (the v1 → v2 step moves each clone into `git/` and runs `git worktree repair`). Validates the full migration chain before mutating; raises `RUNTIME_VERSION_MISMATCH` / `CLI_TOO_OLD` / `NO_MIGRATION` / `BAD_VERSION`.
- `repos.ts` — `repoAdd`, `repoFetch`, `repoInfo`, `repoRemove`, `listReposInfo`, `repoHealth` / `listRepoHealth` (purely local health snapshot plus the captured `health.sh` `extra` field); stamps per-repo `setup.sh` / `health.sh` into the container
- `works.ts` — `workNew`, `worktreeAdd` / `worktreeList` / `worktreeRemove` / `worktreeSetup`, port helpers (`portSet`, `portUnset`, `portList`, `nextFreePort`, `allocatedPorts`), `archiveWork` / `unarchiveWork`, `workDestroy`, `listWorksInfo`, `WorkSummary = Work & { sessions: number }`; runs `setup.sh` after `worktreeAdd`
- `status.ts` — `statusRuntime` → `StatusResult` (`{runtime, context, repos, works, archivedWorksCount}`)
- `templates.ts` — `stampClaudeMd`, `stampContextIndex`, `stampRepoScripts`, `stampWorkClaudeSettings`, `removeStaleRuntimeReadme`
- `git.ts` — thin wrappers over `git` (currentBranch, remoteUrl, branchExists, isDirty, resolveBase, worktreeRepair, …)
- `fsutil.ts`, `json.ts` — small filesystem and JSON helpers
- `index.ts` — public surface

### `@mx/cli` (`apps/cli/`)

Thin CLI over `@mx/core`. Handles arg parsing, cwd→`-n` inference, output formatting (`--porcelain` vs human), exit codes. **Private**, never published — exists only as a workspace member so pnpm can wire `@mx/core` in.

Key files in `apps/cli/src/`:

- `bin/mx.ts` — entrypoint; just calls `main()`
- `main.ts` — version read from `<pkg>/package.json` at startup; alias handling (`mx s`/`st` → `status`); top-level dispatch; applies the runtime version gate before runtime-touching commands (allowing only `migrate`, `update`, `help`, `version` on a mismatch)
- `args.ts` — argv parser with `Flags`: `porcelain`, `help`, `version`, `force`, `yes`, `all`, `archived`, `open`, `noSetup`, `runtime`, `name`, `description`, `branch`, `base`
- `output.ts` — `emit(human, data)`, `fail(err)`, the monochrome style helpers (`dim`, `bold`), the plain glyphs (`check()` = ✓, `warn()` = ⚠), and `confirmYesNo()` (sync TTY prompt via `spawnSync('/bin/sh', ['-c', 'read REPLY'])`)
- `paths.ts` — `templatesDir()` resolves `<pkg>/bin/mx.js` → `<pkg>/templates`
- `selfupdate.ts` — `mx update`: self-updates the CLI within its major via `npm i -g @roulabs/mx@^<major>`, detects a newer major and prints the deliberate upgrade suggestion, falls back to printing the manual command if npm is missing or the install fails
- `setup.ts` — runs the per-repo `setup.sh` hook (env + positional args, cwd = worktree) after `worktree add` and for `worktree setup`; classifies non-zero exits (warning when automatic, `SETUP_FAILED` when explicit). Also home to the macOS `mx work new -o` Terminal+editor open helper
- `help.ts` — `mx help` text
- `commands/global.ts` — `init`, `status`, `sync`, `update`, `migrate`, plus `renderStatus()`
- `commands/repo.ts` — `add`, `ls`, `fetch`, `info`, `health`, `rm`, plus `renderHealthList` / `renderHealthDetail` (detail renders the captured `health.sh` `extra`)
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
  ├── repo/setup.sh                                          │
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

`.github/workflows/ci.yml` runs `typecheck/lint/test/build` on every PR. There is **no** release workflow — `pnpm release` is local-only by design (no NPM_TOKEN secret to rotate). See [release](release.md).
