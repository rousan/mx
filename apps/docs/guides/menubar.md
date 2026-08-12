# Menubar app

**mxbar** is a tiny cross-platform menubar/tray app that keeps your active works
one click away. Click the tray icon and a small popover shows the **count** of
active works and each one's **name** and **path** — hover a row to reveal it in
your file manager or copy its path.

It runs on **macOS, Windows, and Linux**, and it's a read-only viewer: it reads
the runtime's `works/*/work.json` files directly, so it never depends on the
`mx` binary or your shell `PATH`.

## Install

Every mx release attaches desktop installers. Grab yours from the
[latest release](https://github.com/rousan/mx/releases/latest):

| Platform | Download |
| --- | --- |
| **macOS** (Apple Silicon + Intel) | `mxbar_*_universal.dmg` |
| **Windows** | `mxbar_*_x64-setup.exe` or `.msi` |
| **Linux** | `.AppImage`, `.deb`, or `.rpm` |

::: tip macOS first launch
The macOS build is currently unsigned, so the first time: right-click the app ▸
**Open**, then confirm. After that it launches normally. Add it as a login item
(**System Settings ▸ General ▸ Login Items**) to keep it in your menubar.
:::

## What it shows

- The **number of active works** in the runtime.
- Each active work's **name** and **path** (archived works are hidden).
- Hover a row for **Reveal in file manager** and **Copy path**.

It refreshes each time you open the popover, so it always reflects the current
state — new works, removed works, and archived works.

## Which runtime it reads

The app resolves the runtime the same way the CLI does (minus the `--runtime`
flag): the `MX_RUNTIME` environment variable if set, otherwise the default
`~/mx`. If it can't find a runtime it says so and points you at `mx init`.

## Build from source

It lives in the mx repo under `apps/menubar` (Tauri + React). With Node, pnpm,
and the Rust toolchain installed:

```bash
pnpm install
cd apps/menubar
pnpm tauri build      # installers under src-tauri/target/release/bundle
# or, live during development:
pnpm tauri dev
```

## Related

- **[Mission control](/guides/mission-control)** — the fuller live dashboard and the macOS Spaces board.
- **[Works & worktrees](/guides/works-and-worktrees)** — what the app is listing.
