/**
 * Cross-version runtime migrations (`mx migrate`).
 *
 * Each step upgrades a runtime from one layout version to the next. `mx sync`
 * handles same-major, non-breaking refreshes; migrations here handle the
 * breaking, cross-major layout changes that bump the runtime's `VERSION`.
 *
 * The registry is keyed by the *from* version: `STEPS[k]` upgrades v`k` → v`k+1`.
 * `migrateRuntime` validates that an unbroken chain exists from the runtime's
 * current version up to `RUNTIME_VERSION` **before** mutating anything, so a
 * runtime that can't be fully upgraded is rejected up front rather than left
 * half-migrated.
 */
import { MxError } from './errors';
import {
  RUNTIME_VERSION,
  readRuntimeVersion,
  writeRuntimeVersion,
  migrateRepoLayout,
  migrateWorkLayout,
  ensureWorkScaffolding,
  listWorkNames,
} from './runtime';

/**
 * One version-to-version migration step.
 */
interface MigrationStep {
  /** Version this step upgrades from. */
  from: number;
  /** Version this step upgrades to (always `from + 1`). */
  to: number;
  /**
   * Apply the step. Must be deterministic and idempotent-safe, and is
   * responsible for writing the new `VERSION` on success.
   *
   * @param root - Runtime root.
   * @returns Paths changed by the step (for reporting).
   */
  run: (root: string) => string[];
}

/**
 * Migration registry, keyed by *from* version.
 *
 * v1 → v2: two layout changes. (a) Pristine repos move from flat `repos/<name>`
 * to the container `repos/<name>/git`. (b) Each work's worktrees move from flat
 * `works/<work>/<repo>` into `works/<work>/wt/<repo>`, and the new per-work
 * scaffolding (`scripts/`, `files/`, `tmp/`, `CLAUDE.md`, `.claude/`) is created.
 */
const STEPS: Record<number, MigrationStep> = {
  1: {
    from: 1,
    to: 2,
    run: (root) => {
      const changed: string[] = [];
      changed.push(...migrateRepoLayout(root)); // repos/<repo> -> repos/<repo>/git
      changed.push(...migrateWorkLayout(root)); // worktrees -> works/<work>/wt/<repo>
      for (const work of listWorkNames(root)) changed.push(...ensureWorkScaffolding(root, work));
      writeRuntimeVersion(root, 2);
      return changed;
    },
  },
};

/**
 * One applied migration step, as reported back to the caller.
 */
export interface AppliedMigration {
  /** Version migrated from. */
  from: number;
  /** Version migrated to. */
  to: number;
}

/**
 * Result of `migrateRuntime`.
 */
export interface MigrateResult {
  /** Runtime version before migration. */
  from: number;
  /** Runtime version after migration (always `RUNTIME_VERSION`). */
  to: number;
  /** Steps applied in order (empty when already up to date). */
  applied: AppliedMigration[];
  /** Paths changed across all applied steps. */
  changed: string[];
}

/**
 * Upgrade a runtime from its current `VERSION` up to `RUNTIME_VERSION` by
 * applying each registered step in order.
 *
 * - Already current → no-op (`applied: []`).
 * - Runtime newer than this CLI supports → throws `CLI_TOO_OLD`.
 * - Any gap in the migration chain → throws `NO_MIGRATION` **before** any step
 *   runs, so the runtime is never left partially migrated.
 *
 * @param root - Runtime root.
 * @returns The from/to versions, the steps applied, and the paths changed.
 */
export function migrateRuntime(root: string): MigrateResult {
  const from = readRuntimeVersion(root);
  if (from === RUNTIME_VERSION) {
    return { from, to: RUNTIME_VERSION, applied: [], changed: [] };
  }
  if (from > RUNTIME_VERSION) {
    throw new MxError(
      `runtime is v${from}, newer than this mx supports (v${RUNTIME_VERSION}). ` +
        `Upgrade your mx CLI: \`npm i -g @roulabs/mx@latest\`.`,
      'CLI_TOO_OLD',
    );
  }
  // Validate the full chain exists before mutating anything.
  for (let v = from; v < RUNTIME_VERSION; v++) {
    if (!STEPS[v]) {
      throw new MxError(
        `this mx has no migration from runtime v${v} to v${v + 1} — cannot upgrade ` +
          `v${from} → v${RUNTIME_VERSION}.`,
        'NO_MIGRATION',
      );
    }
  }
  const applied: AppliedMigration[] = [];
  const changed: string[] = [];
  for (let v = from; v < RUNTIME_VERSION; v++) {
    const step = STEPS[v];
    changed.push(...step.run(root));
    applied.push({ from: step.from, to: step.to });
  }
  return { from, to: RUNTIME_VERSION, applied, changed };
}
