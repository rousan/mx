# Overview

mx ("multiplexer") is a CLI for running **several features in parallel across shared repos**, using git worktrees. Each feature gets an isolated environment — its own worktrees, branches, and ports — so you switch between features instantly without stashing or branch-juggling.

End-users install it with:

```bash
npm i -g @roulabs/mx     # provides the `mx` command
```

Requires Node ≥22 and git.

## The core mental model

mx manages a **runtime**: a single folder somewhere on disk (default `~/mx`, override via `$MX_RUNTIME` or `--runtime`) holding:

```
<runtime>/
├── .mx-root                     # marker
├── CLAUDE.md                    # feature-session rules (stamped from templates/)
├── context/                     # shared memory across features
│   ├── INDEX.json               # single source of truth for entry metadata
│   └── <path>.md                # body-only entries (nested folders allowed)
├── repos/<repo>/                # pristine clones, kept on default branch; READ-ONLY base
└── works/<feature>/             # one folder per parallel feature
    ├── work.json                # manifest (owned by mx)
    ├── <feature>.code-workspace # VS Code workspace (owned by mx)
    ├── sessions/                # per-session summaries (one .md each)
    └── <repo>/                  # git worktree on the feature branch
```

Two things to internalize:

1. **`repos/` is read-only reference.** You never edit, commit, or run dev servers inside `<runtime>/repos/<repo>/`. Worktrees fork from these pristine clones and share their `.git` object store.
2. **`mx` owns its state.** `work.json` and `.code-workspace` are written only through `mx` commands. Feature sessions never hand-edit them.

## Two surfaces

- **The CLI** — `mx init`, `mx work new`, `mx repo add`, `mx status`, etc. Every read takes `--porcelain` for stable JSON; mutations echo the resulting object; errors are `{"error","code"}` with a non-zero exit. See [commands](commands.md).
- **The runtime CLAUDE.md** — stamped into the runtime by `mx init` (re-stamped by `mx update`). Tells the agent (Claude or otherwise) the rules for working inside this runtime: never edit `repos/`, never hand-edit `work.json`, etc. The contract feature sessions rely on.

## Who uses mx

- **Developers running multiple parallel features** — open one Claude session per feature, no context-switching cost.
- **AI agents** — porcelain output is structured JSON; `inferContext` lets agents omit `-n <name>` when the cwd implies it.
- **Yourself, dogfooding** — you can host the mx source as a work inside an mx runtime and use mx's multiplexer for parallel mx-development. See [self-hosting](self-hosting.md).

## Where things live in this repo

The source repo at `github.com/roulabs/mx`:

- `packages/core/` — `@mx/core`, pure domain logic (no I/O for stdout, no `process.exit`)
- `apps/cli/` — `@mx/cli`, the CLI source wrapping `@mx/core`
- `npm/` — the publishable package layout; `pnpm build` populates `npm/bin/mx.js`
- `templates/` — runtime assets (`CLAUDE.md`, `work.json`, `.code-workspace`, `context/INDEX.json`) that mx stamps into runtimes
- `scripts/release.sh` — local release driver
- `CLAUDE.md` (root) — auto-loaded by Claude sessions in this repo
- `docs/` (this folder) — deeper material this overview links to

See [architecture](architecture.md) for the full source tour.
