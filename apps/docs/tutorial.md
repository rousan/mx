# Tutorial: your first parallel features

This walkthrough takes you all the way through a realistic day with mx: you'll set up a runtime, run one feature that spans two repos, then start a **second feature in parallel** without either one colliding — and finally park a feature and pick it back up.

We'll use two example repos, `web` and `api`, and two features, `search-filters` and `dark-mode`. Substitute your own as you go.

## 1. Install and initialize

```bash
npm i -g @rousan/mx
mx init
```

`mx init` creates the runtime at `~/mx` — one folder that will hold everything.

## 2. Add your repos

Clone each repo into the runtime **once**. These clones are pristine, read-only references that your worktrees fork from.

```bash
mx repo add git@github.com:acme/web.git
mx repo add git@github.com:acme/api.git
mx repo ls
```

## 3. Start a feature that spans both repos

Your `search-filters` feature needs changes in both `web` and `api`. Create one **work** that holds a worktree of each:

```bash
mx work new search-filters web api
```

This makes a work folder, a branch (`search-filters`) and worktree in each repo at `works/search-filters/wt/web` and `.../wt/api`, and an editor workspace you can open. A single agent session can now edit across both repos.

Look at what you've got:

```bash
mx work -n search-filters info --porcelain
```

## 4. Give it ports and run it

Allocate ports for the services this feature runs. Each port is unique across the whole runtime:

```bash
mx work -n search-filters port set web web     # -> e.g. :3002
mx work -n search-filters port set api  api     # -> e.g. :4002
```

mx records the ports; you wire them into each repo's own config (`.env`, `PORT=`, and any outbound URL from `web` to `api`). Then start your dev servers inside the worktrees as usual:

```bash
cd "$(mx work -n search-filters path)/wt/web" && pnpm dev   # runs on :3002
```

## 5. Start a second feature — in parallel

An urgent `dark-mode` task lands. You don't touch `search-filters` at all — it stays exactly as you left it, servers and all. Just create another work:

```bash
mx work new dark-mode web
mx work -n dark-mode port set web web           # -> e.g. :3004, no clash
```

Now **two copies of `web` run at once** — `search-filters` on `:3002`, `dark-mode` on `:3004` — each with its own worktree, branch, and (optionally) its own coding-agent session. Switching between them is instant; nothing to stash, reinstall, or restart.

## 6. See the whole fleet

```bash
mx mission-control      # alias: mx mc
```

This opens a live, read-only dashboard: every work, its services and ports, live `localhost` URLs, and health — the whole board at a glance.

## 7. Park a feature, resume later

`dark-mode` shipped. **Archive** it to free its ports and worktrees while keeping the branch and any notes:

```bash
mx work -n dark-mode archive
```

Weeks later it needs a follow-up. Bring it all back:

```bash
mx work -n dark-mode unarchive
```

The worktrees are re-created from the manifest and you're back where you left off.

## What you learned

- A **work** is one feature; it can span **many repos**, one worktree each.
- **Ports** are allocated per feature, unique across the runtime — so the same app runs many times side by side.
- Features are fully **isolated**, so you run several in **parallel** and switch instantly.
- The **lifecycle** (archive / unarchive) lets you park and resume without losing anything.

## Where to go next

- **[Works & worktrees](/guides/works-and-worktrees)** — everything you can do with works.
- **[Ports](/guides/ports)** — allocation, wiring, and running multiple instances.
- **[Hooks & hydration](/guides/hooks)** — make a fresh worktree ready to run automatically.
- **[Coding agents](/guides/coding-agents)** — run a Claude Code / Cursor session per feature.
