# project-mx — source for the mx system

This folder is the **source of truth** for **mx** ("multiplexer"), a system for running several features in parallel across shared repos using git worktrees. You are working on mx *itself* here — the CLI, the templates, the docs — not on any feature.

mx produces a **runtime**: a single `mx/` folder elsewhere on this device, containing `repos/`, `works/`, and the `CLAUDE.md` stamped from `templates/`. **One device has one runtime instance.** Sessions launched in the runtime do feature work; sessions here build and maintain the tool.

## The core principle: mx owns runtime state

`mx` (the CLI in `bin/mx`) is the **single owner** of all runtime state — the per-work manifest (`work.json`) and the VS Code `.code-workspace`. Feature sessions in the runtime never hand-edit those files and never run raw `git worktree`; they go through `mx` commands, which read state and (for reads) emit stable JSON via `--porcelain`. `project-mx` and the feature sessions are just harnesses around the `mx` CLI.

## Running the CLI

`bin/mx` is on `$PATH` via the user's `~/.zshrc` (`export PATH="$HOME/Projects/project-mx/bin:$PATH"`), so `mx` is callable globally and from any directory. When editing the CLI, the live `mx` command reflects your changes immediately (it's the same file — no build/reinstall step). The active runtime is `~/mx`, recorded in `.mx-runtime`.

## Finding the runtime

One runtime per device. The CLI locates it in this order:

1. `--runtime <path>` flag (explicit override).
2. `$MX_RUNTIME` environment variable.
3. The path recorded in `.mx-runtime` at the project root (written by `mx init`).

`.mx-runtime` is machine-local and gitignored. Commands resolve the runtime through this mechanism — never hardcode a path. `bin/mx` locates `project-mx` (for template stamping) via its own file path.

## Source-of-truth rule

Everything a runtime uses is generated from this project. The runtime's `CLAUDE.md` is an **installed copy** of `templates/CLAUDE.md`. The per-work `work.json` and `.code-workspace` are **generated programmatically** by the CLI (not text-substituted); `templates/work.json` and `templates/workspace.code-workspace` hold their reference shapes.

- To change runtime guidance, edit `templates/CLAUDE.md`, then run `mx update`.
- Never hand-edit a runtime's installed `CLAUDE.md` — it will drift from this source.
- A live runtime is build output; treat its top-level files that way.
- The runtime carries **only** a `CLAUDE.md` (no runtime `README.md`).

## `mx update`

The runtime's `CLAUDE.md` is an installed copy of `templates/CLAUDE.md`; edits here don't reach the runtime until you sync. `mx update` re-stamps that file into the discovered runtime (and removes a stale runtime `README.md` if one lingers). It does **not** touch `repos/` or anything under `works/`.

## Touching the runtime while developing (hard rule)

**Never test the CLI against the real runtime.** During development, all testing happens against a throwaway sandbox runtime under `/tmp` — never the user's real runtime (e.g. `~/Projects/mx`) and never its real clones (`agents`, `muze-ai`, …).

The only sanctioned writes to the real runtime are the explicit commands the **user** chooses to run (`init`, `repo add`, `work new`, `work ... worktree add/rm`, `work ... destroy`, `update`). When you are developing or verifying, instead:

1. Create a sandbox and point everything at it: `export MX_RUNTIME=/tmp/mx-sbx` then `./bin/mx init /tmp/mx-sbx`.
2. Use locally-created throwaway git repos as clone sources (`git init` in `/tmp/...`) so tests need no network and never touch real remotes.
3. Run the full scenario against the sandbox only.
4. **Clean up afterward:** `rm -rf /tmp/mx-sbx` and remove the stray pointer — `mx init` rewrites `.mx-runtime` at the project root, so a sandbox run will overwrite the real runtime pointer. Delete or restore `.mx-runtime` when done.

If a change can only be confirmed against the real runtime, stop and ask the user to run the command themselves.

## Layout

```
project-mx/
├── CLAUDE.md                       # this file — how to work on mx
├── README.md                       # project overview + dev guide
├── .gitignore
├── .mx-runtime                     # machine-local runtime path (gitignored)
├── bin/
│   └── mx                          # the CLI (Node, single file, zero deps)
└── templates/
    ├── CLAUDE.md                   # installed into a runtime — feature-session rules
    ├── work.json                   # reference shape (CLI generates programmatically)
    └── workspace.code-workspace
```

## The runtime model

