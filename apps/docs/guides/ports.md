# Ports

When you run several features at once, their dev servers need different ports — otherwise you hit "address already in use." mx solves this by **allocating a port per service, unique across the entire runtime**. Two features running the same app never collide, so you can run the same app many times side by side.

## Allocate a port

```bash
mx work -n search-filters port set web web
```

The arguments are `<worktree> <service>`. mx picks a free port (unique across every work) and records it in the manifest. Pin a specific port by passing it explicitly:

```bash
mx work -n search-filters port set web web 3002
```

## Wire it into your app

`port set` only **records** the port — mx doesn't edit your app's config. You then wire that number into the repo's own environment, and remap any outbound URL to a sibling service to its allocated port too:

```bash
# in works/search-filters/wt/web/.env
PORT=3002
API_URL=http://localhost:4002    # api's allocated port for this same feature
```

## Run the same app many times

Because ports are unique per feature, the same app runs concurrently for several features:

```bash
mx work -n search-filters port set web web   # -> :3002
mx work -n dark-mode      port set web web   # -> :3004, no clash
```

Now `web` runs for `search-filters` on `:3002` and for `dark-mode` on `:3004` at the same time.

## List and release ports

```bash
mx work -n search-filters port ls
mx work -n search-filters port unset web web
```

## See who owns what

The **[mission control](/guides/mission-control)** dashboard shows a consolidated ports board — every port mapped to its service, worktree, work, and a clickable `localhost` URL — so you always know which feature owns which port.

## Related

- **[Hooks & hydration](/guides/hooks)** — allocate ports automatically when a worktree is created.
- **[Mission control](/guides/mission-control)** — the live ports board.
