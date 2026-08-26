# The tmux workflow

mx runs each feature inside its own terminal world. The model is one line long:

> **Every active work maps to exactly one tmux session, named `mx/<work>`.**

Enter a work and you attach to its session; leave and it keeps running; archive or destroy the work and mx tears the session down with it. Your coding agent, your editor, and your dev-server shells all live inside that one session, seeded with the work's context. This guide covers the whole workflow: the default layout, `attach` vs `open`, entering and leaving, self-healing, growing the session, customizing it, and how the Claude session resumes.

::: tip Prerequisites
The tmux workflow needs a few tools on your machine — tmux, neovim, the Claude Code CLI, and git — plus an optional toolbelt. See **[Prerequisites](/prerequisites)** for the install commands, and run `mx doctor` to check what's missing. mx supports macOS and Linux; Windows is not officially supported.
:::

## One work, one session

The `mx/` prefix in the session name is deliberate: it groups all of mx's sessions together in `tmux ls`, and mx additionally marks each one with a tmux `@mx_work` option so its own tooling can find them. So while you're running a fleet of features, `tmux ls` shows them as a tidy family:

```
mx/feature-a: 2 windows (created ...)
mx/feature-b: 2 windows (created ...)
mx/feature-c: 2 windows (created ...)
```

Each is completely independent — its own windows, its own panes, its own agent conversation.

## The default layout

When mx builds a work's session, it lays out two windows:

- **`main`** — split into two panes:
  - **left**: the work's **Claude Code session** (focus starts here),
  - **right**: `nvim .` opened at the **work root**, so every worktree under `wt/` is visible in one editor.
- **`run`** — a **2×2 tiled grid** of plain shells, for dev servers and ad-hoc commands.

Every pane is seeded with the work's context as environment variables, so any shell already knows where it is:

| Variable | What it holds |
| --- | --- |
| `MX_WORK` | the work name |
| `MX_WORK_PATH` | absolute path to the work folder |
| `MX_RUNTIME` | absolute path to the runtime |
| `MX_TMUX` | set to `1` inside an mx-built session |
| `MX_CLAUDE_SESSION_ID` | the resumed session id when resuming; empty on a fresh create |
| `MX_PORT_<worktree>_<service>` | one per allocated port (non-alphanumerics in the names become `_`, so worktree `repo-a` service `web` → `MX_PORT_repo_a_web`) |

The per-port variables mean a dev server can read its own port straight from the environment — no need to look it up.

## `attach` vs `open`

There are two ways in. Both build the session on demand if it doesn't exist yet, then get you into it.

```bash
mx work -n feature-a attach     # attach THIS terminal to the session
mx work -n feature-a open       # open a NEW terminal window on the session
```

