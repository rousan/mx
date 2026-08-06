# Configuration

mx is deliberately low-config. There's no config file to maintain — the runtime *is* the configuration. This page covers the few knobs that exist: where the runtime lives, and how versioning works.

## Finding the runtime

Every command resolves which runtime to act on, in this order:

1. The **`--runtime <path>`** flag.
2. The **`$MX_RUNTIME`** environment variable.
3. The default **`~/mx`**.

No pointer file is written anywhere. To use a runtime somewhere other than `~/mx`, set `$MX_RUNTIME` once in your shell profile:

```bash
export MX_RUNTIME="$HOME/work/mx"
```

## Multiple runtimes

Because the location is env-addressed, you can keep several runtimes and switch between them just by changing `$MX_RUNTIME` (or passing `--runtime`). For example, a productive runtime at `~/mx` and a throwaway sandbox at `/tmp/mx-sbx`:

```bash
MX_RUNTIME=/tmp/mx-sbx mx init
MX_RUNTIME=/tmp/mx-sbx mx info
```

A tool like `direnv` can auto-set `MX_RUNTIME` when you `cd` into a particular project tree, so the right runtime is always selected without thinking about it.

## Runtime versioning

A runtime carries a layout version in `<runtime>/mx.json`. The `mx` CLI supports exactly one runtime version (its major). Every runtime command first checks that they match.

If the CLI and runtime versions don't match, runtime commands refuse with `RUNTIME_VERSION_MISMATCH`, and only these are allowed: `mx migrate`, `mx update`, `mx help`, `mx version`.

## `sync` vs `update` vs `migrate`

These three are distinct — don't confuse them:

- **`mx sync`** re-stamps mx-owned runtime files (the runtime `CLAUDE.md`, hook stubs, standard folders) with the current version. Its contract is strictly **non-destructive** — your data (`work.json`, worktrees, context, hook bodies) is never touched. Same-major, version-gated.
- **`mx update`** self-updates the **CLI** within its major (`npm i -g @rousan/mx@^<major>`), suggests a deliberate major upgrade if one exists, and after a successful update automatically runs `mx sync`. Not version-gated.
- **`mx migrate`** upgrades an **older runtime** up to the version this CLI supports — the only runtime command allowed on a version mismatch. It validates the whole migration chain before mutating anything; `--dry-run` previews the plan.

::: tip Upgrading, in short
Newer mx version available? Run `mx update` (bumps the CLI and syncs). Hit `RUNTIME_VERSION_MISMATCH` after a major upgrade? Run `mx migrate`.
:::

## The files store

`<runtime>/files/` is a free-form, **local** store for operational values every work might need — credentials, cluster names, tokens, endpoints. mx creates it empty and never reads, writes, or transmits its contents; the layout is entirely yours. Read from it in hooks or scripts via `$MX_RUNTIME/files/…`.

::: warning Local only
The runtime is not a git repo and mx never commits or transmits `files/`. Storing secrets there is a deliberate local convenience — treat the machine accordingly, and never copy `files/` into a repo that gets committed.
:::
