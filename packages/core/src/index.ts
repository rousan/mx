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
  repoGitDir,
  repoHydrateScript,
  repoHealthScript,
  workDir,
  workManifest,
  workspaceFile,
  worktreesDir,
  worktreePath,
  workHooksDir,
  workHookScript,
  WORK_HOOK_EVENTS,
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
  syncRuntime,
  migrateRepoLayout,
  migrateWorkLayout,
  ensureWorkScaffolding,
  RUNTIME_VERSION,
  mxConfigFile,
  readMxConfig,
  readRuntimeVersion,
  writeRuntimeVersion,
} from './runtime';
export type { InitResult, SyncResult, MxConfig, WorkHookEvent } from './runtime';

export { migrateRuntime } from './migrations';
export type { MigrateResult, AppliedMigration } from './migrations';

export { stampClaudeMd, removeStaleRuntimeReadme, stampRepoScripts } from './templates';

export {
  repoNameFromUrl,
  repoAdd,
  repoNew,
  listReposInfo,
  repoFetch,
  repoInfo,
  repoHealth,
  listRepoHealth,
  repoRemove,
} from './repos';
export type {
  RepoAddResult,
  RepoNewResult,
  RepoFetchResult,
  RepoInfoResult,
  RepoHealth,
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
export type { StatusResult, StatusContext, StatusWork } from './status';
