# mxbar — mx menubar app

A tiny macOS menubar app that lists your **active mx works**. Click the menubar
glyph and a small popover shows each active work with its **name** and **path**;
hover a row to **reveal it in Finder** or **copy its path**.

It's a read-only viewer: it reads the runtime's `works/*/work.json` files
directly (no dependency on the `mx` binary or your shell `PATH`) and refreshes
live as works are created or removed.

## Requirements

- macOS 13 (Ventura) or later
- The Swift toolchain — Xcode, or the Command Line Tools: `xcode-select --install`

## Build & run

```bash
cd apps/menubar
./build.sh
open build/mxbar.app
```

To keep it around, copy it to Applications and add it as a login item:

```bash
cp -R build/mxbar.app /Applications/
open /Applications/mxbar.app
```

Then: **System Settings ▸ General ▸ Login Items ▸ +** and add `mxbar.app`.

During development you can also run it straight from the package:

```bash
swift run
```

## Which runtime it reads

It resolves the runtime the same way the CLI does, minus the `--runtime` flag:

1. the `MXRuntimePath` user default, if set
   (`defaults write com.rousanali.mxbar MXRuntimePath ~/path/to/mx`)
2. the `MX_RUNTIME` environment variable (usually not visible to a GUI app)
3. the default `~/mx`

If no runtime is found, the popover says so and points you at `mx init`.

## Scope

This is v1 — intentionally minimal (active works, name + path). Natural next
steps: per-work worktrees/branches, clickable `localhost` ports, open-in-editor
and Mission Control actions, a runtime picker, and a proper login-item toggle
via `SMAppService`.
