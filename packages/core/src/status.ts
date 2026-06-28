import * as path from 'node:path';
import { listReposInfo } from './repos';
import { listWorksInfo } from './works';
import type { ListWorksOpts } from './works';
import { exists } from './fsutil';
import { readJson } from './json';
import { readRuntimeVersion } from './runtime';
import type { RepoSummary } from './types';
import type { WorkSummary } from './works';

/**
 * Runtime-level context-registry summary (counts only — INDEX.json itself is
 * the source of truth for full metadata).
 */
export interface StatusContext {
  /** Number of entries in `<runtime>/context/INDEX.json`. 0 if missing or malformed. */
  entries: number;
}

/**
 * A work as surfaced by `mx info` — alias of `WorkSummary` (the full
 * manifest plus session count). Kept as a separate export name so callers
 * that imported `StatusWork` historically still resolve.
 */
export type StatusWork = WorkSummary;

/**
 * Full runtime overview: path, registry summary, pristine repos, and works
 * with their worktrees and session-summary counts.
 */
export interface StatusResult {
  /** Absolute runtime path. */
  runtime: string;
  /** Runtime layout version (from `mx.json`; 1 for a legacy runtime). */
  version: number;
  /** Context-registry summary. */
  context: StatusContext;
  /** Summaries of pristine clones. */
  repos: RepoSummary[];
  /**
   * Works visible under the current filter (active-only by default;
   * `{ includeArchived: true }` to include archived; `{ onlyArchived: true }`
   * to restrict to archived).
   */
  works: StatusWork[];
  /**
   * Total archived works on disk, regardless of filter — lets callers render
   * a count even when the filter hides them.
   */
  archivedWorksCount: number;
}

/**
 * Count entries in a runtime's `context/INDEX.json`. Returns 0 if the file is
 * missing, isn't a JSON array, or can't be parsed (e.g. mid-edit by the user).
 *
 * @param root - Runtime root.
 * @returns Number of registry entries.
 */
function countContextEntries(root: string): number {
  const indexPath = path.join(root, 'context', 'INDEX.json');
  if (!exists(indexPath)) return 0;
  try {
    const data = readJson<unknown>(indexPath);
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Assemble a runtime status snapshot.
 *
 * By default, `works` includes only **active** works; pass
 * `{ includeArchived: true }` to include archived ones, or
 * `{ onlyArchived: true }` to restrict to archived ones.
 * `archivedWorksCount` always reflects the true count on disk regardless of
 * the filter — so callers (CLI human-mode header, dashboards) can show
 * "(N active, M archived)" even when only N are returned.
 *
 * @param root - Runtime root.
 * @param opts - Filter for the `works` array.
 * @returns Runtime path, context summary, repo summaries, filtered works,
 *   and an unfiltered archived count.
 */
export function statusRuntime(root: string, opts: ListWorksOpts = {}): StatusResult {
  // Compute archived count from the unfiltered list so it survives any
  // caller-supplied filter.
  const all = listWorksInfo(root, { includeArchived: true });
  const archivedWorksCount = all.filter((w) => w.isArchived === true).length;
  const works = opts.onlyArchived
    ? all.filter((w) => w.isArchived === true)
    : opts.includeArchived
      ? all
      : all.filter((w) => w.isArchived !== true);
  return {
    runtime: root,
    version: readRuntimeVersion(root),
    context: { entries: countContextEntries(root) },
    repos: listReposInfo(root),
    works,
    archivedWorksCount,
  };
}
