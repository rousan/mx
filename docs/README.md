# mx documentation

This folder holds in-depth docs for the mx source repo. The root `CLAUDE.md` is the auto-loaded entry point for a Claude session; this folder is for the things that would have made `CLAUDE.md` bloated to embed inline.

If you're new to mx, read in this order:

1. [overview](overview.md) — what mx is, the core mental model, who uses it
2. [architecture](architecture.md) — the monorepo layout, `@mx/core` ↔ `@mx/cli` ↔ `npm/`, how the build flows
3. [runtime-model](runtime-model.md) — what a runtime looks like on disk; `work.json`, `INDEX.json`, sessions, and the contracts mx owns
4. [commands](commands.md) — every CLI command, with flags, semantics, and examples
5. [development](development.md) — dev setup, testing patterns, the `.mx/` sandbox convention
6. [self-hosting](self-hosting.md) — using mx to develop mx (the dogfooding setup)
7. [release](release.md) — the `pnpm release` runbook, every gotcha caught the hard way
8. [history](history.md) — version timeline, what each release brought

The root `CLAUDE.md` references this folder; future Claude sessions are expected to dig into the relevant file when working on a given area.
