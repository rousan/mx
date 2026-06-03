import { MxError } from './errors';
import { listWorkNames, readWork, writeWork, findWorktree } from './runtime';

/**
 * Base port from which automatic allocation scans upward for the first free
 * port across all works.
 */
const PORT_BASE = 3000;

/**
 * Identifies one (work, repo, service) port slot, used to exclude a slot from
 * the "already allocated" set so re-setting the same service is idempotent.
 */
export interface PortSlot {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Service name. */
  service: string;
}

/**
 * Collect every port allocated across all works.
 *
 * @param root - Runtime root.
 * @param except - Optional slot to exclude (so re-setting it is not a self-collision).
 * @returns Map of port number to a `work/repo/service` owner label.
 */
export function allocatedPorts(root: string, except: PortSlot | null = null): Map<number, string> {
  const used = new Map<number, string>();
  for (const name of listWorkNames(root)) {
    let work;
    try {
      work = readWork(root, name);
    } catch {
      continue;
    }
    for (const wt of work.worktrees ?? []) {
      for (const [service, port] of Object.entries(wt.ports ?? {})) {
        if (except && except.work === name && except.repo === wt.repo && except.service === service) {
          continue;
        }
        used.set(Number(port), `${name}/${wt.repo}/${service}`);
      }
    }
  }
  return used;
}

/**
 * Lowest free port at or above the base that is not present in `used`.
 *
 * @param used - Set/map of already-allocated ports.
 * @returns The first free port number.
 */
export function nextFreePort(used: Map<number, unknown>): number {
  let p = PORT_BASE;
  while (used.has(p)) p++;
  return p;
}

/**
 * Result of assigning a port to a service.
 */
export interface PortResult {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Service name. */
  service: string;
  /** The assigned port. */
  port: number;
}

/**
 * Record a port for a service in a worktree (only updates `work.json`).
 *
 * With an explicit port, validates it is free across all works; otherwise picks
 * the lowest free port.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo (worktree) name; must already be a worktree of the work.
 * @param service - Service name to assign the port to.
 * @param port - Explicit port to lock, or undefined to auto-pick.
 * @returns The work/repo/service and the chosen port.
 */
export function portSet(
  root: string,
  name: string,
  repo: string,
  service: string,
  port?: number,
): PortResult {
  const work = readWork(root, name);
  const wt = findWorktree(work, repo);
  if (!wt) throw new MxError(`work "${name}" has no worktree for ${repo} — add it first`, 'NO_WORKTREE');
  wt.ports = wt.ports ?? {};

  const used = allocatedPorts(root, { work: name, repo, service });
  let chosen: number;
  if (port != null) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new MxError(`invalid port: ${port}`, 'BAD_ARGS');
    }
    if (used.has(port)) {
      throw new MxError(`port ${port} already allocated to ${used.get(port)}`, 'PORT_TAKEN');
    }
    chosen = port;
  } else {
    chosen = nextFreePort(used);
  }

  wt.ports[service] = chosen;
  writeWork(root, work);
  return { work: name, repo, service, port: chosen };
}

/**
 * Result of releasing a port.
 */
export interface PortReleaseResult {
  /** Work name. */
  work: string;
  /** Repo name. */
  repo: string;
  /** Service name. */
  service: string;
  /** The port that was released. */
  released: number;
}

/**
 * Release a previously-set service port.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Repo (worktree) name.
 * @param service - Service name to release.
 * @returns The released slot and its former port.
 */
export function portUnset(
  root: string,
  name: string,
  repo: string,
  service: string,
): PortReleaseResult {
  const work = readWork(root, name);
  const wt = findWorktree(work, repo);
  if (!wt || !wt.ports || !(service in wt.ports)) {
    throw new MxError(`no port set for ${repo}.${service} in ${name}`, 'NO_PORT');
  }
  const released = wt.ports[service];
  delete wt.ports[service];
  writeWork(root, work);
  return { work: name, repo, service, released };
}

/**
 * The work's allocated ports, keyed by repo then service.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @returns Map of repo to its service-to-port map.
 */
export function portList(root: string, name: string): Record<string, Record<string, number>> {
  const work = readWork(root, name);
  const map: Record<string, Record<string, number>> = {};
  for (const wt of work.worktrees ?? []) map[wt.repo] = wt.ports ?? {};
  return map;
}
