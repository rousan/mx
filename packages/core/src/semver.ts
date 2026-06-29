/**
 * Minimal semver comparison — just enough for self-update version math, with no
 * external dependency (mx ships zero runtime deps).
 *
 * Compares the numeric `major.minor.patch` core only; any pre-release/build
 * suffix (after `-` or `+`) is ignored. Missing components count as 0, so
 * `"2"` and `"2.0"` compare equal to `"2.0.0"`.
 *
 * @param a - First version string (e.g. `"2.5.0"`).
 * @param b - Second version string.
 * @returns `1` if `a > b`, `-1` if `a < b`, `0` if equal on the core triple.
 */
export function compareVersions(a: string, b: string): number {
  const core = (v: string): number[] =>
    v.split('+')[0].split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pa = core(a);
  const pb = core(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * The semver-max of a list of version strings (by `compareVersions`).
 *
 * @param versions - Candidate version strings.
 * @returns The highest version, or null when the list is empty.
 */
export function maxVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  return versions.reduce((max, cur) => (compareVersions(cur, max) > 0 ? cur : max));
}
