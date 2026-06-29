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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MxError } from './errors';
import { exists } from './fsutil';
import { stampRuntimeHooks } from './templates';
import {
  RUNTIME_VERSION,
  HOOK_EVENTS,
  readRuntimeVersion,
  writeRuntimeVersion,
  migrateRepoLayout,
  migrateWorkLayout,
  ensureWorkScaffolding,
  listWorkNames,
  listRepoNames,
  repoPath,
  repoConfigFile,
  writeRepoConfig,
  runtimeHooksDir,
  workDir,
  workManifest,
  readWork,
  writeWork,
} from './runtime';

/**
 * Whether a shell script is just the mx-shipped boilerplate (no user logic) and
 * therefore safe to remove during a migration. Strips the shebang, comments,
 * and blank lines, then checks that every remaining line is known boilerplate
 * (the `set -euo pipefail` guard, a bare `exit 0`, or the old default echo). An
 * empty/whitespace file counts as default too.
 *
 * @param content - The script's full text.
 * @returns True when nothing but boilerplate remains (safe to delete).
 */
function isDefaultScript(content: string): boolean {
  const ALLOW = new Set([
    'set -euo pipefail',
    'exit 0',
    'echo "Hydrate is done"',
    'echo "Setup is done"',
  ]);
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  return lines.every((l) => ALLOW.has(l));
}

/**
 * The outcome of one migration step: paths it changed (or would change in a dry
 * run) and any non-fatal warnings the user should see (e.g. a customized script
 * preserved rather than removed).
 */
interface MigrationStepResult {
  changed: string[];
  warnings: string[];
}

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
   * responsible for writing the new `VERSION` on success. When `dryRun` is set
   * it must mutate nothing (not even `VERSION`) and only return what it would
   * change. `templatesDir` is the CLI's bundled templates directory (needed to
   * stamp new files; unused by steps that only move/generate).
   *
   * @param root - Runtime root.
   * @param opts - Step options (`dryRun`, `templatesDir`).
   * @returns The paths changed (or that would change) and any warnings.
   */
  run: (root: string, opts: { dryRun: boolean; templatesDir: string }) => MigrationStepResult;
}

/**
 * Migration registry, keyed by *from* version.
 *
 * - **v1 → v2**: pristine repos move from flat `repos/<name>` to `repos/<name>/git`;
 *   each work's worktrees move from `works/<work>/<repo>` to `works/<work>/wt/<repo>`,
 *   and the new per-work scaffolding is created.
 * - **v2 → v3**: hooks are centralized. The per-repo `hydrate.sh`/`health.sh` and
 *   per-work `hooks/` are replaced by a single `<runtime>/hooks/` hub; each repo
 *   gains a `repo.json`. Old scripts are removed when they're unchanged from the
 *   mx default, and **preserved with a warning** when customized (so the user can
 *   fold the logic into the central hooks).
 */
