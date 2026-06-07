import * as fs from 'node:fs';
import * as path from 'node:path';
import { listWorkNames, readWork, workDir } from './runtime';
import { listReposInfo } from './repos';
import { exists } from './fsutil';
import { readJson } from './json';
import type { RepoSummary, Work } from './types';

/**
 * Runtime-level context-registry summary (counts only — INDEX.json itself is
 * the source of truth for full metadata).
 */
export interface StatusContext {
  /** Number of entries in `<runtime>/context/INDEX.json`. 0 if missing or malformed. */
  entries: number;
}

/**
 * A work with the in-status fields it carries: its manifest plus a count of
 * session-summary files (`.md` files in `<work>/sessions/`).
 */
export type StatusWork = Work & {
  /** Number of `.md` files in `<work>/sessions/`. 0 if the folder is missing. */
  sessions: number;
};

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
 * Count session-summary files in `<work>/sessions/`. Only `.md` files are
 * counted; any other dropped files are ignored.
 *
 * @param root - Runtime root.
 * @param workName - Work folder name.
 * @returns Number of session files; 0 if the folder doesn't exist yet.
 */
function countSessions(root: string, workName: string): number {
  const dir = path.join(workDir(root, workName), 'sessions');
  if (!exists(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md')).length;
}

/**
 * Assemble a runtime status snapshot.
 *
 * @param root - Runtime root.
 * @returns Runtime path, context summary, repo summaries, and work manifests
 *   annotated with session counts.
 */
export function statusRuntime(root: string): StatusResult {
  const repos = listReposInfo(root);
  const works: StatusWork[] = listWorkNames(root).map((name) => ({
    ...readWork(root, name),
    sessions: countSessions(root, name),
  }));
  return {
    runtime: root,
    context: { entries: countContextEntries(root) },
    repos,
    works,
  };
}
