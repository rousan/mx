# mxbar — mx menubar / tray app

A tiny **cross-platform** (macOS, Windows, Linux) menubar/tray app that lists
your **active mx works**. Click the tray icon and a small popover shows the
**count** of active works and each one's **name** and **path**; hover a row to
**reveal it in your file manager** or **copy its path**.

It's a read-only viewer: it reads the runtime's `works/*/work.json` files
directly (no dependency on the `mx` binary or your shell `PATH`) and refreshes
each time the popover opens.

Built with **Tauri v2** (Rust shell) and a **React + Vite + Tailwind** popover,
so it ships as a small native app on all three desktops.

## Install (prebuilt)

Each mx release attaches desktop installers — grab yours from the
[latest release](https://github.com/rousan/mx/releases/latest):

- **macOS** — `mxbar_*_universal.dmg` (Apple Silicon + Intel)
- **Windows** — `mxbar_*_x64-setup.exe` / `.msi`
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

macOS builds are currently unsigned, so on first launch: right-click the app ▸
**Open**, then confirm. Add it as a login item to keep it around.

## Build from source

Requirements: **Node 18+**, **pnpm**, and the **Rust toolchain**
([rustup](https://rustup.rs)). On Linux also install the Tauri system deps
(`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, …).

```bash
pnpm install
cd apps/menubar
pnpm tauri build      # produces installers under src-tauri/target/release/bundle
# or run it live during development:
pnpm tauri dev
```

## Which runtime it reads

It resolves the runtime the same way the CLI does, minus the `--runtime` flag:
the `MX_RUNTIME` environment variable if set (usually not visible to a GUI app),
otherwise the default `~/mx`. If no runtime is found, the popover says so and
points you at `mx init`.

## Notes & next steps

- The popover arrow is tuned for the macOS menubar (top). On Windows/Linux the
  tray usually sits at the bottom; the app still works, the arrow alignment is a
  future refinement.
- v1 is intentionally minimal (count + name + path). Natural next steps:
  per-work worktrees/branches, clickable `localhost` ports, open-in-editor and
  Mission Control actions, a runtime picker, and a login-item toggle.
