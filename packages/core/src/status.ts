import * as path from 'node:path';
import { listReposInfo } from './repos';
import { listWorksInfo } from './works';
import { exists } from './fsutil';
import { readJson } from './json';
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
 * A work as surfaced by `mx status` — alias of `WorkSummary` (the full
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
  /** Context-registry summary. */
  context: StatusContext;
  /** Summaries of pristine clones. */
  repos: RepoSummary[];
  /** Full manifests of all works, each annotated with its session count. */
  works: StatusWork[];
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
 * @param root - Runtime root.
 * @returns Runtime path, context summary, repo summaries, and work manifests
 *   annotated with session counts.
 */
export function statusRuntime(root: string): StatusResult {
  return {
    runtime: root,
    context: { entries: countContextEntries(root) },
    repos: listReposInfo(root),
    works: listWorksInfo(root, { includeArchived: true }),
  };
}
