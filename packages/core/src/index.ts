/**
 * Public surface of @mx/core: pure domain logic for the mx runtime.
 *
 * Functions take inputs, return plain data, and throw `MxError` on failure;
 * they never write to stdout or exit the process. The CLI layer is responsible
 * for argument parsing, output formatting, and exit codes.
 */
export { MxError } from './errors';
export type { Work, Worktree, RepoSummary, RuntimeOpts, InferredContext } from './types';

export {
  reposDir,
  worksDir,
  repoPath,
  workDir,
  workManifest,
  workspaceFile,
  defaultRuntime,
  discoverRuntime,
  requireRuntime,
  listRepoNames,
  listWorkNames,
  readWork,
  writeWork,
  findWorktree,
  inferContext,
  initRuntime,
  updateRuntime,
} from './runtime';
export type { InitResult, UpdateResult } from './runtime';

export { stampClaudeMd, removeStaleRuntimeReadme } from './templates';

export {
  repoNameFromUrl,
  repoAdd,
  listReposInfo,
  repoFetch,
  repoInfo,
  repoRemove,
} from './repos';
export type {
  RepoAddResult,
  RepoFetchResult,
  RepoInfoResult,
  RepoRemoveResult,
} from './repos';

export {
  workNew,
  listWorksInfo,
  workInfo,
  workDescribe,
  workPath,
  worktreeAdd,
  worktreeList,
  worktreeRemove,
  workDestroy,
  archiveWork,
  unarchiveWork,
} from './works';
export type {
  WorkNewResult,
  WorkSummary,
  ListWorksOpts,
  WorkPathResult,
  WorktreeAddOpts,
  WorktreeAddResult,
  WorktreeRemoveResult,
  WorkDestroyOpts,
  WorkDestroyResult,
  ArchiveResult,
  UnarchiveResult,
  UnarchiveRestoredWorktree,
} from './works';

export { allocatedPorts, nextFreePort, portSet, portUnset, portList } from './ports';
export type { PortSlot, PortResult, PortReleaseResult } from './ports';

export { statusRuntime } from './status';
export type { StatusResult } from './status';
