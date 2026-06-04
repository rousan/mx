# mx

**mx** ("multiplexer") runs several features in parallel across shared repos using git worktrees. Each feature gets an isolated environment — its own worktrees, branches, and ports — so you switch between features instantly without stashing or branch-juggling.

mx manages a **runtime**: a single `mx/` folder holding pristine repo clones (`repos/`) and one folder per feature (`works/`), each with git worktrees on its own branch. mx owns the per-work manifest (`work.json`) and a VS Code workspace file; you drive everything through `mx` commands.

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
mx status                                # see repos, works, worktrees, ports
```

Inside a work folder or worktree you can drop `-n` — mx infers the work/repo from your cwd. Read commands accept `--porcelain` for stable JSON; errors are `{"error","code"}` with a non-zero exit.

## Commands

| command | does |
|---|---|
| `mx init [path]` | scaffold/adopt a runtime (`repos/`, `works/`, `.mx-root`, `CLAUDE.md`) |
| `mx status [--porcelain]` | list repos, works, worktrees, ports |
| `mx update` | re-stamp the runtime's `CLAUDE.md` |
| `mx repo add <git-url> [--name <n>]` | clone a pristine repo |
| `mx repo ls` / `mx repo -n <name> fetch\|info\|rm` | manage pristine repos |
| `mx work new <name> [--description <t>]` | create a work |
| `mx work ls` / `mx work -n <name> info\|describe\|path` | manage works |
| `mx work -n <name> worktree add\|ls\|rm <repo> [--branch <b>] [--base <ref>]` | manage worktrees |
| `mx work -n <name> port set\|unset\|ls <repo> <service> [<port>]` | allocate/release ports |
| `mx work -n <name> destroy` | remove worktrees + work folder (keeps branches) |

## License

MIT
