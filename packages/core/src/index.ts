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
  runtimeFilesDir,
  runtimeBinDir,
  listRuntimeBins,
  runtimeHooksDir,
  hookScript,
  HOOK_EVENTS,
  repoPath,
  repoGitDir,
  repoConfigFile,
  readRepoConfig,
  writeRepoConfig,
  workDir,
  workManifest,
  workspaceFile,
  worktreesDir,
  worktreePath,
  defaultRuntime,
  discoverRuntime,
  requireRuntime,
  listRepoNames,
  listWorkNames,
  readWork,
  writeWork,
  findWorktree,
  findWorktreeByName,
  worktreeName,
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
export type { InitResult, SyncResult, MxConfig, HookEvent, RuntimeBin, RepoConfig } from './runtime';

export { claudeProjectDirName, readSessionTitle, findSessionsByName } from './claudeSessions';
export type { ClaudeSession } from './claudeSessions';

export { MX_SESSION_PREFIX, sanitizeTmuxName, mxSessionName, isMxSessionName } from './tmux';

export { renderBanner } from './banner';

export { compareVersions, maxVersion } from './semver';

export { migrateRuntime } from './migrations';
export type { MigrateResult, AppliedMigration } from './migrations';

export { stampClaudeMd, removeStaleRuntimeReadme, stampRuntimeHooks, stampRuntimeBins } from './templates';

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
  worktreeSetBranch,
  parseInitWorktreeSpec,
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
  WorktreeSetBranchResult,
  InitWorktreeSpec,
  WorkDestroyOpts,
  WorkDestroyResult,
  ArchiveResult,
  UnarchiveResult,
  UnarchiveRestoredWorktree,
} from './works';

export { allocatedPorts, nextFreePort, portSet, portUnset, portList } from './ports';
export type { PortSlot, PortResult, PortReleaseResult } from './ports';

export { workHealth, listWorkHealth } from './workhealth';
export type {
  WorkHealth,
  WorkHealthPort,
  WorkHealthPortConflict,
  WorkHealthWorktree,
  ListWorkHealthOpts,
} from './workhealth';

export { statusRuntime } from './status';
export type { StatusResult, StatusContext, StatusWork } from './status';

export {
  CLAUDE_IMPORT_LIMIT,
  CONTEXT_INDEX_WARN_RATIO,
  contextIndexFile,
  contextIndexStatus,
} from './context';
export type { ContextIndexStatus } from './context';