```
mx/
├── .mx-root            # marker file
├── CLAUDE.md           # from templates/CLAUDE.md
├── repos/<repo>/       # pristine clones — read-only reference
└── works/<feature>/    # one folder per feature
    ├── work.json       # manifest, owned by mx
    ├── <feature>.code-workspace
    └── <repo>/         # git worktree on the feature branch
```

`templates/CLAUDE.md` is the **authoritative description** of how feature sessions behave (never edit `repos/`, never hand-edit `work.json`, never raw-`git` worktrees, ask before adding a worktree, keep branches on teardown, per-service free-port allocation). Read it before changing anything that affects runtime behavior, and keep it consistent with the CLI.

## The mx CLI — command contracts

Implemented in `bin/mx` (Node, single file, zero deps). Each command resolves the runtime via the discovery order above. Reads accept `--porcelain` (stable JSON); mutations echo the resulting object; errors under `--porcelain` are `{"error","code"}` with a non-zero exit.

The `-n <name>` selector can be **omitted when the cwd implies it**: inside `works/<work>/…` infers the work (and, in a worktree, the repo); inside `repos/<repo>/…` infers the repo. An explicit `-n` always overrides. Comparison is realpath-based (handles symlinked roots).

**Global**
- **`mx init [path]`** — idempotent scaffold/adopt of a runtime (default `~/mx`): create `repos/`, `works/`, `.mx-root`; stamp `CLAUDE.md`; record the path in `.mx-runtime`. Never clobbers existing `repos/`/`works/`. Does not clone repos.
- **`mx status [--porcelain]`** — runtime path, repos + branches, works + worktrees + ports.
- **`mx update`** — re-stamp the runtime `CLAUDE.md`.
- **`mx help` / `mx version`**.

**Repos** — `mx repo`
- **`add <git-url> [--name <n>]`** — clone into `repos/<name>` (the only command that clones).
- **`ls`** · **`-n <name> fetch`** · **`-n <name> info`** · **`-n <name> rm`** (refuses if any work uses it).

**Works** — `mx work`
- **`new <name> [--description <text>]`** — create the work folder, `work.json`, and empty `.code-workspace`. Name is immutable. Output includes the work folder's absolute `path`.
- **`ls`** · **`-n <name> info`** · **`-n <name> describe <text>`** · **`-n <name> path`** (prints the work folder path; plain output is the bare path so `cd "$(mx work -n <name> path)"` works).
- **`-n <name> worktree add <repo> [--branch <b>] [--base <ref>]`** — create a worktree from `repos/<repo>`, register it in `work.json` + `.code-workspace`. `--branch` is the new branch (default = work name; reused if it exists). `--base` is the start point: it's resolved to a commit SHA (trying the ref as given, then `origin/<ref>`) before `git worktree add -b`, so a bare branch name forks correctly instead of git DWIM-ing a same-named local branch.
- **`-n <name> worktree ls`** · **`-n <name> worktree rm <repo>`** (refuses on uncommitted changes; keeps branch).
- **`-n <name> port set <repo> <service> [<port>]`** — record a port (auto-picks a free one across all works if omitted; explicit port must be free). Only updates `work.json`.
- **`-n <name> port unset <repo> <service>`** · **`-n <name> port ls`**
- **`-n <name> destroy`** — remove worktrees + work folder; refuses if any worktree is dirty; **keeps branches**.

Deferred: **`mx open`** (terminal/editor layout) — not built yet.

Generated-file shapes (CLI fills these programmatically):
- `work.json`: `{ "name", "description", "worktrees": [ { "repo", "branch", "ports": { "<service>": <port> } } ] }` — no `status` field, no port blocks.
- `.code-workspace` `folders[]` entry: `{ "name": "<repo>", "path": "<repo>" }`.

Invariants the CLI enforces:
- Never write into `repos/<repo>` except via `git worktree add`.
- Worktree creation happens only on an explicit `worktree add` command — never as a side effect.
- Ports are unique across **all** works (no fixed blocks); allocation scans every `work.json`.
- `worktree rm` / `destroy` refuse on uncommitted changes and never delete branches.
- Always resolve the runtime through discovery; never assume a fixed location.

## Conventions

- CLI language is **Node, single file, zero dependencies** (`node:` builtins only). Stated at the top of `bin/mx`.
- Keep `templates/CLAUDE.md` and the CLI's behavior consistent — they're the contract feature sessions rely on. If one changes, update the other in the same pass, and remember a runtime only sees changes after `mx update`.
