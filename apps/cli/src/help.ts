/**
 * Full help text shown for `mx help`, `mx --help`, or a bare `mx` invocation.
 */
export const HELP = `mx — control panel for the mx runtime

Global:
  mx init [path]                         scaffold/adopt a runtime (default ~/mx)
  mx status [--porcelain]                show runtime, repos, works, ports
  mx update                              re-stamp runtime CLAUDE.md from templates
  mx help | version

Repos (pristine clones):
  mx repo add <git-url> [--name <n>]     clone a repo into the runtime
  mx repo ls [--porcelain]
  mx repo -n <name> fetch                git fetch (+ ff current branch)
  mx repo -n <name> info [--porcelain]
  mx repo -n <name> rm                   refuses if any work uses it

Works (features):
  mx work new <name> [--description <t>]
  mx work ls [--porcelain]
  mx work -n <name> info [--porcelain]
  mx work -n <name> path                 print the work folder path (cd "$(mx work -n <name> path)")
  mx work -n <name> describe <text>
  mx work -n <name> worktree add <repo> [--branch <b>] [--base <ref>]
  mx work -n <name> worktree ls [--porcelain]
  mx work -n <name> worktree rm <repo>   refuses on uncommitted changes; keeps branch
  mx work -n <name> port set <repo> <service> [<port>]   auto-picks a free port if omitted
  mx work -n <name> port unset <repo> <service>
  mx work -n <name> port ls [--porcelain]
  mx work -n <name> destroy              removes worktrees + folder; keeps branches

The -n <name> selector may be omitted when your cwd implies it: inside a work folder or
worktree (works/<work>/...) the work is inferred; inside repos/<repo>/... the repo is inferred.

Runtime discovery: --runtime <path>  ->  $MX_RUNTIME  ->  .mx-runtime file.
--porcelain emits stable JSON on reads; errors are {"error","code"} with a non-zero exit.
`;
