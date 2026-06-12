/**
 * Full help text shown for `mx help`, `mx --help`, or a bare `mx` invocation.
 */
export const HELP = `mx — control panel for the mx runtime

Global:
  mx init [path]                         scaffold/adopt a runtime (default ~/mx)
  mx status [--all] [--porcelain]        show runtime, repos, works, ports (active only by default; --all to include archived; aliases: mx s, mx st)
  mx update                              re-sync runtime from current templates + backfill structural scaffolding
  mx help | version

Repos (pristine clones):
  mx repo add <git-url> [--name <n>]     clone a repo into the runtime
  mx repo ls [--porcelain]
  mx repo -n <name> fetch                git fetch (+ ff current branch)
  mx repo -n <name> info [--porcelain]
  mx repo health [--porcelain]           pure-local health summary for every pristine clone
  mx repo -n <name> health [--porcelain] detailed health for one pristine clone
  mx repo -n <name> rm                   refuses if any work uses it

Works (features):
  mx work new <name> [--description <t>]                creates folder + empty work.json + sessions/
  mx work ls [--all|--archived] [--porcelain]           default: active only; --all includes archived; --archived shows archived only
  mx work -n <name> info [--porcelain]
  mx work -n <name> path                                print the work folder path (cd "$(mx work -n <name> path)")
  mx work -n <name> describe <text>
  mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>]
  mx work -n <name> worktree ls [--porcelain]
  mx work -n <name> worktree rm <repo>                  refuses on uncommitted changes; keeps branch
  mx work -n <name> port set <repo> <service> [<port>]  auto-picks a free port if omitted
  mx work -n <name> port unset <repo> <service>
  mx work -n <name> port ls [--porcelain]
  mx work -n <name> archive                             removes worktrees; keeps folder + work.json + sessions; recoverable
  mx work -n <name> unarchive [<repo>=<branch>...]      re-creates worktrees from work.json; override per-repo branch if recorded one is missing
  mx work -n <name> destroy --force                     PERMANENT: deletes the work folder including session summaries (branches kept). Prefer archive.

The -n <name> selector may be omitted when your cwd implies it: inside a work folder or
worktree (works/<work>/...) the work is inferred; inside repos/<repo>/... the repo is inferred.

Runtime discovery: --runtime <path>  ->  $MX_RUNTIME  ->  default ~/mx.
--porcelain emits stable JSON on reads; errors are {"error","code"} with a non-zero exit.
`;
