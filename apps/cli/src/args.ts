import { MxError } from '@mx/core';

/**
 * Parsed command-line flags. Boolean flags are always present; value flags are
 * optional and absent when not supplied.
 */
export interface Flags {
  /** Emit machine-readable JSON instead of human text. */
  porcelain: boolean;
  /** Show help and exit. */
  help: boolean;
  /** Show version and exit. */
  version: boolean;
  /** Explicit runtime path from `--runtime`. */
  runtime?: string;
  /** Target name from `-n`/`--name`. */
  name?: string;
  /** Description from `--description`. */
  description?: string;
  /** New branch name from `--branch`. */
  branch?: string;
  /** Base ref from `--base`. */
  base?: string;
}

/**
 * Result of parsing argv: ordered positionals plus collected flags.
 */
export interface ParsedArgs {
  /** Positional arguments in order. */
  positionals: string[];
  /** Collected flags. */
  flags: Flags;
}

/**
 * Maps each value-taking flag token to the `Flags` key it populates.
 */
const VALUE_FLAGS: Record<string, 'runtime' | 'name' | 'description' | 'branch' | 'base'> = {
  '-n': 'name',
  '--name': 'name',
  '--runtime': 'runtime',
  '--description': 'description',
  '--branch': 'branch',
  '--base': 'base',
};

/**
 * Parse a CLI argument vector into positionals and flags.
 *
 * Supports boolean flags (`--porcelain`/`--json`, `-h`/`--help`, `-v`/`--version`),
 * value flags in both `--flag value` and `--flag=value` forms, and treats every
 * other token as a positional.
 *
 * @param argv - Arguments after the node executable and script (i.e. `process.argv.slice(2)`).
 * @returns The parsed positionals and flags.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = { porcelain: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--porcelain' || a === '--json') {
      flags.porcelain = true;
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else if (a === '--version' || a === '-v') {
      flags.version = true;
    } else if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=');
      const key = VALUE_FLAGS[a.slice(0, eq)];
      if (!key) throw new MxError(`unknown flag: ${a.slice(0, eq)}`, 'BAD_ARGS');
      flags[key] = a.slice(eq + 1);
    } else {
      const key = VALUE_FLAGS[a];
      if (key) flags[key] = argv[++i];
      else positionals.push(a);
    }
  }
  return { positionals, flags };
}
