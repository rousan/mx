import * as fs from 'node:fs';

/**
 * Read and parse a JSON file.
 *
 * @param file - Absolute path to the JSON file.
 * @returns The parsed value, typed as the caller's expected shape.
 */
export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/**
 * Atomically write a value as pretty-printed JSON.
 *
 * Writes to a temporary sibling file and renames it into place so readers never
 * observe a partially-written file.
 *
 * @param file - Destination path.
 * @param obj - Value to serialize (2-space indented, trailing newline).
 */
export function writeJson(file: string, obj: unknown): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
