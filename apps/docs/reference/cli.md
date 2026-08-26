# CLI reference

Every mx command, grouped by area. Reads accept `--porcelain` for stable JSON; mutations echo the resulting object. When you're inside a work folder you can omit `-n <name>` — mx infers the work (and, inside a worktree, the repo) from your current directory.

## Global

| Command | What it does |
| --- | --- |
| `mx init [path]` | Create or adopt a runtime (target = path arg, else `$MX_RUNTIME`, else `~/mx`). Idempotent. |
| `mx info [--all] [--porcelain]` | Show the runtime: repos + branches, works + worktrees + ports. `--all` includes archived. Alias: `mx i`. |
| `mx health [--all]` | Whole-runtime health: every repo and active work. `--all` includes archived. |
| `mx mission-control [--port <n>] [-o]` | Start the live, read-only web dashboard. Alias: `mx mc`. |
| `mx divider <text> [-o]` | Fill a terminal with `<text>` as block letters — a visual separator for macOS Spaces. |
| `mx doctor [--install [--yes]]` | Check the tmux workflow's dependencies and print the install command for anything missing. `--install` runs it. |
| `mx sync` | Re-stamp mx-owned runtime files (never touches your data). |
| `mx update` | Self-update the CLI within its major; then auto-runs `mx sync`. |
| `mx migrate [--dry-run]` | Upgrade an older runtime to the version this CLI supports. |
| `mx help` / `mx version` | Help and version. |

## Repos

`mx repo …` — repo clones live at `repos/<repo>/git`.

| Command | What it does |
| --- | --- |
| `add <git-url> [--name <n>]` | Clone a repo into the runtime (the only command that clones). |
| `new <name> [--quick] [-o] [--description <t>]` | Create a fresh **local** repo (no remote). `--quick` also makes a `dev-<name>` work + worktree. |
| `ls` | List repos. |
| `-n <name> fetch` | Fast-forward the repo's branches. `mx repo fetch --all` does every repo. |
| `-n <name> info` | Show one repo. |
| `health` / `-n <name> health` | Local health report (branch, uncommitted/untracked, ahead/behind, last fetched). |
| `-n <name> rm` | Remove a repo (refuses if any work uses it). |

## Works

`mx work …` — one work per feature.

| Command | What it does |
| --- | --- |
| `new <name> [<repo>[:<branch>[:<base>]]]… [-o]` | Create a work; positional repos create initial worktrees. `-o` opens it. |
| `ls [--all\|--archived]` | List works (active by default). |
| `-n <name> info [--porcelain]` | Show one work — repos, branches, ports. |
| `describe <t>` / `path` | Set the description / print the work folder path. |
| `attach [--prompt <t>]` | Enter the work: build its tmux session (`mx/<name>`) if missing, then attach this terminal. `--porcelain` ensures it without attaching. See **[The tmux workflow](/guides/tmux)**. |
| `open` (alias `-o`) | Same as `attach`, but opens the session in a new terminal window (macOS Terminal, or a Linux emulator). |
| `switch [<name>]` | Jump between works' sessions: with `<name>` it's `attach`; without, an fzf picker over this runtime's live `mx/*` sessions. |
| `gc [--yes]` | Prune orphaned tmux sessions — live `mx/<work>` sessions whose work is archived or gone (e.g. restored by tmux-resurrect after a reboot). Warns on live panes; confirm or `--yes`. |
| `worktree add <repo> [<name>] [--branch <b>] [--base <ref>]` | Add a worktree (distinct `<name>` for a second worktree of the same repo). |
| `worktree ls` / `worktree rm <worktree>` | List / remove a worktree. |
| `worktree set-branch <worktree> [<branch>]` | Re-record a worktree's live branch after you `git checkout` yourself. |
| `port set <worktree> <service> [<port>]` | Allocate a port (unique across all works). |
| `port unset <worktree> <service>` / `port ls` | Release / list ports. |
| `health` / `-n <name> health` | Local work-folder health. |
| `archive [--yes]` | Free worktrees + ports **and kill the work's tmux session** (warns on a live pane); keep branches, folder, and sessions. Recoverable. |
| `unarchive [<worktree>=<branch>…]` | Re-create worktrees from the manifest. |
| `destroy --force` | Permanently delete the work folder **and kill its tmux session** (branches still kept). |

## Bin

`mx bin …` (alias `mx bins`) — runtime-wide helper executables at `<runtime>/bin/`.

| Command | What it does |
| --- | --- |
| `ls` | List bins (mx-shipped vs your own) and whether `bin/` is on `PATH`. |
| `path` | Print the bin dir, e.g. `export PATH="$(mx bin path):$PATH"`. |

## Common flags

- `--porcelain` — stable JSON output on read commands.
- `-n <name>` — target a specific repo/work; omit it inside the relevant folder.
- `--runtime <path>` — target a specific runtime (overrides `$MX_RUNTIME`). See **[Configuration](/reference/configuration)**.

::: tip Full detail
This is the user-facing summary. For exhaustive flag-by-flag behavior and error codes, see the reference in the source repo's `docs/commands.md`.
:::
