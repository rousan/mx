/**
 * A single git worktree belonging to a work: one repo checked out on the
 * work's branch, with a map of locally-assigned service ports.
 */
export interface Worktree {
  /** Name of the pristine repo this worktree was created from. */
  repo: string;
  /** Branch the worktree is checked out on. */
  branch: string;
  /** Map of service name to allocated port, local to this worktree. */
  ports: Record<string, number>;
}

/**
 * The per-work manifest (`work.json`). Authoritative record of which repos a
 * work touches and which ports they use. Owned and written only by mx.
 */
export interface Work {
  /** Immutable work name (also the work folder name). */
  name: string;
  /** Free-text description of the work. */
  description: string;
  /** Worktrees in the work, one per repo. */
  worktrees: Worktree[];
  /**
   * True when the work is archived: its worktrees have been removed but its
   * folder, manifest, and `sessions/` are retained. Branches are preserved.
   * Unset / false for active works. The complementary `archived_at` carries
   * the timestamp of when this was set.
   */
  isArchived?: boolean;
  /** ISO-8601 timestamp set when `isArchived` flips to true; cleared on unarchive. */
  archived_at?: string;
}

/**
 * Summary of a pristine clone under `repos/`, as shown by `repo ls` / `status`.
 */
export interface RepoSummary {
  /** Repo directory name under `repos/`. */
  name: string;
  /** Absolute path to the pristine clone under `repos/`. */
  path: string;
  /** Current checked-out branch of the pristine clone. */
  branch: string;
  /** Origin remote URL, or null when none is configured. */
  remote: string | null;
}

/**
 * Options that influence how the runtime path is resolved for a command.
 */
export interface RuntimeOpts {
  /** Explicit runtime path from a `--runtime` flag, if provided. */
  runtime?: string;
  /**
   * Skip the runtime-version gate. Only `mx migrate` sets this — it must be
   * able to operate on an older-version runtime in order to upgrade it.
   */
  allowVersionMismatch?: boolean;
}

/**
 * The work and/or repo inferred from the current working directory, allowing
 * `-n <name>` to be omitted when the cwd already implies the target.
 */
export interface InferredContext {
  /** Work inferred from a `works/<work>/...` cwd, or null. */
  work: string | null;
  /** Repo inferred from a worktree or a `repos/<repo>/...` cwd, or null. */
  repo: string | null;
}
