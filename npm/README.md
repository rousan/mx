# mx

**mx** ("multiplexer") runs several features in parallel across shared repos using git worktrees. Each feature gets an isolated environment — its own worktrees, branches, and ports — so you switch between features instantly without stashing or branch-juggling.

mx manages a **runtime**: a single `mx/` folder holding pristine repo clones (each in a per-repo container at `repos/<repo>/git`) and one folder per feature (`works/`), each with its git worktrees under `wt/<repo>` on their own branches. mx owns the per-work manifest (`work.json`) and a VS Code workspace file; you drive everything through `mx` commands.

The runtime is **versioned** (an integer in `<runtime>/mx.json`). A given CLI supports exactly one runtime version — CLI major ⇄ runtime version (CLI 2.x ⇄ runtime v2). After a major CLI upgrade, run `mx migrate` once to bring an existing runtime up to date.

## Install

```bash
npm install -g @roulabs/mx      # provides the `mx` command
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
| `mx init [path]` | scaffold/adopt a runtime (`repos/`, `works/`, `.mx-root`, `mx.json`, `CLAUDE.md`) |
| `mx info [--all] [--porcelain]` | list repos, works, worktrees, ports |
| `mx sync` | re-stamp the runtime's mx-owned files (`CLAUDE.md`, per-repo/per-work scaffolding) from the current CLI — same-major, non-destructive |
| `mx update` | self-update the CLI within its major (`npm i -g`); flags a newer major if one exists |
| `mx migrate [--dry-run]` | upgrade an older-version runtime to the version this CLI supports (the only command allowed on a version-mismatched runtime); `--dry-run` previews the plan without changing anything |
| `mx repo add <git-url> [--name <n>]` | clone a pristine repo (into `repos/<repo>/git`; stamps its `hydrate.sh`/`health.sh`) |
| `mx repo ls` / `mx repo -n <name> fetch\|info\|rm` | manage pristine repos |
| `mx repo health` / `mx repo -n <name> health` | local-only health check (augmented by the repo's `health.sh`) |
| `mx work new <name> [--description <t>] [-o]` | create a work; `-o` opens a fullscreen Terminal + editor (macOS) |
| `mx work ls [--all\|--archived]` / `mx work -n <name> info\|describe\|path` | manage works |
| `mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>] [--no-hydrate]` | add a worktree (runs the repo's `hydrate.sh` unless `--no-hydrate`) |
| `mx work -n <name> worktree ls\|rm\|hydrate <repo>` | list / remove / re-run hydrate for a worktree |
| `mx work -n <name> port set\|unset\|ls <repo> <service> [<port>]` | allocate/release ports |
| `mx work -n <name> archive [--yes]` / `unarchive` | soft-delete / restore a work (keeps branches); runs the work's `hooks/{pre,post}-{archive,unarchive}.sh` (a `pre-*` non-zero exit aborts) |
| `mx work -n <name> destroy --force` | permanently remove the work folder (keeps branches) |

## License

MIT
