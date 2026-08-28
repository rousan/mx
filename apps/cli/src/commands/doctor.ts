import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import {
  MxError,
  discoverRuntime,
  contextIndexStatus,
  CLAUDE_IMPORT_LIMIT,
  type ContextIndexStatus,
} from '@mx/core';
import { emit, dim, bold, check, warn, confirmYesNo } from '../output';
import type { Flags } from '../args';

/**
 * A tool `mx doctor` checks for, with the package name under each supported
 * package manager. `bins` lists the executable name(s) that satisfy it (some
 * tools install under a distro-specific binary — `fd` is `fdfind` on Debian,
 * `bat` is `batcat`), and `kind` separates the hard requirements of the tmux
 * workflow from the recommended editor toolbelt.
 */
interface ToolSpec {
  /** Display name. */
  name: string;
  /** Executable name(s) that count as "installed" (first found wins). */
  bins: string[];
  /** Whether mx's tmux workflow needs it, or it's a recommended nicety. */
  kind: 'required' | 'recommended';
  /** Homebrew formula (macOS / Linuxbrew). */
  brew: string;
  /** apt package (Debian/Ubuntu). */
  apt: string;
  /** dnf package (Fedora/RHEL). */
  dnf: string;
  /** pacman package (Arch). */
  pacman: string;
  /** Optional note (e.g. a package needing an extra repo on some distros). */
  note?: string;
}

/**
 * The tools mx checks. `required` covers the tmux-session workflow (`mx work
 * attach`/`open`): tmux itself, the editor pane (neovim), and the Claude Code
 * CLI the main pane resumes. `recommended` is the editor toolbelt a modern
 * neovim/LazyVim config expects — not needed by mx, but listed so a new machine
 * can be brought up in one pass.
 */
const TOOLS: ToolSpec[] = [
  { name: 'tmux', bins: ['tmux'], kind: 'required', brew: 'tmux', apt: 'tmux', dnf: 'tmux', pacman: 'tmux' },
  { name: 'neovim', bins: ['nvim'], kind: 'required', brew: 'neovim', apt: 'neovim', dnf: 'neovim', pacman: 'neovim' },
  { name: 'claude', bins: ['claude'], kind: 'required', brew: '', apt: '', dnf: '', pacman: '', note: 'install via `npm i -g @anthropic-ai/claude-code` (not a system package)' },
  { name: 'git', bins: ['git'], kind: 'required', brew: 'git', apt: 'git', dnf: 'git', pacman: 'git' },
  { name: 'ripgrep', bins: ['rg'], kind: 'recommended', brew: 'ripgrep', apt: 'ripgrep', dnf: 'ripgrep', pacman: 'ripgrep' },
  { name: 'fd', bins: ['fd', 'fdfind'], kind: 'recommended', brew: 'fd', apt: 'fd-find', dnf: 'fd-find', pacman: 'fd' },
  { name: 'fzf', bins: ['fzf'], kind: 'recommended', brew: 'fzf', apt: 'fzf', dnf: 'fzf', pacman: 'fzf' },
  { name: 'bat', bins: ['bat', 'batcat'], kind: 'recommended', brew: 'bat', apt: 'bat', dnf: 'bat', pacman: 'bat' },
  { name: 'lazygit', bins: ['lazygit'], kind: 'recommended', brew: 'lazygit', apt: 'lazygit', dnf: 'lazygit', pacman: 'lazygit', note: 'on Debian/Ubuntu lazygit may need a PPA or the GitHub release' },
  { name: 'eza', bins: ['eza'], kind: 'recommended', brew: 'eza', apt: 'eza', dnf: 'eza', pacman: 'eza', note: 'on older Debian/Ubuntu eza may need its own apt repo' },
  { name: 'zoxide', bins: ['zoxide'], kind: 'recommended', brew: 'zoxide', apt: 'zoxide', dnf: 'zoxide', pacman: 'zoxide' },
];

/**
 * A detected package manager plus how it installs a set of packages.
 */
interface PackageManager {
  /** Manager id. */
  id: 'brew' | 'apt' | 'dnf' | 'pacman';
  /** Build the install command line for the given package names. */
  install: (pkgs: string[]) => string;
  /** Which `ToolSpec` field holds this manager's package name. */
  field: 'brew' | 'apt' | 'dnf' | 'pacman';
}

