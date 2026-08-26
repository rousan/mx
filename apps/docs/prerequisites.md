# Prerequisites

mx runs each feature inside a tmux session with your coding agent and editor already laid out — see **[The tmux workflow](/guides/tmux)**. To get that experience, a handful of tools need to be on your machine. This page lists them and gives copy-pasteable install commands for macOS and Linux.

mx supports **macOS and Linux**. Windows is not officially supported.

::: tip Let mx check for you
You don't have to audit this by hand. Run **`mx doctor`** and it tells you exactly what's missing and the command to install it. See [mx doctor](#mx-doctor) below.
:::

## What mx needs

**Required** — the tmux workflow depends on these:

- **tmux** (>= 3.0) — the session that holds each work.
- **neovim** — the editor mx opens in the `main` window.
- **claude** — the Claude Code CLI, the agent in each work's session.
- **git** — the version control everything is built on.

**Recommended toolbelt** — not required, but the workflow is much nicer with them:

- **ripgrep** (`rg`), **fd**, **fzf** — fast search and fuzzy-finding.
- **bat** — syntax-highlighted `cat`.
- **lazygit** — a terminal git UI.
- **eza** — a modern `ls`.
- **zoxide** — smarter `cd`.

## macOS

Install the tools with [Homebrew](https://brew.sh):

```bash
brew install tmux neovim fd fzf bat lazygit eza zoxide ripgrep
```

And a Nerd Font, so icons in neovim and the toolbelt render correctly:

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

Set that font in your terminal emulator's preferences after installing it.

## Linux

On **Debian / Ubuntu**, the core tools come from `apt`:

```bash
sudo apt install tmux neovim ripgrep fd-find fzf bat
```

::: warning Debian package-name quirks
On Debian, `fd` is installed as `fdfind` and `bat` as `batcat` — alias them (or symlink them) to `fd` and `bat` if a tool expects those names. **eza** and **lazygit** aren't in the base repositories; install them from their own apt repository or a GitHub release.
:::

Other distributions are supported too — install the same set with your package manager:

- **Fedora**: `sudo dnf install ...`
- **Arch**: `sudo pacman -S ...`

The exact package names differ per distribution. Rather than memorize them, run `mx doctor` — it detects your package manager and prints the right command for your system.

Install a Nerd Font (for example JetBrains Mono Nerd Font) from the [Nerd Fonts releases](https://www.nerdfonts.com/font-downloads) and select it in your terminal.

## Editor and tmux config

mx does **not** ship a tmux or neovim configuration — you bring your own. The workflow assumes:

- **tmux >= 3.0**.
- A **modern neovim setup** — a distribution like [LazyVim](https://www.lazyvim.org), or your own equivalent config.

If you already have configs you like, mx slots into them; it only drives sessions, windows, and panes, and never rewrites your dotfiles.

## mx doctor

`mx doctor` checks the workflow's dependencies and reports what's present and what's missing:

```bash
mx doctor
```

For anything missing, it prints the **exact install command** for your system — the right package manager (`brew`, `apt`, `dnf`, `pacman`) and the right package names. To have it run that command for you:

```bash
mx doctor --install          # install the missing tools
mx doctor --install --yes    # ...without the confirmation prompt
```

Run `mx doctor` once on a new machine and follow its guidance — it's the fastest way to get set up.

## Next steps

- **[Getting started](/getting-started)** — install mx and create your first work.
- **[The tmux workflow](/guides/tmux)** — how the session, layout, and `attach`/`open` fit together.
