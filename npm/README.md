# mx

**mx** ("multiplexer") runs several features in parallel across shared repos using git worktrees. Each feature gets an isolated environment — its own worktrees, branches, and ports — so you switch between features instantly without stashing or branch-juggling.

mx manages a **runtime**: a single `mx/` folder holding pristine repo clones (each in a per-repo container at `repos/<repo>/git`) and one folder per feature (`works/`), each with its git worktrees under `wt/<repo>` on their own branches. It also carries a shared `context/` (institutional knowledge) and a free-form `files/` store (operational values like creds, cluster names, and tokens that any work can read). mx owns the per-work manifest (`work.json`) and a VS Code workspace file; you drive everything through `mx` commands.

The runtime is **versioned** (an integer in `<runtime>/mx.json`). A given CLI supports exactly one runtime version — CLI major ⇄ runtime version (CLI 2.x ⇄ runtime v2). After a major CLI upgrade, run `mx migrate` once to bring an existing runtime up to date.

## Install

```bash
npm install -g @rousan/mx      # provides the `mx` command
```

Requires Node >= 22 and git.

## Point mx at a runtime

mx resolves its runtime in this order: `--runtime <path>` flag, then `$MX_RUNTIME`, then the default `~/mx`. Set it once in your shell:

```bash
export MX_RUNTIME="$HOME/mx"
```

## Quick start

```bash
mx init                                  # scaffold the runtime (at $MX_RUNTIME or ~/mx)
mx repo add git@github.com:you/app.git   # clone a pristine repo into the runtime
mx work new my-feature                   # create a work (prints its folder path)
mx work -n my-feature worktree add app   # add a worktree on branch my-feature
mx work -n my-feature port set app web   # allocate a free port (across all works)
mx info                                # see repos, works, worktrees, ports
```

Inside a work folder or worktree you can drop `-n` — mx infers the work/repo from your cwd. Read commands accept `--porcelain` for stable JSON; errors are `{"error","code"}` with a non-zero exit.

## Commands

| command | does |
|---|---|
| `mx init [path]` | scaffold/adopt a runtime (`repos/`, `works/`, `bin/`, `.mx-root`, `mx.json`, `CLAUDE.md`) |
| `mx info [--all] [--porcelain]` | list repos, works, worktrees, ports |
| `mx sync` | re-stamp the runtime's mx-owned files (`CLAUDE.md`, per-repo/per-work scaffolding) from the current CLI — same-major, non-destructive |
| `mx update` | self-update the CLI within its major (`npm i -g`), then auto-run `mx sync`; flags a newer major if one exists |
| `mx migrate [--dry-run]` | upgrade an older-version runtime to the version this CLI supports (the only command allowed on a version-mismatched runtime); `--dry-run` previews the plan without changing anything |
| `mx repo add <git-url> [--name <n>]` | clone a pristine repo (into `repos/<repo>/git`; writes its `repo.json`) |
| `mx repo new <name> [--quick] [-o]` | create a fresh local repo with no remote (git init on main + README + initial commit); `--quick` also makes a `dev-<name>` work + a `develop` worktree (quick-experiment one-shot) |
| `mx repo ls` / `mx repo -n <name> fetch\|info\|rm` | manage pristine repos |
| `mx repo health` / `mx repo -n <name> health` | local-only health check (augmented by the central `repo-health` hook) |
| `mx work new <name> [<repo>[:<branch>[:<base>]]]... [--branch <b>] [--base <ref>] [-o]` | create a work; extra args are repos to make initial worktrees for (per repo: branch = `:<branch>` → `--branch` → work name; base = `:<base>` → `--base` → pristine HEAD); `-o` opens a fullscreen Terminal + starts the work's Claude session (macOS) |
| `mx work ls [--all\|--archived]` / `mx work -n <name> info\|describe\|path` | manage works |
| `mx work -n <name> open` (or `-o`) `[--prompt <text>]` | fullscreen Terminal (macOS) that resumes-or-creates the per-work Claude session named `<name>` (0 → create, seeded by the `session-prompt` hook / `--prompt`; 1 → resume; ≥2 → error, resume manually) |
| `mx work -n <name> worktree add <repo> [<wt-name>] [--branch <b>] [--base <ref>]` | add a worktree (fires `pre/post-worktree-create`); `<wt-name>` defaults to the repo — pass a distinct one for multiple worktrees of the same repo |
| `mx work -n <name> worktree ls\|rm <wt-name>` | list / remove a worktree (by name; defaults to the repo) |
| `mx work -n <name> worktree set-branch <wt-name> [<branch>]` | re-record a worktree's branch in `work.json` after you switch branches inside it yourself (reads the live branch; mx never checks out); optional `<branch>` guards against a mismatch |
| `mx work -n <name> port set\|unset\|ls <wt-name> <service> [<port>]` | allocate/release ports per worktree (omit `<port>` to auto-pick) |
| `mx work -n <name> archive [--yes]` / `unarchive` | soft-delete / restore a work (keeps branches); fires the central `pre/post-work-archive` / `pre/post-work-unarchive` hooks (a `pre-*` non-zero exit aborts) |
| `mx work -n <name> destroy --force` | permanently remove the work folder (keeps branches) |
| `mx work health` / `mx work -n <name> health` | local-only work-folder audit (stray files, worktree presence, cross-work port collisions, archive invariants); augmented by the central `work-health` hook (`--all` includes archived) |
| `mx health [--all]` | whole-runtime overview: every repo's health + every active work's health |
| `mx bin ls` / `mx bin path` (alias `mx bins`) | list the runtime's `bin/` utility executables (mx-shipped + your own); `path` prints the dir for `export PATH="$(mx bin path):$PATH"` |
| `mx divider <text> [-o]` | fill a terminal with `<text>` as large block letters (a visual separator for macOS Spaces); `-o` opens a new fullscreen Terminal (macOS) |

## License

MIT