/**
 * Whether an executable resolves on `PATH`.
 *
 * @param bin - Executable name.
 * @returns True when found.
 */
function has(bin: string): boolean {
  return spawnSync('command', ['-v', bin], { stdio: 'ignore', shell: '/bin/sh' }).status === 0;
}

/**
 * Read a tool's version line (best-effort), for the report's detail column.
 *
 * @param bin - Executable name.
 * @returns The first line of `<bin> --version`, or '' when unavailable.
 */
function versionOf(bin: string): string {
  // Most tools speak `--version`; a few (notably tmux) only speak `-V`, so fall
  // back to it when the first form yields nothing.
  for (const flag of ['--version', '-V']) {
    const r = spawnSync(bin, [flag], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.split('\n')[0].trim();
  }
  return '';
}

/**
 * Detect the system package manager to build install commands against: Homebrew
 * first (the recommended path on macOS and viable on Linux), then the common
 * Linux managers. Returns null when none is found.
 *
 * @returns The detected package manager, or null.
 */
function detectPackageManager(): PackageManager | null {
  if (has('brew')) return { id: 'brew', field: 'brew', install: (p) => `brew install ${p.join(' ')}` };
  if (has('apt')) return { id: 'apt', field: 'apt', install: (p) => `sudo apt install -y ${p.join(' ')}` };
  if (has('dnf')) return { id: 'dnf', field: 'dnf', install: (p) => `sudo dnf install -y ${p.join(' ')}` };
  if (has('pacman')) return { id: 'pacman', field: 'pacman', install: (p) => `sudo pacman -S --needed ${p.join(' ')}` };
  return null;
}

/**
 * A per-tool check result.
 */
interface ToolStatus {
  spec: ToolSpec;
  installed: boolean;
  version: string;
}

/**
 * Check every tool once.
 *
 * @returns The status of each tool in {@link TOOLS} order.
 */
function checkTools(): ToolStatus[] {
  return TOOLS.map((spec) => {
    const found = spec.bins.find(has);
    return { spec, installed: !!found, version: found ? versionOf(found) : '' };
  });
}

/**
 * Format a character count as a short `k`-suffixed string (e.g. `157.6k`).
 *
 * @param chars - Character count.
 * @returns The compact display string.
 */
function formatChars(chars: number): string {
  return `${(chars / 1000).toFixed(1)}k`;
}

/**
 * Resolve the runtime's `context/INDEX.json` status without failing doctor when
 * there's no runtime. Doctor is an environment check and isn't version-gated, so
 * this uses path-only discovery and only reports when a real runtime (with an
 * `.mx-root`) is present; otherwise it returns null and the check is skipped.
 *
 * @param flags - Parsed flags (provides an explicit `--runtime`).
 * @returns The index status, or null when no runtime is found.
 */
function runtimeContextIndex(flags: Flags): ContextIndexStatus | null {
  const root = discoverRuntime({ runtime: flags.runtime });
  if (!existsSync(path.join(root, '.mx-root'))) return null;
  return contextIndexStatus(root);
}

/**
 * `mx doctor` — check the tools mx's tmux workflow relies on (and the
 * recommended editor toolbelt), report what's present, and print the exact
 * install command for whatever is missing. With `--install`, run that command
 * (after confirmation) via the detected package manager. Never version-gated and
 * never touches runtime state — it's a pure environment check.
 *
 * @param _positionals - Unused (doctor takes no sub-action).
 * @param flags - Parsed flags (`--install` opts into running the install; `--yes` skips the prompt).
 */
export function runDoctor(_positionals: string[], flags: Flags): void {
  const statuses = checkTools();
  const pm = detectPackageManager();
  // Packages to install, per kind, resolved to this manager's package names
  // (skipping tools with no system package, e.g. claude).
  const missing = statuses.filter((s) => !s.installed);
  const missingPkgs = pm
    ? missing.map((s) => s.spec[pm.field]).filter((p): p is string => !!p)
    : [];

  // --install: run the package manager for the missing tools, after confirming.
  if (flags.install) {
    if (!pm) {
      throw new MxError('no supported package manager found (brew/apt/dnf/pacman) — install the tools manually', 'NO_PACKAGE_MANAGER');
    }
    if (missingPkgs.length === 0) {
      emit(() => console.log(`${check()} everything already installed — nothing to do`), { installed: [], ranInstall: false });
      return;
    }
    const cmd = pm.install(missingPkgs);
    if (!flags.yes) {
      process.stderr.write(`${warn()} About to run: ${bold(cmd)}\n`);
      if (!process.stdin.isTTY || !confirmYesNo('Proceed? (y/N) ')) {
        process.stderr.write(`${dim('Aborted.')}\n`);
        return;
      }
    }
    // Run through a shell so `sudo` and word-splitting behave as typed.
    const r = spawnSync('/bin/sh', ['-c', cmd], { stdio: 'inherit' });
    if (r.status !== 0) throw new MxError(`install command failed (exit ${r.status})`, 'INSTALL_FAILED');
    emit(() => console.log(`${check()} installed: ${missingPkgs.join(', ')}`), { installed: missingPkgs, ranInstall: true });
    return;
  }

  // The runtime's context-index size vs Claude Code's @import limit (best-effort;
  // null when doctor is run without a runtime present).
  const idx = runtimeContextIndex(flags);

  emit(() => {
    const rows = statuses;
    const nameW = Math.max(...rows.map((r) => r.spec.name.length));
    const renderGroup = (kind: ToolSpec['kind'], title: string): void => {
      const group = rows.filter((r) => r.spec.kind === kind);
      if (group.length === 0) return;
      console.log(bold(title));
      for (const r of group) {
        const marker = r.installed ? check() : warn();
        const label = r.spec.name.padEnd(nameW);
        const detail = r.installed ? dim(r.version || 'installed') : dim('missing');
        console.log(`  ${marker} ${label}  ${detail}`);
      }
      console.log();
    };
    renderGroup('required', 'Required (mx tmux workflow)');
    renderGroup('recommended', 'Recommended (editor toolbelt)');

    if (missing.length === 0) {
      console.log(`${check()} all set — every tool is installed`);
    } else if (!pm) {
      console.log(`${warn()} ${dim('missing tools — no supported package manager detected; install them manually:')}`);
      for (const s of missing) console.log(`  ${dim(`- ${s.spec.name}${s.spec.note ? ` (${s.spec.note})` : ''}`)}`);
    } else {
      console.log(`${dim(`install the ${missing.length} missing tool(s) with:`)}`);
      if (missingPkgs.length) console.log(`  ${bold(pm.install(missingPkgs))}`);
      // Surface tools with special installation needs / no system package.
      for (const s of missing) {
        if (!s.spec[pm.field] || s.spec.note) {
          console.log(`  ${dim(`- ${s.spec.name}: ${s.spec.note ?? 'no system package'}`)}`);
        }
      }
      console.log(`${dim('or run')} ${bold('mx doctor --install')} ${dim('to install them now.')}`);
    }
    // Context registry: the runtime CLAUDE.md @imports context/INDEX.json into
    // every session, and Claude Code caps an imported file at ~150k chars. Flag
    // an index that's over (may truncate) or approaching that ceiling.
    if (idx && idx.exists) {
      console.log();
      console.log(bold('Context registry'));
      const entriesNote = idx.entries != null ? `${idx.entries} entries · ` : '';
      const size = `${entriesNote}${formatChars(idx.chars)} chars`;
      const limit = formatChars(CLAUDE_IMPORT_LIMIT);
      if (idx.overLimit) {
        console.log(`  ${warn()} INDEX.json  ${dim(size)}`);
        console.log(`  ${dim(`over Claude Code's ${limit} @import limit — it may drop the tail; trim descriptions or move detail into body files (\`/memory\` frees session context)`)}`);
      } else if (idx.nearLimit) {
        console.log(`  ${warn()} INDEX.json  ${dim(size)}`);
        console.log(`  ${dim(`approaching Claude Code's ${limit} @import limit — consider trimming before entries are dropped`)}`);
      } else {
        console.log(`  ${check()} INDEX.json  ${dim(`${size}  (under the ${limit} @import limit)`)}`);
      }
    }
  }, {
    tools: statuses.map((s) => ({ name: s.spec.name, kind: s.spec.kind, installed: s.installed, version: s.version })),
    packageManager: pm?.id ?? null,
    missing: missing.map((s) => s.spec.name),
    installCommand: pm && missingPkgs.length ? pm.install(missingPkgs) : null,
    contextIndex: idx,
  });
}
