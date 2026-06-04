<!-- Installed by the mx CLI. Don't hand-edit this file in the runtime —
     edit templates/CLAUDE.md in the mx source repo and run `mx update`. -->

# mx — multiplexed parallel work across repos

**mx** ("multiplexer") is a system for running several features in parallel across shared repos,
using git worktrees. You are running inside an mx runtime. Read this fully before acting — the
rules here are not optional.

## The one idea that governs everything

**`mx` owns all runtime state.** The work manifest (`work.json`) and the VS Code workspace file
are managed *only* through `mx` commands. You **never** hand-edit `work.json` or the
`.code-workspace`, and you **never** create or remove worktrees with raw `git`. Whenever you need
to read or change the work — its repos, branches, ports — you call an `mx` command. Treat
`work.json` as read-only build output: look at it for orientation, but mutate it through `mx`.

Every read command takes `--porcelain` for stable JSON; parse that instead of scraping text.

## What this runtime is for

`mx/` is where **feature work** happens. Sessions launched here implement a feature inside a
`works/<feature>/` folder. mx *itself* — this template, the `mx` CLI — is maintained in a separate
**mx source checkout** (the `github.com/roulabs/mx` repo), outside this tree. If you were opened
here to change how mx works, you're in the wrong place: switch to that repo. Don't edit `repos/`,
`works/`, or the runtime files from here.

## Layout

```
mx/
├── CLAUDE.md               # this file (installed by the mx CLI)
├── .mx-root                # empty marker: "this is the mx root"
├── repos/                  # PRISTINE reference clones, each on its default branch
│   ├── repo-a/
│   └── repo-b/
└── works/                  # one folder per feature/work
    └── feature-a/
        ├── work.json       # manifest — owned by `mx`, do not hand-edit
        ├── feature-a.code-workspace
        ├── repo-a/         # worktree of repo-a on this feature's branch
        └── repo-b/         # worktree of repo-b on this feature's branch
```

- `repos/<repo>` are **source-of-truth clones** — read-only reference. Worktrees fork from them
  and share their `.git` object store. Never edit, commit, or run dev servers in `repos/`.
- `works/<feature>/<repo>` are **worktrees**, each on its own feature branch. All work happens here.

## work.json (per-work manifest, owned by mx)

```json
{
  "name": "feature-a",
  "description": "Add a chatbox to the answer panel",
  "worktrees": [
    { "repo": "repo-a", "branch": "feature-a", "ports": { "web": 3000, "api": 3001 } },
    { "repo": "repo-b", "branch": "feature-a", "ports": { "worker": 3002 } }
  ]
}
```

- One worktree per repo. `ports` is a `service -> port` map local to that worktree.
- The work's `name` is immutable. There is no port-block concept — each port is allocated
  individually and is unique across **all** works.

## Orient yourself at the start of every session

1. You are launched from a **work folder** (`works/<feature>/`), not a single repo. There is no "main repo."
2. Read the work's state with `mx work -n <feature> info --porcelain` to learn its repos, branches, and ports.
3. When you edit a repo's worktree, follow that repo's own `CLAUDE.md`, linters, and conventions —
   its instructions live inside the worktree and apply.
4. The work root is **not** a git repo. Run build/test/git commands from inside the relevant worktree.
5. If several sessions share one work, the user gives each a lane (usually one repo). Stay in your lane.

## How to do things (always via mx)

You are launched from the work folder, so you can **omit `-n <feature>`** — mx infers the work from
your cwd (and the repo, when you're inside a worktree). The commands below show `-n <feature>` for
clarity; dropping it works while you're inside the work.

- **See the work:** `mx work info --porcelain` (or `mx work -n <feature> info --porcelain`)
- **Add a repo to the work (needs a worktree):** if a repo you need has no worktree yet, **stop and
  ask the user.** Only when they say so, run:
  ```
  mx work -n <feature> worktree add <repo> [--branch <b>] [--base <ref>]
  ```
  This creates the worktree from the pristine clone, registers it in `work.json`, and adds it to the
  workspace — all at once. Never run `git worktree add` yourself.
  - `--branch <b>` is the **new** branch to create (defaults to the work name; if it already exists, it's reused).
  - `--base <ref>` is where to **fork from** — any ref. A bare branch name (e.g. `main`,
    `migration-to-mt-service-from-cf`) resolves to that local branch or, failing that, `origin/<name>`.
    Run `mx repo -n <repo> fetch` first if you want the base at its latest upstream commit. Omit
    `--base` to fork from the pristine clone's current HEAD.
- **Allocate a port:** `mx work -n <feature> port set <repo> <service>` returns a free port (unique
  across all works). This only records the port in `work.json` — **you** must then wire that port
  into the repo's own env/config (`.env`, `PORT=`, etc.) and remap any outbound URL to a sibling
  service to its allocated port too. Release with `port unset`.
- **Tear down (user-initiated, after merge):** `mx work -n <feature> destroy` removes the worktrees
  and the work folder but **keeps the branches**. It refuses if any worktree has uncommitted changes.

## Hard rules

1. **Never edit, stage, commit, or run dev servers inside `repos/`.** Those clones are read-only base for worktrees.
2. **Never hand-edit `work.json` or the `.code-workspace`.** Change them only through `mx` commands.
3. **Never create or remove worktrees with raw `git`.** Use `mx work ... worktree add/rm`.
4. **Creating a worktree requires the user in the loop** — only when they explicitly tell you to in this session.
5. **Don't destroy anything unless asked.** Worktrees stay until the user confirms the feature is merged.
   Teardown keeps feature branches; never delete them.

## The one rule that matters most

`repos/` is read-only reference; real work lives in worktrees under `works/<feature>/`; and `mx`
owns the manifest. If a repo you need has no worktree yet, ask before adding one — then add it with `mx`.
