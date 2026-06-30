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
  /** Bypass safety gates (currently: `mx work destroy --force`). */
  force: boolean;
  /** Skip interactive confirmation prompts (currently: `mx work archive --yes`). */
  yes: boolean;
  /** Include archived items alongside active ones (currently: `mx info --all`, `mx work ls --all`). */
  all: boolean;
  /** Restrict to archived items only (currently: `mx work ls --archived`). */
  archived: boolean;
  /** Open the work's dev layout after creating it (currently: `mx work new -o`, macOS). */
  open: boolean;
  /** Plan only, mutate nothing (currently: `mx migrate --dry-run`). */
  dryRun: boolean;
  /** Quick-start a work + worktree (currently: `mx repo new <name> --quick`). */
  quick: boolean;
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
  /** Port for `mx mission-control --port <n>`. */
  port?: number;
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
  const flags: Flags = {
    porcelain: false,
    help: false,
    version: false,
    force: false,
    yes: false,
    all: false,
    archived: false,
    open: false,
    dryRun: false,
    quick: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--porcelain' || a === '--json') {
      flags.porcelain = true;
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    } else if (a === '--version' || a === '-v') {
      flags.version = true;
    } else if (a === '--force') {
      flags.force = true;
    } else if (a === '--yes' || a === '-y') {
      flags.yes = true;
    } else if (a === '--all') {
      flags.all = true;
    } else if (a === '--archived') {
      flags.archived = true;
    } else if (a === '--open' || a === '-o') {
      flags.open = true;
    } else if (a === '--dry-run') {
      flags.dryRun = true;
    } else if (a === '--quick') {
      flags.quick = true;
    } else if (a === '--port' || a.startsWith('--port=')) {
      const v = a.startsWith('--port=') ? a.slice('--port='.length) : argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        throw new MxError(`invalid --port: ${v ?? '(missing)'}`, 'BAD_ARGS');
      }
      flags.port = n;
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
