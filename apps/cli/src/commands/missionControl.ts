import { createServer, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, watch, type FSWatcher } from 'node:fs';
import {
  requireRuntime,
  listRepoHealth,
  listWorkHealth,
  reposDir,
  worksDir,
  mxConfigFile,
  MxError,
} from '@mx/core';
import { missionControlHtml, cliVersion } from '../paths';
import { emit, dim, bold, check } from '../output';
import type { Flags } from '../args';

/**
 * Default port the mission-control server binds to. If taken, the server walks
 * upward to the next free port (mirroring how mx allocates feature ports).
 */
const DEFAULT_PORT = 7777;

/**
 * Recompute interval for the live SSE stream. A health snapshot runs a few git
 * commands per repo, so a couple of seconds keeps it "realtime-ish" without
 * hammering git; manifest edits push instantly via `fs.watch` on top of this.
 */
const TICK_MS = 2500;

/**
 * Build the full mission-control state payload from the runtime: repo health,
 * work health (including archived), and a small header summary. This is the one
 * shape the UI consumes, served both as a one-shot (`/api/state`) and over the
 * live stream (`/api/stream`).
 *
 * @param root - Runtime root.
 * @returns The serializable dashboard state.
 */
function buildState(root: string): Record<string, unknown> {
  const repos = listRepoHealth(root);
  const works = listWorkHealth(root, { includeArchived: true });
  return {
    runtime: root,
    version: cliVersion(),
    generatedAt: new Date().toISOString(),
    counts: {
      repos: repos.length,
      activeWorks: works.filter((w) => !w.archived).length,
      archivedWorks: works.filter((w) => w.archived).length,
    },
    repos,
    works,
  };
}

/**
 * Best-effort browser open of the dashboard URL (macOS `open`). Never throws —
 * a failure just means the user opens the printed URL themselves.
 *
 * @param url - The dashboard URL.
 */
function openBrowser(url: string): void {
  if (process.platform !== 'darwin') return;
  try {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // ignored — the URL is printed regardless.
  }
}

/**
 * Handle `mx mission-control` (alias `mx mc`): start a local, zero-dependency
 * web dashboard for the runtime. Serves a single self-contained HTML page and a
 * JSON API; the page subscribes to `/api/stream` (Server-Sent Events) for a
 * live, calm overview of every repo's and work's health and ports. Read-only.
 *
 * The server blocks until interrupted (Ctrl-C). `--port` picks the starting
 * port (default 7777, walking up if busy); `-o`/`--open` opens the browser.
 *
 * @param _positionals - Positional args (unused; the command takes no subcommand).
 * @param flags - Parsed flags (`--port`, `--open`).
 */
export function dispatchMissionControl(_positionals: string[], flags: Flags): void {
  const root = requireRuntime({ runtime: flags.runtime });
  const htmlPath = missionControlHtml();
  if (!existsSync(htmlPath)) {
    throw new MxError(
      `mission-control UI bundle not found at ${htmlPath} — run \`pnpm build\` (dev) or reinstall mx.`,
      'NO_BUNDLE',
    );
  }
  const html = readFileSync(htmlPath, 'utf8');

  // Connected SSE clients. Each gets every broadcast until it disconnects.
  const clients = new Set<ServerResponse>();

  /**
   * Recompute the state and push it to every connected SSE client. Skips work
   * when nobody is listening, and swallows transient read errors (e.g. a
   * half-written work.json caught mid-edit) so the stream never dies.
   */
  const pushAll = (): void => {
    if (clients.size === 0) return;
    let payload: string;
    try {
      payload = JSON.stringify(buildState(root));
    } catch {
      return;
    }
    for (const res of clients) res.write(`data: ${payload}\n\n`);
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === '/api/state') {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buildState(root)));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }

    if (url === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // Prime the connection so EventSource fires `open` and renders immediately.
      try {
        res.write(`data: ${JSON.stringify(buildState(root))}\n\n`);
      } catch {
        // first paint failed; the periodic tick will retry.
      }
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  // Periodic refresh keeps git-derived health (ahead/behind, last fetched) fresh.
  const tick = setInterval(pushAll, TICK_MS);
  tick.unref();

  // Instant push when a manifest changes (port allocated, work archived, etc.).
  // Debounced so a burst of writes collapses into one recompute.
  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onChange = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(pushAll, 300);
  };
  const watchers: FSWatcher[] = [];
  for (const dir of [worksDir(root), reposDir(root), mxConfigFile(root)]) {
    try {
      watchers.push(watch(dir, { recursive: true }, onChange));
    } catch {
      // Watching is best-effort; the periodic tick still refreshes.
    }
  }

  listenFrom(server, flags.port ?? DEFAULT_PORT, (port) => {
    const url = `http://localhost:${port}`;
    emit(() => {
      console.log(`${check()} mx mission control ${dim('(read-only, live)')}`);
      console.log(`  ${bold(url)}`);
      console.log(`  ${dim(`runtime: ${root}`)}`);
      console.log(`  ${dim('streaming updates — press Ctrl-C to stop')}`);
    }, { url, port, runtime: root });
    if (flags.open) openBrowser(url);
  });
}

/**
 * Bind the server to the first free port at or above `start`, walking upward on
 * `EADDRINUSE` (up to a small cap) so a stale server on the default port doesn't
 * block startup. Calls `onReady` with the port actually bound.
 *
 * @param server - The HTTP server to listen with.
 * @param start - First port to try.
 * @param onReady - Called once listening, with the bound port.
 */
function listenFrom(
  server: ReturnType<typeof createServer>,
  start: number,
  onReady: (port: number) => void,
): void {
  let port = start;
  const MAX_TRIES = 20;
  let tries = 0;
  const attempt = (): void => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && tries < MAX_TRIES) {
        tries += 1;
        port += 1;
        attempt();
        return;
      }
      throw new MxError(`could not start mission-control server: ${err.message}`, 'SERVE_FAILED');
    });
    server.listen(port, () => onReady(port));
  };
  attempt();
}
