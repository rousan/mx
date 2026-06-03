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
}

/**
 * Summary of a pristine clone under `repos/`, as shown by `repo ls` / `status`.
 */
export interface RepoSummary {
  /** Repo directory name under `repos/`. */
  name: string;
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