- **`attach`** is the primary way to enter a work. It attaches your **current** terminal to the session — using tmux `switch-client` when you're already inside tmux, or `attach-session` otherwise. Pass `--prompt <text>` to seed the agent's first message (see [The Claude session](#the-claude-session-resumes)).
- **`open`** (alias `-o`, also `mx work new -o` and `mx repo new --quick -o`) does the same build, but opens the session in a **new terminal window**:
  - **macOS**: a fullscreen Terminal.
  - **Linux**: it uses `$MX_TERMINAL` if set (a command template containing `{cmd}`), otherwise the first available of `x-terminal-emulator`, `kitty`, `wezterm`, `alacritty`, `gnome-terminal`, `konsole`, `xterm`. If it can't launch a terminal, it falls back to printing the `mx work attach` line for you to run yourself.

To ensure the session exists **without** attaching — handy in scripts — use `mx work -n feature-a attach --porcelain`, which builds if needed and prints JSON.

::: tip mx owns the worktrees and the session
mx intentionally does **not** use Claude Code's own `--tmux` / `--worktree` flags. mx owns the worktrees and the session itself, so it drives tmux directly rather than letting the agent do it.
:::

## A worked example

Say you just created `feature-a`:

```bash
mx work new feature-a repo-a -o
```

That builds the `mx/feature-a` session and opens it in a new terminal. You land in the `main` window with focus on the Claude pane, ready to talk to the agent; `nvim` sits to the right showing `wt/repo-a`. Switch to the `run` window (your tmux prefix + `2` by default) to start the dev server in one of the four shells:

```bash
cd wt/repo-a && pnpm dev        # the port is in $MX_PORT_repo_a_web
```

When you want to step away, **detach** — your tmux prefix followed by `d`. Everything keeps running: the agent, the editor, the dev server. Later, drop back in from anywhere:

```bash
mx work -n feature-a attach
```

You're returned to the same session, same conversation, same running servers.

## Entering and leaving

- **Detach** (tmux prefix + `d`) leaves the session **running** in the background. This is how you switch features: detach one, `attach` another. Nothing is lost.
- **Archive** (`mx work -n feature-a archive`) frees the worktrees **and kills the session**. It warns first if a pane still holds a live foreground process — a dev server, a running `claude` — so you don't lose in-flight work by accident.
- **Destroy** (`mx work -n feature-a destroy`) removes the work folder and **kills the session** too. Branches are still kept.

Only archive and destroy tear the session down. Detaching never does.

## Self-healing

Building the session is **lazy and self-healing**. mx never assumes the session is already there — it checks, and rebuilds the layout if it isn't. So after a reboot, or after a manual `tmux kill-session -t mx/feature-a`, the next command just brings it back:

```bash
mx work -n feature-a attach     # session gone? rebuilt, then attached
```

You never have to think about the session's lifetime. If it's missing when you need it, `attach` (or `open`) recreates it from scratch.

## Adding your own terminals

Need more shells for a work — a log tail, a REPL, a second server? Don't reach for a separate terminal app. Just create tmux **windows or panes** inside the work's session (your tmux prefix + `c` for a new window, or split the current pane). They live in the session, share its seeded environment, and go away with it when you archive. The session is the boundary for everything a feature needs.

## Customizing the layout: the `work-session` hook

The default layout suits most work, but it's only a default. To reshape it, add the central **`work-session`** hook at `<runtime>/hooks/work-session`. It fires **after** mx builds a work's session, with the work folder as the working directory, so it can rearrange or extend what mx just set up — add a window per repo worktree, start a dev server, swap the editor, rename panes.

Its environment includes the usual `MX_WORK` and `MX_WORK_PATH`, plus two that are specific to this hook:

- **`MX_TMUX_SESSION`** — the session name, i.e. your tmux target (`mx/<work>`),
- **`MX_CLAUDE_SESSION_ID`** — the resumed session id (empty on a fresh create).

It's post-style: a non-zero exit only **warns**, it never fails the build. Delete the file to keep mx's default layout.

```bash
#!/usr/bin/env bash
# <runtime>/hooks/work-session   (cwd = the work folder)
set -euo pipefail

# Add one dedicated window per worktree under wt/, each cd'd into it.
for dir in wt/*/; do
  name="$(basename "$dir")"
  tmux new-window -t "$MX_TMUX_SESSION" -n "$name" -c "$MX_WORK_PATH/$dir"
done
```

Because the hook is runtime-wide (it fires for every work), branch on `$MX_WORK` inside if you want per-work behavior.

::: tip Two different session hooks
Don't confuse the two. **`work-session`** shapes the tmux **layout** after the session is built. **`session-prompt`** seeds the **first** Claude session's initial prompt, and only on create. See **[Hooks & hydration](/guides/hooks)**.
:::

## The Claude session resumes

The Claude Code session is keyed to the **work name**, so you always continue the **same** conversation. One name per work:

- **Existing session for the work** → mx runs `claude --resume <work>`. Claude Code resolves `--resume` by session title, so this reattaches the work's conversation by name — covering both a session created by this flow *and* any older one (the pre-tmux `mx work open`, or a `claude` you ran in the folder yourself), since those are named after the work too. In the rare case of two sessions sharing the name, Claude Code shows its picker.
- **No session yet** → mx runs `claude -n <work>`, naming the new session after the work (Claude assigns the id), seeded by the `session-prompt` hook (or `--prompt`).

This is why detaching and re-attaching feels seamless: it's the same session, resumed by name.

## tmux-resurrect

If you use [tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) (with [tmux-continuum](https://github.com/tmux-plugins/tmux-continuum)) to persist and restore sessions across reboots, mx works need **no special setup** — they save and restore like any other session, so a work's **custom** window/pane layout survives a reboot. That's the whole point: mx's own rebuild only knows the default layout, but resurrect remembers whatever you grew the session into.

Resurrect restores the layout and each pane's working directory; it doesn't relaunch programs unless you list them (e.g. `set -g @resurrect-processes 'nvim'`). Claude and dev servers generally shouldn't auto-restart anyway — the **structure** is what you want back, and `mx work attach` drops you into it.

The one thing to clean up: resurrect's last save may still contain a session for a work you **archived or destroyed** after that save. On the next reboot it gets restored — a live session for a dead work (its worktrees are gone). Prune those with:

```bash
mx work gc
```

See [Housekeeping](#housekeeping-switch-and-gc) below.

## Housekeeping: `switch` and `gc`

Two commands help you live with a fleet of sessions.

**`mx work switch`** — jump between works. With a name it's just `attach`; with no argument it opens an **fzf picker** over this runtime's live `mx/*` sessions and switches to the one you choose:

```bash
mx work switch            # pick from a list
mx work switch feature-b  # jump straight to feature-b
```

**`mx work gc`** — prune **orphaned** sessions: live `mx/<work>` sessions whose work is archived or no longer exists (the reboot-restore case above, or a session left behind if something went sideways). It kills only sessions that belong to **this** runtime, warns if a pane holds a live process, and asks before killing (`--yes` to skip):

```bash
mx work gc                # review and confirm what gets pruned
```

Active works with a live session are healthy and never touched, and neither are sessions belonging to a different runtime that happens to share your tmux server.

## Open your whole fleet (macOS)

On macOS you don't have to attach works one at a time. mx ships a bin, `mx-open-all`, that opens **one fullscreen Terminal.app window with a tab per work**, each tab running `mx work attach`:

```bash
mx-open-all                    # every active work, one tab each
mx-open-all feature-a feature-b  # just the named works
```

Named works are validated against the active set — an archived, destroyed, or unknown name is ignored (never opened), so every tab is a live work. It needs the runtime `bin/` on your `PATH`:

```bash
export PATH="$(mx bin path):$PATH"    # add to your shell rc
```

Terminal.app only. Closing the window detaches every tab (the sessions keep running); reopen the fleet any time.

## Related

- **[Prerequisites](/prerequisites)** — install tmux, neovim, and the toolbelt; `mx doctor`.
- **[Coding agents](/guides/coding-agents)** — the agent that lives in the `main` window.
- **[Hooks & hydration](/guides/hooks)** — the `work-session` and `session-prompt` hooks.
- **[Archive & resume](/guides/lifecycle)** — archiving a work kills its session.
