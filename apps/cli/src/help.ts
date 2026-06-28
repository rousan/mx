/**
 * Full help text shown for `mx help`, `mx --help`, or a bare `mx` invocation.
 */
export const HELP = `mx — control panel for the mx runtime

Global:
  mx init [path]                         scaffold/adopt a runtime (default ~/mx)
  mx info [--all] [--porcelain]          show runtime version, repos, works, ports (active only by default; --all to include archived; alias: mx i)
  mx sync                                re-stamp runtime files (CLAUDE.md, scaffolding) from current templates — same-major, non-breaking
  mx update                              self-update the mx CLI within its major (npm i -g); flags a newer major if one exists
  mx migrate                             upgrade an older-version runtime to the version this CLI supports (the only command allowed on a mismatched runtime)
  mx help | version

Repos (pristine clones):
  mx repo add <git-url> [--name <n>]     clone a repo into the runtime
  mx repo ls [--porcelain]
  mx repo -n <name> path                 print the repo container path (cd "$(mx repo -n <name> path)")
  mx repo -n <name> fetch                git fetch (+ ff the checked-out and base branches)
  mx repo fetch --all                    fetch every repo, one by one
  mx repo -n <name> info [--porcelain]
  mx repo health [--porcelain]           pure-local health summary for every pristine clone
  mx repo -n <name> health [--porcelain] detailed health for one pristine clone
  mx repo -n <name> rm                   refuses if any work uses it

Works (features):
  mx work new <name> [--description <t>] [-o|--open]    creates folder + empty work.json + sessions/; -o opens a fullscreen Terminal (cd'd in) + editor on the workspace (macOS)
  mx work ls [--all|--archived] [--porcelain]           default: active only; --all includes archived; --archived shows archived only
  mx work -n <name> info [--porcelain]
  mx work -n <name> path                                print the work folder path (cd "$(mx work -n <name> path)")
  mx work -n <name> open  (or -o)                       open the work's fullscreen Terminal + editor layout (macOS)
  mx work -n <name> describe <text>
  mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>] [--no-hydrate]   runs the repo's hydrate.sh after add unless --no-hydrate
  mx work -n <name> worktree ls [--porcelain]
  mx work -n <name> worktree rm <repo>                  refuses on uncommitted changes; keeps branch
  mx work -n <name> worktree hydrate <repo>             re-run the repo's hydrate.sh against its worktree
  mx work -n <name> port set <repo> <service> [<port>]  auto-picks a free port if omitted
  mx work -n <name> port unset <repo> <service>
  mx work -n <name> port ls [--porcelain]
  mx work -n <name> archive [--yes|-y]                  removes worktrees; keeps folder + work.json + sessions; prompts for confirmation (use --yes to skip)
  mx work -n <name> unarchive [<repo>=<branch>...]      re-creates worktrees from work.json; override per-repo branch if recorded one is missing
  mx work -n <name> destroy --force                     PERMANENT: deletes the work folder including session summaries (branches kept). Prefer archive.

The -n <name> selector may be omitted when your cwd implies it: inside a work folder or
worktree (works/<work>/...) the work is inferred; inside repos/<repo>/... the repo is inferred.

Runtime discovery: --runtime <path>  ->  $MX_RUNTIME  ->  default ~/mx.
--porcelain emits stable JSON on reads; errors are {"error","code"} with a non-zero exit.
`;
