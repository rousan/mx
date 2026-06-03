import { listWorkNames, readWork } from './runtime';
import { listReposInfo } from './repos';
import type { RepoSummary, Work } from './types';

/**
 * Full runtime overview: path, pristine repos, and works with their worktrees.
 */
export interface StatusResult {
  /** Absolute runtime path. */
  runtime: string;
  /** Summaries of pristine clones. */
  repos: RepoSummary[];
  /** Full manifests of all works. */
  works: Work[];
}

/**
 * Assemble a runtime status snapshot.
 *
 * @param root - Runtime root.
 * @returns Runtime path, repo summaries, and work manifests.
 */
export function statusRuntime(root: string): StatusResult {
  const repos = listReposInfo(root);
  const works = listWorkNames(root).map((name) => readWork(root, name));
  return { runtime: root, repos, works };
}
