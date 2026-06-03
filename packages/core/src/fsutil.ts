import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Test whether a path exists on disk.
 *
 * @param p - Absolute or relative path to check.
 * @returns True if the path exists.
 */
export function exists(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * Test whether a directory looks like a git repository (has a `.git` entry).
 *
 * @param dir - Directory to inspect.
 * @returns True if `dir/.git` exists (a clone has a `.git` directory).
 */
export function isGitRepo(dir: string): boolean {
  return exists(path.join(dir, '.git'));
}

/**
 * List the immediate, non-hidden subdirectory names of a directory.
 *
 * @param dir - Directory to list; a missing directory yields an empty array.
 * @returns Sorted directory names, excluding dotfiles.
 */
export function listDirs(dir: string): string[] {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

/**
 * Resolve a path to its canonical, symlink-free form.
 *
 * Used when comparing the cwd against runtime directories, since
 * `process.cwd()` returns the resolved path (e.g. macOS `/tmp` ->
 * `/private/tmp`) while a configured root may not be resolved.
 *
 * @param p - Path to canonicalize.
 * @returns The realpath, or a plain absolute resolution if the path is missing.
 */
export function realpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}
