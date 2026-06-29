import { spawnSync } from 'node:child_process';
import { compareVersions, maxVersion } from '@mx/core';
import { cliVersion } from './paths';

/** The published package name self-update targets. */
const PKG = '@roulabs/mx';

/**
 * Major version number from a semver string (`"2.3.1"` → `2`).
 *
 * @param v - Semver string.
 * @returns The major component, or 0 if unparseable.
 */
function major(v: string): number {
  return Number.parseInt(v.split('.')[0], 10) || 0;
}

/**
 * Whether `npm` is on PATH and runnable.
 *
 * @returns True if `npm --version` succeeds.
 */
function npmAvailable(): boolean {
  try {
    const r = spawnSync('npm', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Run `npm view <spec> <field> --json` and parse the result.
 *
 * @param spec - Package spec, optionally with a version range.
 * @param field - The field to read (e.g. `version`).
 * @returns The parsed JSON value, or null on any failure.
 */
function npmViewJson(spec: string, field: string): unknown {
  const r = spawnSync('npm', ['view', spec, field, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/**
 * Highest published version matching a range. `npm view <pkg>@<range> version`
 * returns a single string when one version matches, or an array when several do
 * — and we don't trust the array's order, so we take the semver-max explicitly.
 *
 * @param range - A semver range (e.g. `^2`).
 * @returns The newest matching version, or null.
 */
function latestForRange(range: string): string | null {
  const v = npmViewJson(`${PKG}@${range}`, 'version');
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length) return maxVersion(v.map(String));
  return null;
}

/** The `latest` dist-tag version, or null. */
function latestOverall(): string | null {
  const v = npmViewJson(PKG, 'version');
  return typeof v === 'string' ? v : null;
}

/**
 * Outcome of a self-update attempt, surfaced to the CLI renderer / porcelain.
 */
export interface SelfUpdateInfo {
  /** Package that was targeted. */
  package: string;
  /** Version of the CLI that ran the command. */
  current: string;
  /** False when `npm` isn't available (nothing was attempted). */
  npmAvailable: boolean;
  /** Newest version within the current major, or null if unknown. */
  latestInMajor: string | null;
  /** True when an install ran and succeeded. */
  updated: boolean;
  /** True when an install was attempted but failed. */
  installFailed: boolean;
  /** A newer major version number available beyond the current one, or null. */
  newMajor: number | null;
}

/**
 * Self-update the CLI to the newest release **within its current major**
 * (`npm i -g @roulabs/mx@^<major>`), and detect whether a newer major exists.
 * Crossing a major is intentionally left to the user (it requires `mx migrate`
 * afterwards), so this only ever reports a newer major as a suggestion.
 *
 * Never throws: when npm is missing or the install fails, the returned info
 * lets the caller print the manual command instead.
 *
 * @param porcelain - When true, suppress npm's streamed output (piped, not inherited).
 * @returns A summary of what happened.
 */
export function selfUpdate(porcelain: boolean): SelfUpdateInfo {
  const current = cliVersion();
  const curMajor = major(current);
  const info: SelfUpdateInfo = {
    package: PKG,
    current,
    npmAvailable: false,
    latestInMajor: null,
    updated: false,
    installFailed: false,
    newMajor: null,
  };

  if (!npmAvailable()) return info;
  info.npmAvailable = true;

  info.latestInMajor = latestForRange(`^${curMajor}`);
  const overall = latestOverall();
  if (overall && major(overall) > curMajor) info.newMajor = major(overall);

  // Only install when a STRICTLY NEWER in-major version exists. Comparing with
  // `!==` (instead of a semver `>`) would treat a lower "latest" — e.g. from a
  // stale registry view — as an update and trigger a pointless reinstall that
  // reports a confusing downgrade ("Updated to v2.3.0 (was v2.5.0)").
  if (info.latestInMajor && compareVersions(info.latestInMajor, current) > 0) {
    const r = spawnSync('npm', ['i', '-g', `${PKG}@^${curMajor}`], {
      stdio: porcelain ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    if (r.status === 0) info.updated = true;
    else info.installFailed = true;
  }
  return info;
}
