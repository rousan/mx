/**
 * Health of the runtime's context-registry index against Claude Code's memory
 * limits. The runtime `CLAUDE.md` imports `context/INDEX.json` with the
 * `@import` mechanism so every session auto-loads it; Claude Code caps an
 * imported memory file at roughly 150k characters, past which it warns and may
 * drop the tail. This module reports the index's size so `mx doctor` can flag an
 * index that's approaching or over that ceiling before entries are silently lost.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Claude Code's approximate per-file `@import` memory limit, in characters. An
 * imported `context/INDEX.json` larger than this triggers Claude Code's
 * "over the …-char limit" warning and risks truncation.
 */
export const CLAUDE_IMPORT_LIMIT = 150_000;

/**
 * Fraction of {@link CLAUDE_IMPORT_LIMIT} at which mx starts warning that the
 * index is approaching the ceiling (so it can be trimmed before it's over).
 */
export const CONTEXT_INDEX_WARN_RATIO = 0.85;

/**
 * Absolute path to a runtime's context-registry index file.
 *
 * @param root - Runtime root.
 * @returns Path to `<root>/context/INDEX.json`.
 */
export const contextIndexFile = (root: string): string =>
  path.join(root, 'context', 'INDEX.json');

/**
 * The size health of a runtime's `context/INDEX.json` relative to Claude Code's
 * `@import` limit.
 */
export interface ContextIndexStatus {
  /** Absolute path to the index file. */
  path: string;
  /** Whether the index file exists and was readable. */
  exists: boolean;
  /** Character count of the file (0 when absent). */
  chars: number;
  /** Number of entries when the file parses as a JSON array, else null. */
  entries: number | null;
  /** True when at/above {@link CONTEXT_INDEX_WARN_RATIO} of the limit (approaching). */
  nearLimit: boolean;
  /** True when at/above {@link CLAUDE_IMPORT_LIMIT} (over — Claude Code may truncate). */
  overLimit: boolean;
}

/**
 * Measure a runtime's `context/INDEX.json` against Claude Code's `@import`
 * memory limit. Reads the file's character count (and entry count when it parses
 * as a JSON array) and flags whether it's approaching or over the ceiling. A
 * missing index is reported as `exists: false` with zero size — never an error,
 * since a runtime may legitimately have no context yet.
 *
 * @param root - Runtime root.
 * @returns The index's size health.
 */
export function contextIndexStatus(root: string): ContextIndexStatus {
  const p = contextIndexFile(root);
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return { path: p, exists: false, chars: 0, entries: null, nearLimit: false, overLimit: false };
  }
  const chars = raw.length;
  let entries: number | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed.length;
  } catch {
    // A malformed index still has a measurable size; just can't count entries.
  }
  return {
    path: p,
    exists: true,
    chars,
    entries,
    nearLimit: chars >= CLAUDE_IMPORT_LIMIT * CONTEXT_INDEX_WARN_RATIO,
    overLimit: chars >= CLAUDE_IMPORT_LIMIT,
  };
}
