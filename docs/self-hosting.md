# Self-hosting: developing mx with mx

You can dogfood mx by treating its source as just another repo in an mx runtime — running several parallel feature branches of mx itself the same way you'd run parallel features of any product.

## Setup

One-time, on your productive runtime:

```bash
mx repo add git@github.com:roulabs/mx.git
```

Per feature (repeat for as many parallel mx features as you want):

```bash
mx work new improve-mx-status-ui
mx work -n improve-mx-status-ui worktree add mx --branch improve-mx-status-ui
cd "$(mx work -n improve-mx-status-ui path)"/mx
pnpm install
pnpm build
```

Now the source lives at `<runtime>/works/improve-mx-status-ui/mx/` as its own worktree on its own branch. Each feature work is fully independent: own branch, own `.mx/` sandbox if testing, own commits, own pushes. Switch between them by `cd` — no mode to remember.

## The two-binary rule

There are two `mx` binaries available inside a self-hosted worktree, and they must be used for different things:

| binary | what it runs | use for |
|---|---|---|
| `mx` (on `$PATH`) | the **globally installed** `@roulabs/mx` — published version | productive runtime operations: `mx i`, `mx work archive feat`, etc. **Safe** against the productive runtime. |
| `pnpm mx ...` or `node npm/bin/mx.js ...` | the **locally-built** CLI from your in-progress code | **testing only** — must always be pointed at a sandbox runtime, never the productive one. |

## The strict rule

**The locally-built CLI never sees the productive runtime.** Before any test, set `$MX_RUNTIME` to a sandbox:

```bash
export MX_RUNTIME="$PWD/.mx"           # gitignored, per-worktree sandbox (recommended)
# or, for a fully throwaway one:
export MX_RUNTIME=/tmp/mx-sbx-$(date +%s)
```

If you forget and run `pnpm mx sync` (or any locally-built mx) without `$MX_RUNTIME` pointing at a sandbox, it would re-stamp the productive runtime's `CLAUDE.md` with whatever template version is currently in your branch — possibly a broken WIP one. **Always set `$MX_RUNTIME` first.**

## direnv (or shell function) for reflex-correct behaviour

If you spend significant time in this setup, automate `$MX_RUNTIME` so you don't have to remember:

**With direnv** — create `.envrc` in the worktree:

```bash
export MX_RUNTIME="$PWD/.mx"
```

`direnv allow` once; from then on, `cd`ing in/out of the worktree flips `$MX_RUNTIME` automatically.

**With a shell function** in your `~/.zshrc`:

```bash
# In `.zshrc`
function chpwd() {
  if [[ -f "$PWD/.mx-sandbox-here" ]]; then
    export MX_RUNTIME="$PWD/.mx"
  else
    export MX_RUNTIME="$HOME/mx"     # your productive runtime
  fi
}
```

Touch `.mx-sandbox-here` (gitignored) in each mx-feature worktree. Outside, `$MX_RUNTIME` stays at the productive runtime; inside, it's the sandbox.

## What the worktree sees

Inside `<runtime>/works/<feature>/mx/`, Claude Code walks up the directory tree looking for `CLAUDE.md` and finds **two**:

- The **source repo's** `CLAUDE.md` (this repo) — developer rules for working on mx (use pnpm, the build pipeline, etc.).
- The **runtime's** `CLAUDE.md` (stamped from `templates/CLAUDE.md`) — feature-session rules (never edit `repos/`, never hand-edit `work.json`, etc.).

Both load. They describe different layers and don't conflict — the source repo's `CLAUDE.md` is about working on mx; the runtime's is about working inside an mx runtime. The runtime CLAUDE.md template explicitly acknowledges the self-hosting case (after v1.11.0) and points back to the worktree's own developer rules.

## Caveats

- **Don't archive the work you're sitting in.** `mx work -n improve-mx archive` removes the worktree directory; your shell ends up in a deleted path. `cd` out first.
- **Releases land on whatever branch the worktree is on.** `pnpm release`'s `git push origin HEAD` pushes the current branch — which inside a feature worktree is the feature branch, not `main`. If you do an end-of-feature release, either: (a) merge the feature branch to `main` first and run release from a main worktree, or (b) explicitly push the feature branch to `main` with `git push origin <feature>:main` if it's a clean fast-forward.
- **Both `CLAUDE.md` files loading is informative, not redundant** — be aware that Claude sees both layers of rules.
- **The Vitest suite isolates itself in `/tmp/...`** regardless of where you run it from, so unit tests work the same in every feature work.
- **The build output lives in `npm/`** inside the worktree (gitignored). Different worktrees of mx don't share `node_modules` — each gets its own `pnpm install`.

## Releasing from a self-hosted setup

`pnpm release` runs the same script regardless of where the worktree lives. The script:

1. checks `npm whoami` (must be logged in)
2. checks the working tree is clean
3. checks the version in `npm/package.json` isn't already on npm
4. checks no `vX.Y.Z` tag exists locally or on origin
5. runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
6. shows a tarball preview
7. asks `Publish @roulabs/mx@X.Y.Z and tag vX.Y.Z? (y/N)`
8. on `y`: `npm publish --auth-type=web` from `npm/`, `git tag -a`, `git push origin HEAD`, `git push origin <tag>`

The `--auth-type=web` step opens a browser for confirmation (handles 2FA). The push step uses the **current branch** — see the caveat above about feature-branch vs main.

See [release](release.md) for the full release runbook.
