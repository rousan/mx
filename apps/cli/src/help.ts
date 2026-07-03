/**
 * Full help text shown for `mx help`, `mx --help`, or a bare `mx` invocation.
 */
export const HELP = `mx — control panel for the mx runtime

Global:
  mx init [path]                         scaffold/adopt a runtime (default ~/mx)
  mx info [--all] [--porcelain]          show runtime version, repos, works, ports (active only by default; --all to include archived; alias: mx i)
  mx sync                                re-stamp runtime files (CLAUDE.md, scaffolding) from current templates — same-major, non-breaking
  mx update                              self-update the mx CLI within its major (npm i -g), then auto-run mx sync; flags a newer major if one exists
  mx migrate [--dry-run]                 upgrade an older-version runtime to the version this CLI supports (the only command allowed on a mismatched runtime); --dry-run previews the plan without changing anything
  mx help | version

Repos (pristine clones):
  mx repo add <git-url> [--name <n>]     clone a repo into the runtime
  mx repo new <name> [--quick] [-o]      create a fresh local repo (no remote); --quick also makes a dev-<name> work + develop worktree
  mx repo ls [--porcelain]
  mx repo -n <name> path                 print the repo container path (cd "$(mx repo -n <name> path)")
  mx repo -n <name> fetch                git fetch (+ ff the checked-out and base branches)
  mx repo fetch --all                    fetch every repo, one by one
  mx repo -n <name> info [--porcelain]
  mx repo health [--porcelain]           pure-local health summary for every pristine clone
  mx repo -n <name> health [--porcelain] detailed health for one pristine clone
  mx repo -n <name> rm                   refuses if any work uses it

Works (features):
  mx work new <name> [--description <t>] [-o|--open]    creates folder + empty work.json + sessions/; -o opens a fullscreen Terminal cd'd into the work folder (macOS)
  mx work ls [--all|--archived] [--porcelain]           default: active only; --all includes archived; --archived shows archived only
  mx work -n <name> info [--porcelain]
  mx work -n <name> path                                print the work folder path (cd "$(mx work -n <name> path)")
  mx work -n <name> open  (or -o)                       open the work in a fullscreen Terminal (macOS)
  mx work -n <name> describe <text>
  mx work -n <name> worktree add <repo> [<name>] [--branch <b>] [--base <ref>]   fires pre/post-worktree-create hooks; <name> (default repo) lets one work hold multiple worktrees of a repo
  mx work -n <name> worktree ls [--porcelain]
  mx work -n <name> worktree rm <worktree>              refuses on uncommitted changes; keeps branch
  mx work -n <name> worktree set-branch <worktree> [<branch>]   after you git-checkout in the worktree, re-record its branch in work.json (reads the live branch; mx never checks out)
  mx work -n <name> port set <worktree> <service> [<port>]  auto-picks a free port if omitted
  mx work -n <name> port unset <worktree> <service>
  mx work -n <name> port ls [--porcelain]
  mx work -n <name> archive [--yes|-y]                  removes worktrees; keeps folder + work.json + sessions; prompts for confirmation (use --yes to skip)
  mx work -n <name> unarchive [<worktree>=<branch>...]  re-creates worktrees from work.json; override per-worktree branch if recorded one is missing
  mx work -n <name> destroy --force                     PERMANENT: deletes the work folder including session summaries (branches kept). Prefer archive.
  mx work health [--all] [--porcelain]                  pure-local health for every active work (--all includes archived)
  mx work -n <name> health [--porcelain]                detailed health for one work

Health (whole-runtime overview):
  mx health [--all] [--porcelain]                       every repo's health + every active work's health (--all includes archived works)

Mission control (live web dashboard):
  mx mission-control [--port <n>] [-o]   (alias mx mc)  start a local, read-only live dashboard (repos, works, health, ports); -o opens the browser

Bin (runtime-wide utility executables in <runtime>/bin, meant for PATH):
  mx bin ls   (alias mx bins)                           list bins (mx-shipped + your own); shows whether bin/ is on PATH
  mx bin path                                           print the bin/ dir: export PATH="$(mx bin path):$PATH"

The -n <name> selector may be omitted when your cwd implies it: inside a work folder or
worktree (works/<work>/...) the work is inferred; inside repos/<repo>/... the repo is inferred.

Runtime discovery: --runtime <path>  ->  $MX_RUNTIME  ->  default ~/mx.
--porcelain emits stable JSON on reads; errors are {"error","code"} with a non-zero exit.
`;