const STEPS: Record<number, MigrationStep> = {
  1: {
    from: 1,
    to: 2,
    run: (root, { dryRun }) => {
      const changed: string[] = [];
      changed.push(...migrateRepoLayout(root, { dryRun })); // repos/<repo> -> repos/<repo>/git
      changed.push(...migrateWorkLayout(root, { dryRun })); // worktrees -> works/<work>/wt/<repo>
      for (const work of listWorkNames(root)) {
        changed.push(...ensureWorkScaffolding(root, work, { dryRun }));
      }
      if (!dryRun) writeRuntimeVersion(root, 2);
      return { changed, warnings: [] };
    },
  },
  2: {
    from: 2,
    to: 3,
    run: (root, { dryRun, templatesDir }) => {
      const changed: string[] = [];
      const warnings: string[] = [];

      // 1. Central hooks/ + the shipped hook templates (stamp-if-missing).
      if (dryRun) {
        const hd = runtimeHooksDir(root);
        if (!exists(hd)) changed.push(hd);
        for (const ev of HOOK_EVENTS) {
          const p = path.join(hd, ev);
          if (!exists(p)) changed.push(p);
        }
      } else {
        changed.push(...stampRuntimeHooks(root, templatesDir));
      }

      // 2. Per repo: add repo.json, and retire the old per-repo scripts —
      //    delete the defaults, keep (and warn about) anything customized.
      for (const repo of listRepoNames(root)) {
        const cfg = repoConfigFile(root, repo);
        if (!exists(cfg)) {
          if (!dryRun) writeRepoConfig(root, repo);
          changed.push(cfg);
        }
        for (const script of ['hydrate.sh', 'health.sh']) {
          const p = path.join(repoPath(root, repo), script);
          if (!exists(p)) continue;
          if (isDefaultScript(fs.readFileSync(p, 'utf8'))) {
            if (!dryRun) fs.rmSync(p);
            changed.push(p);
          } else {
            warnings.push(
              `kept customized ${p} — mx no longer runs it; fold its logic into <runtime>/hooks/post-worktree-create or repo-health`,
            );
          }
        }
      }

      // 3. Per work: (a) drop the per-work hooks/ dir when all of its scripts
      //    are defaults (keep + warn when customized); (b) backfill each
      //    worktree's `name` (= repo) so old and new work.json have one shape.
      for (const work of listWorkNames(root)) {
        const hd = path.join(workDir(root, work), 'hooks');
        if (exists(hd)) {
          const files = fs
            .readdirSync(hd)
            .filter((f) => fs.statSync(path.join(hd, f)).isFile());
          const allDefault = files.every((f) =>
            isDefaultScript(fs.readFileSync(path.join(hd, f), 'utf8')),
          );
          if (allDefault) {
            if (!dryRun) fs.rmSync(hd, { recursive: true, force: true });
            changed.push(hd);
          } else {
            warnings.push(
              `kept customized ${hd} — per-work hooks are gone in v3; fold its logic into <runtime>/hooks/ (pre/post-work-archive, pre/post-work-unarchive)`,
            );
          }
        }
        // Backfill worktree names in work.json.
        let w;
        try {
          w = readWork(root, work);
        } catch {
          continue;
        }
        let touched = false;
        for (const wt of w.worktrees ?? []) {
          if (wt.name === undefined) {
            if (!dryRun) wt.name = wt.repo;
            touched = true;
          }
        }
        if (touched) {
          if (!dryRun) writeWork(root, w);
          changed.push(workManifest(root, work));
        }
      }

      if (!dryRun) writeRuntimeVersion(root, 3);
      return { changed, warnings };
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
  /** Paths changed across all applied steps (or that *would* change in a dry run). */
  changed: string[];
  /** Non-fatal warnings (e.g. customized scripts preserved for you to migrate). */
  warnings: string[];
  /** True when this was a dry run — nothing was actually mutated. */
  dryRun: boolean;
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
 * With `opts.dryRun`, the same validation runs (so an impossible migration still
 * errors up front) but no step mutates anything — the returned `changed` list is
 * exactly what a real run would do. Lets a user preview a migration before it
 * touches an old runtime.
 *
 * @param root - Runtime root.
 * @param templatesDir - The CLI's bundled templates directory (for stamping new files).
 * @param opts - Migration options.
 * @param opts.dryRun - When set, plan only — validate and report, no mutations.
 * @returns The from/to versions, steps applied, paths changed, warnings, and `dryRun`.
 */
export function migrateRuntime(
  root: string,
  templatesDir: string,
  opts: { dryRun?: boolean } = {},
): MigrateResult {
  const dryRun = opts.dryRun === true;
  const from = readRuntimeVersion(root);
  if (from === RUNTIME_VERSION) {
    return { from, to: RUNTIME_VERSION, applied: [], changed: [], warnings: [], dryRun };
  }
  if (from > RUNTIME_VERSION) {
    throw new MxError(
      `runtime is v${from}, newer than this mx supports (v${RUNTIME_VERSION}). ` +
        `Upgrade your mx CLI: \`npm i -g @roulabs/mx@latest\`.`,
      'CLI_TOO_OLD',
    );
  }
  // Validate the full chain exists before mutating anything (same in dry run).
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
  const warnings: string[] = [];
  for (let v = from; v < RUNTIME_VERSION; v++) {
    const step = STEPS[v];
    const res = step.run(root, { dryRun, templatesDir });
    changed.push(...res.changed);
    warnings.push(...res.warnings);
    applied.push({ from: step.from, to: step.to });
  }
  return { from, to: RUNTIME_VERSION, applied, changed, warnings, dryRun };
}
