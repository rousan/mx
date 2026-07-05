import {
  requireRuntime,
  inferContext,
  workNew,
  listRepoNames,
  parseInitWorktreeSpec,
  listWorksInfo,
  workInfo,
  workDescribe,
  workPath,
  worktreeAdd,
  worktreeList,
  worktreeRemove,
  worktreeSetBranch,
  worktreePath,
  repoGitDir,
  workDestroy,
  archiveWork,
  unarchiveWork,
  portSet,
  portUnset,
  portList,
  workHealth,
  listWorkHealth,
  findSessionsByName,
  MxError,
} from '@mx/core';
import type { WorkHealth, WorktreeAddResult } from '@mx/core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { emit, dim, bold, check, warn, confirmYesNo, tildify } from '../output';
import { openWorkLayout, shq } from '../open';
import { runPreHook, runPostHook, runHookCapture } from '../hooks';
import type { Flags } from '../args';

/**
 * Build the `MX_*` env for a worktree-related hook.
 *
 * @param name - Work name.
 * @param repo - Repo name.
 * @param wtName - Worktree name (the `wt/<name>` selector).
 * @param branch - Worktree branch.
 * @param worktreePathAbs - Absolute worktree path.
 * @param workFolder - Absolute work folder path.
 * @param gitDir - Repo pristine clone path.
 * @param base - Base ref, if any.
 * @returns The `MX_*` env map.
 */
function worktreeHookEnv(
  name: string,
  repo: string,
  wtName: string,
  branch: string,
  worktreePathAbs: string,
  workFolder: string,
  gitDir: string,
  base = '',
): Record<string, string> {
  return {
    MX_WORK: name,
    MX_REPO: repo,
    MX_WORKTREE_NAME: wtName,
    MX_BRANCH: branch,
    MX_BASE: base,
    MX_WORKTREE_PATH: worktreePathAbs,
    MX_WORK_PATH: workFolder,
    MX_GIT_DIR: gitDir,
  };
}

/**
 * Require a non-empty string argument, throwing a usage `MxError` otherwise.
 *
 * @param v - The candidate value.
 * @param msg - Usage message to surface when missing.
 * @returns The value, narrowed to a non-empty string.
 */
function need(v: string | undefined | null, msg: string): string {
  if (v == null || v === '') throw new MxError(msg, 'BAD_ARGS');
  return v;
}

/**
 * Absolute path to Claude Code's project store (`~/.claude/projects`), where
 * per-work session transcripts live.
 */
const claudeProjectsRoot = (): string => path.join(os.homedir(), '.claude', 'projects');

/**
 * Resolve the initial prompt for a *new* Claude session. An explicit
 * `--prompt <text>` wins outright (even `--prompt ''` → no prompt); otherwise
 * the `session-prompt` hook is fired (cwd = work folder) and its stdout is used,
 * letting the prompt be generated dynamically (global default, per-repo, etc.).
 * Returns `''` when neither yields a prompt.
 *
 * @param root - Runtime root.
 * @param name - Work name (also the session name being created).
 * @param workFolder - Absolute work folder path (hook cwd).
 * @param flags - Parsed flags (provides the `--prompt` override + `--porcelain`).
 * @returns The initial prompt text, or `''` for none.
 */
function resolveInitialPrompt(root: string, name: string, workFolder: string, flags: Flags): string {
  if (flags.prompt != null) return flags.prompt; // explicit override, '' means "no prompt"
  const cap = runHookCapture(
    root,
    'session-prompt',
    { cwd: workFolder, env: { MX_WORK: name, MX_WORK_PATH: workFolder, MX_SESSION_NAME: name } },
    flags.porcelain,
  );
  return cap.stdout;
}

/**
 * What `mx work open` should launch in the work's Terminal.
 */
interface SessionLaunch {
  /** Shell command to run after cd-ing into the work folder (a `claude` invocation). */
  command: string;
  /** Whether an existing session is resumed or a fresh one is created. */
  action: 'resume' | 'create';
  /** The resumed session's id (only when `action === 'resume'`). */
  sessionId?: string;
}

/**
 * Decide how to open a work's Claude session, following the per-work naming
 * convention (one session named exactly after the work):
 *
 * - 0 sessions named `<work>` → **create** a new session named `<work>`, seeded
 *   with the resolved initial prompt (from `--prompt` or the `session-prompt`
 *   hook) when there is one.
 * - exactly 1 → **resume** it (`claude --resume <id>`).
 * - 2+ → throw `MULTIPLE_SESSIONS`; the user resumes manually (numbered
 *   variants like `<work>-2` are excluded by the exact-name match, so this only
 *   happens with genuine duplicates).
 *
 * When creating with a prompt, the prompt is written to a throwaway file under
 * the work's `tmp/` and the launched shell reads-then-removes it — this keeps
 * arbitrary multi-line prompt text out of the command line (and out of the
 * nested AppleScript quoting) entirely.
 *
 * @param root - Runtime root.
 * @param name - Work name (= the session name).
 * @param workFolder - Absolute work folder path.
 * @param flags - Parsed flags.
 * @returns The command to run plus whether it resumes or creates.
 */
function resolveSessionLaunch(
  root: string,
  name: string,
  workFolder: string,
  flags: Flags,
): SessionLaunch {
  // Claude keys its project dir off the realpath'd cwd (macOS /tmp -> /private/tmp).
  let realWork = workFolder;
  try {
    realWork = fs.realpathSync(workFolder);
  } catch {
    // Fall back to the given path; findSessionsByName just won't match if it's wrong.
  }
  const sessions = findSessionsByName(claudeProjectsRoot(), realWork, name);
  if (sessions.length > 1) {
    throw new MxError(
      `work "${name}" has ${sessions.length} Claude sessions named "${name}" — resume one manually ` +
        `(list them with \`lcs ${name}\`, then \`claude --resume <id>\`)`,
      'MULTIPLE_SESSIONS',
    );
  }
  if (sessions.length === 1) {
    return { command: `claude --resume ${shq(sessions[0].id)}`, action: 'resume', sessionId: sessions[0].id };
  }
  // No existing session — create one named after the work, optionally seeded.
  const prompt = resolveInitialPrompt(root, name, workFolder, flags);
  if (!prompt) return { command: `claude -n ${shq(name)}`, action: 'create' };
  const promptFile = path.join(workFolder, 'tmp', `.mx-session-prompt-${process.pid}`);
  fs.mkdirSync(path.dirname(promptFile), { recursive: true });
  fs.writeFileSync(promptFile, prompt);
  // The Terminal shell reads the prompt from the file, deletes it, then hands it
  // to claude as the first message — preserving newlines/quotes with no inline
  // escaping. `"$(...)"` keeps the whole file content as one argument.
  const command = `claude -n ${shq(name)} "$(cat ${shq(promptFile)}; rm -f ${shq(promptFile)})"`;
  return { command, action: 'create' };
}

/**
 * Dispatch the `mx work` subcommands. `new`/`ls` are component-level; all other
 * actions target a work via `-n` or infer it from the cwd.
 *
 * @param positionals - Positional args (positionals[1] is the work action).
 * @param flags - Parsed flags.
 */
export function dispatchWork(positionals: string[], flags: Flags): void {
  // `mx work -n <name> -o` (no explicit action) is shorthand for `… open`.
  let action = positionals[1];
  if (!action && flags.open) action = 'open';

  if (action === 'new') {
    const root = requireRuntime({ runtime: flags.runtime });
    const name = need(
      positionals[2],
      'usage: mx work new <name> [<repo>[:<branch>]]... [--description <text>] [--branch <b>] [--base <ref>] [-o|--open]',
    );
    // Positionals after the name are optional initial worktrees. Each is a
    // pristine repo, optionally `<repo>:<branch>`; the branch defaults to
    // --branch (a default for all) or, failing that, the work name.
    const specs = positionals.slice(3).map(parseInitWorktreeSpec);
    // Fail fast BEFORE creating anything: every repo must exist and appear once
    // (one initial worktree per repo). This avoids leaving a half-built work.
    if (specs.length) {
      const known = new Set(listRepoNames(root));
      const seen = new Set<string>();
      for (const s of specs) {
        if (!known.has(s.repo)) throw new MxError(`no such repo: ${s.repo}`, 'NO_REPO');
        if (seen.has(s.repo)) {
          throw new MxError(
            `repo "${s.repo}" listed more than once — pass it once (one initial worktree per repo)`,
            'BAD_ARGS',
          );
        }
        seen.add(s.repo);
      }
    }
    const res = workNew(root, name, flags.description ?? '');
    // Create each requested worktree, firing the create hooks per worktree.
    const created: WorktreeAddResult[] = [];
    for (const s of specs) {
      const branch = s.branch ?? flags.branch ?? name;
      const base = s.base ?? flags.base; // per-repo base wins; else the --base default; else pristine HEAD
      created.push(createWorktreeFiringHooks(root, name, s.repo, s.repo, branch, base, flags.porcelain));
    }
    emit(() => {
      console.log(`${check()} created work ${bold(res.name)}`);
      console.log(`  ${dim(res.path)}`);
      for (const wt of created) {
        const label = wt.name === wt.repo ? wt.repo : `${wt.name} (${wt.repo})`;
        console.log(`  ${dim(`+ ${label}`)}  ${dim(`[${wt.branch}]`)}`);
      }
    }, { ...workInfo(root, name), path: res.path });
    if (flags.open) {
      // Best-effort: the work is already created, so a window-management
      // failure (or a non-macOS host) is a warning, never a hard error. A brand
      // new work has no sessions yet, so this always creates one named after it.
      try {
        const launch = resolveSessionLaunch(root, res.name, res.path, flags);
        openWorkLayout(res.path, { command: launch.command });
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(`${warn()} ${dim(`could not open layout: ${msg}`)}\n`);
      }
    }
    return;
  }

  if (action === 'ls') {
    const root = requireRuntime({ runtime: flags.runtime });
    // Default: active works only. --all expands to include archived;
    // --archived narrows to archived-only.
    const works = listWorksInfo(root, {
      includeArchived: flags.all,
      onlyArchived: flags.archived,
    });
    emit(() => {
      // Human mode: detailed per-work view — header line with name + chip +
      // counts; then optional description; then indented worktree rows with
      // branches and ports. Active works first, archived after; alphabetical
      // within each group. Porcelain consumers see the raw order above.
      const ordered = [
        ...works.filter((w) => w.isArchived !== true),
        ...works.filter((w) => w.isArchived === true),
      ];
      if (ordered.length === 0) {
        console.log(dim('no works yet — `mx work new <name>`'));
        return;
      }
      for (let i = 0; i < ordered.length; i++) {
        if (i > 0) console.log();
        const w = ordered[i];
        const wts = w.worktrees ?? [];

        const chip = w.isArchived === true
          ? `  ${dim(`[archived ${(w.archived_at ?? '').slice(0, 10)}]`)}`
          : '';
        // Active work names anchor with bold; archived ones recede with dim
        // so the eye lands on active works first. The bullet is the list
        // marker.
        const styledName = w.isArchived === true ? dim(w.name) : bold(w.name);
        console.log(`• ${styledName}${chip}`);
        console.log(`  ${dim(tildify(w.path))}`);

        if (w.description) {
          console.log(`  ${dim(`— ${w.description}`)}`);
        }

        if (wts.length === 0) {
          console.log(`  ${dim('(no worktrees)')}`);
        } else {
          // Row label is the worktree name; annotate the repo when it differs.
          const wlabel = (t: (typeof wts)[number]): string => {
            const n = t.name ?? t.repo;
            return n === t.repo ? n : `${n} (${t.repo})`;
          };
          const labelW = Math.max(...wts.map((t) => wlabel(t).length));
          for (const t of wts) {
            // All worktree row content sits at the dim tier so the bold work
            // name above is the only "loud" element in the block.
            const label = dim(wlabel(t).padEnd(labelW));
            const branch = dim(`[${t.branch}]`);
            const ports = Object.entries(t.ports ?? {})
              .map(([s, p]) => `${dim(`${s}:${p}`)}`)
              .join('  ');
            const portsCol = ports ? `  ${ports}` : '';
            console.log(`  ${label}  ${branch}${portsCol}`);
          }
        }
      }
    }, works);
    return;
  }

  if (action === 'health') {
    // With -n (or cwd) → one work's detail block. Without → the same block for
    // every active work (and archived too with --all), one after another.
    const root = requireRuntime({ runtime: flags.runtime });
    const name = flags.name || inferContext(root).work;
    if (name) {
      const h = workHealth(root, name);
      emit(() => renderWorkHealthDetail(h), h);
    } else {
      const list = listWorkHealth(root, { includeArchived: flags.all });
      emit(() => {
        if (list.length === 0) {
          console.log(dim('no works yet — `mx work new <name>`'));
          return;
        }
        list.forEach((h, i) => {
          if (i > 0) console.log();
          renderWorkHealthDetail(h);
        });
      }, list);
    }
    return;
  }

  // All remaining work actions target an existing work via -n <name>, or the
  // work inferred from the cwd when you're inside a work folder / worktree.
  const root = requireRuntime({ runtime: flags.runtime });
  const name = need(
    flags.name || inferContext(root).work,
    `which work? pass -n <name> or run inside a work folder (mx work -n <name> ${action ?? '<command>'})`,
  );

  switch (action) {
    case 'info': {
      const work = workInfo(root, name);
      emit(() => {
        const archivedChip = work.isArchived === true
          ? `  ${dim(`[archived ${(work.archived_at ?? '').slice(0, 10)}]`)}`
          : '';
        const styledName = work.isArchived === true ? dim(work.name) : bold(work.name);
        console.log(`${styledName}${archivedChip}`);
        if (work.description) console.log(`  ${dim('description')}  ${dim(work.description)}`);
        const wts = work.worktrees ?? [];
        console.log(`  ${dim('worktrees  ')}  ${dim(`${wts.length}`)}`);
        for (const wt of wts) {
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${dim(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          const wn = wt.name ?? wt.repo;
          const label = wn === wt.repo ? wt.repo : `${wn} (${wt.repo})`;
          console.log(`      ${dim(label)}  ${dim(`[${wt.branch}]`)}${portsCol}`);
        }
      }, work);
      return;
    }
    case 'path': {
      // Raw path — meant for shell substitution, no styling.
      const res = workPath(root, name);
      emit(() => console.log(res.path), res);
      return;
    }
    case 'open': {
      // Open an existing work in a fullscreen Terminal, resuming its Claude
      // session (named after the work) or creating one if none exists.
      const res = workPath(root, name); // throws NO_WORK if it doesn't exist
      // Session resolution runs OUTSIDE the best-effort try: an ambiguous
      // `MULTIPLE_SESSIONS` is a real error the user must act on, not a warning.
      const launch = resolveSessionLaunch(root, name, res.path, flags);
      try {
        openWorkLayout(res.path, { command: launch.command });
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(`${warn()} ${dim(`could not open layout: ${msg}`)}\n`);
        return;
      }
      emit(() => {
        const how =
          launch.action === 'resume'
            ? `resumed session ${dim(launch.sessionId!.slice(0, 8))}`
            : 'new session';
        console.log(`${check()} opened ${bold(name)} ${dim(`(${how})`)}`);
      }, { work: name, opened: true, action: launch.action, sessionId: launch.sessionId });
      return;
    }
    case 'describe': {
      const text = need(positionals[2], 'usage: mx work -n <name> describe <text>');
      const work = workDescribe(root, name, text);
      emit(() => console.log(`${check()} updated description of ${bold(name)}`), work);
      return;
    }
    case 'worktree':
      return workWorktree(root, name, positionals, flags);
    case 'port':
      return workPort(root, name, positionals);
    case 'destroy': {
      if (flags.force && !flags.porcelain) {
        // Loud reminder right before the irreversible step. Goes to stderr so
        // --porcelain consumers stay clean even if --force is set.
        process.stderr.write(
          `${warn()} ${dim(`permanently removing work "${name}" — folder and any session summaries will be deleted (branches kept). This cannot be undone.`)}\n`,
        );
      }
      const res = workDestroy(root, name, { force: flags.force });
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} destroyed work ${bold(name)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
      }, res);
      return;
    }
    case 'archive': {
      // Confirm first — before any real work. The user can pre-confirm with
      // --yes (required when stdin isn't a TTY or in --porcelain mode).
      if (!flags.yes) {
        if (flags.porcelain || !process.stdin.isTTY) {
          throw new MxError(
            `archive requires confirmation — pass --yes when running non-interactively or with --porcelain`,
            'NEED_CONFIRMATION',
          );
        }
        process.stderr.write(`${warn()} About to archive work ${bold(name)}.\n`);
        process.stderr.write(
          `${dim(`  Worktrees will be removed; folder, work.json, branches, and sessions/ are preserved.`)}\n`,
        );
        process.stderr.write(
          `${dim(`  Make sure any pending session summary is written into works/${name}/sessions/ first.`)}\n`,
        );
        process.stderr.write('\n');
        if (!confirmYesNo('Proceed? (y/N) ')) {
          process.stderr.write(`${dim('Aborted.')}\n`);
          return;
        }
      }
      // pre-work-archive hook runs while worktrees are still intact; a non-zero
      // exit vetoes the archive. Skip it when the work is already archived so a
      // side-effecting hook never fires on a no-op — core throws ALREADY_ARCHIVED.
      const archiveHookEnv = { MX_WORK: name, MX_WORK_PATH: workPath(root, name).path };
      if (workInfo(root, name).isArchived !== true) {
        runPreHook(root, 'pre-work-archive', { cwd: archiveHookEnv.MX_WORK_PATH, env: archiveHookEnv }, flags.porcelain);
      }
      const res = archiveWork(root, name);
      runPostHook(root, 'post-work-archive', { cwd: archiveHookEnv.MX_WORK_PATH, env: archiveHookEnv }, flags.porcelain);
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} archived work ${bold(name)}`);
        console.log(`  ${dim(`at ${res.archived_at}`)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
      }, res);
      return;
    }
    case 'unarchive': {
      // Positionals after `unarchive` are `repo=branch` overrides for repos
      // whose recorded branch is gone. Without overrides, unarchive uses the
      // branches recorded in work.json.
      const overrides: Record<string, string> = {};
      for (const tok of positionals.slice(2)) {
        const eq = tok.indexOf('=');
        if (eq <= 0 || eq === tok.length - 1) {
          throw new MxError(
            `bad override: "${tok}" — expected <worktree>=<branch>`,
            'BAD_ARGS',
          );
        }
        overrides[tok.slice(0, eq)] = tok.slice(eq + 1);
      }
      // pre-work-unarchive hook runs before any worktree is re-created; a
      // non-zero exit vetoes it. Skip when the work isn't archived so a
      // side-effecting hook never fires on a no-op — core throws NOT_ARCHIVED.
      const unarchiveHookEnv = { MX_WORK: name, MX_WORK_PATH: workPath(root, name).path };
      if (workInfo(root, name).isArchived === true) {
        runPreHook(root, 'pre-work-unarchive', { cwd: unarchiveHookEnv.MX_WORK_PATH, env: unarchiveHookEnv }, flags.porcelain);
      }
      const res = unarchiveWork(root, name, overrides);
      // Each restored worktree is freshly re-created (ports were freed on
      // archive), so fire post-worktree-create per worktree — the user
      // re-hydrates and re-allocates ports there, exactly like a fresh add.
      for (const r of res.restored) {
        runPostHook(
          root,
          'post-worktree-create',
          {
            cwd: r.path,
            env: worktreeHookEnv(name, r.repo, r.name, r.branch, r.path, unarchiveHookEnv.MX_WORK_PATH, repoGitDir(root, r.repo)),
          },
          flags.porcelain,
        );
      }
      runPostHook(root, 'post-work-unarchive', { cwd: unarchiveHookEnv.MX_WORK_PATH, env: unarchiveHookEnv }, flags.porcelain);
      emit(() => {
        console.log(`${check()} unarchived work ${bold(name)}`);
        for (const r of res.restored) {
          const label = r.name === r.repo ? r.repo : `${r.name} (${r.repo})`;
          console.log(`  ${dim(label)}  ${dim(`[${r.branch}]`)}  ${dim(`→ ${r.path}`)}`);
        }
      }, res);
      return;
    }
    default:
      throw new MxError(`unknown work command: ${action ?? '(none)'}`, 'BAD_ARGS');
  }
}

/**
 * Render the detail-mode `mx work health` output: a structured per-metric block
 * with ✓/⚠ markers, then a per-worktree presence/ports listing, the issue list
 * when unhealthy, and the captured `work-health` hook output. Mirrors the
 * `mx repo health` detail layout so both views read the same.
 *
 * @param h - The work health snapshot.
 * @param indent - Left padding prefixed to every line (used by `mx health` to
 *   nest each block under its section header). Blank lines stay blank.
 */
export function renderWorkHealthDetail(h: WorkHealth, indent = ''): void {
  const log = (s = ''): void => console.log(s === '' ? '' : indent + s);
  type Row = { label: string; value: string; marker?: string; hint?: string };
  const rows: Row[] = [];
  // Tracks whether any checked row (or the hook `extra`) flagged a problem, so
  // the name line can carry an at-a-glance ✓/⚠ for the whole block.
  let anyWarn = false;
  const addRow = (label: string, value: string, ok?: boolean, hint?: string): void => {
    const marker = ok === undefined ? undefined : ok ? check() : warn();
    if (ok === false) anyWarn = true;
    rows.push({ label, value, marker, hint });
  };

  // Only health metrics (rows that carry a ✓/⚠) are shown — informational
  // fields like status and the port count live in `mx work info`. Each check's
  // detail rides inline as a hint on its row (no separate "issues" block), same
  // style as `mx repo health`. The worktrees row's ✓/⚠ is whether they're all
  // as expected (present for an active work, gone for an archived one).
  const wtAllExpected = h.worktrees.every((w) => (h.archived ? !w.present : w.present));
  const offCount = h.archived
    ? h.worktrees.filter((w) => w.present).length
    : h.worktrees.filter((w) => !w.present).length;
  addRow(
    'worktrees',
    String(h.worktrees.length),
    wtAllExpected,
    wtAllExpected ? undefined : `${offCount} ${h.archived ? 'still on disk' : 'missing on disk'}`,
  );
  // For an archived work, pinned ports are a problem (should be freed); for an
  // active work the port count isn't a health metric, so it isn't shown.
  if (h.archived) {
    addRow(
      'ports',
      String(h.ports.length),
      h.ports.length === 0,
      h.ports.length === 0 ? undefined : 'should be freed on archive',
    );
  }
  addRow(
    'stray entries',
    String(h.strayEntries.length),
    h.strayEntries.length === 0,
    h.strayEntries.length === 0 ? undefined : h.strayEntries.join(', '),
  );
  addRow(
    'port conflicts',
    String(h.portConflicts.length),
    h.portConflicts.length === 0,
    h.portConflicts.length === 0
      ? undefined
      : h.portConflicts.map((c) => `${c.port} with ${c.otherWork} (${c.otherOwner})`).join('; '),
  );

  // The central work-health hook output becomes a trailing `extra` row, always
  // shown: a healthy hook says nothing — empty output or a bare "ok"/"OK"
  // renders ✓ "OK"; anything else renders ⚠ with the message and flags the block.
  const extraText = (h.extra ?? '').replace(/\s+$/, '');
  const extraOk = extraText === '' || extraText.toLowerCase() === 'ok';
  const extraLines = extraOk ? [] : extraText.split('\n');
  if (!extraOk) anyWarn = true;

  // Show only metric rows (those carrying a ✓/⚠); `extra` is always shown below.
  const metricRows = rows.filter((r) => r.marker !== undefined);
  const labelW = Math.max(...metricRows.map((r) => r.label.length), 5);
  const valueW = Math.max(0, ...metricRows.map((r) => r.value.length));

  const chip = h.archived ? `  ${dim('[archived]')}` : '';
  log(`${h.archived ? dim(h.name) : bold(h.name)}${chip}  ${anyWarn ? warn() : check()}`);
  for (const r of metricRows) {
    const label = dim(r.label.padEnd(labelW));
    const value = r.value.padEnd(valueW);
    const marker = r.marker ? `  ${r.marker}` : '   ';
    const hint = r.hint ? `  ${dim(r.hint)}` : '';
    log(`  ${label}  ${value}${marker}${hint}`);
  }
  // Extra row: ✓ "OK" when the hook reported healthy, ⚠ + message when it did not.
  const extraValue = (extraOk ? 'OK' : extraLines[0]).padEnd(valueW);
  log(`  ${dim('extra'.padEnd(labelW))}  ${dim(extraValue)}  ${extraOk ? check() : warn()}`);
  for (const line of extraLines.slice(1)) log(`  ${' '.repeat(labelW)}  ${dim(line)}`);
}

/**
 * Create one worktree, firing the surrounding `pre/post-worktree-create` hooks.
 * Shared by `mx work worktree add` and `mx work new`'s initial worktrees; does
 * **not** emit output — the caller formats it (so `work new` can print a single
 * combined result and keep `--porcelain` to one JSON object).
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param repo - Pristine repo to fork from.
 * @param wtName - Worktree name (the `wt/<name>` selector; usually the repo name).
 * @param branch - Fully-resolved branch the worktree should be on.
 * @param base - Base ref to fork from, or undefined for the pristine HEAD.
 * @param porcelain - When true, run hooks quietly (keeps stdout a single JSON object).
 * @returns The created worktree's details.
 */
function createWorktreeFiringHooks(
  root: string,
  name: string,
  repo: string,
  wtName: string,
  branch: string,
  base: string | undefined,
  porcelain: boolean,
): WorktreeAddResult {
  const workFolder = workPath(root, name).path;
  const dest = worktreePath(root, name, wtName);
  const gitDir = repoGitDir(root, repo);
  // pre-worktree-create: a non-zero exit vetoes creation (nothing made yet).
  runPreHook(
    root,
    'pre-worktree-create',
    { cwd: workFolder, env: worktreeHookEnv(name, repo, wtName, branch, dest, workFolder, gitDir, base) },
    porcelain,
  );
  const res = worktreeAdd(root, name, repo, { name: wtName === repo ? undefined : wtName, branch, base });
  // post-worktree-create (the "hydrate" step): runs in the new worktree; a
  // non-zero exit is only a warning, worktree kept.
  runPostHook(
    root,
    'post-worktree-create',
    { cwd: res.path, env: worktreeHookEnv(name, res.repo, res.name, res.branch, res.path, workFolder, gitDir, base) },
    porcelain,
  );
  return res;
}

/**
 * Handle `mx work -n <name> worktree add|ls|rm`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param positionals - Positional args (positionals[2] is the worktree action).
 * @param flags - Parsed flags (provides --branch/--base for add).
 */
function workWorktree(root: string, name: string, positionals: string[], flags: Flags): void {
  const sub = positionals[2];
  switch (sub) {
    case 'add': {
      const repo = need(
        positionals[3],
        'usage: mx work -n <name> worktree add <repo> [<worktree-name>] [--branch <b>] [--base <ref>]',
      );
      const wtName = positionals[4] || repo; // optional name; defaults to repo
      const branch = flags.branch || name; // mirrors worktreeAdd's default
      const res = createWorktreeFiringHooks(root, name, repo, wtName, branch, flags.base, flags.porcelain);
      emit(
        () => {
          const label = res.name === res.repo ? bold(res.repo) : `${bold(res.name)} ${dim(`(${res.repo})`)}`;
          console.log(`${check()} added worktree ${label} ${dim(`[${res.branch}]`)} ${dim(`→ ${res.path}`)}`);
        },
        res,
      );
      return;
    }
    case 'ls': {
      const list = worktreeList(root, name);
      emit(() => {
        if (list.length === 0) {
          console.log(dim('no worktrees yet — `mx work -n <name> worktree add <repo>`'));
          return;
        }
        // Show the worktree name; annotate the repo when it differs.
        const label = (wt: (typeof list)[number]): string => {
          const n = wt.name ?? wt.repo;
          return n === wt.repo ? n : `${n} (${wt.repo})`;
        };
        const w = Math.max(...list.map((wt) => label(wt).length));
        for (const wt of list) {
          const branch = dim(`[${wt.branch}]`);
          const ports = Object.entries(wt.ports ?? {})
            .map(([s, p]) => `${dim(`${s}:`)}${dim(String(p))}`)
            .join('  ');
          const portsCol = ports ? `  ${ports}` : '';
          console.log(`${dim(label(wt).padEnd(w))}  ${branch}${portsCol}`);
        }
      }, list);
      return;
    }
    case 'set-branch': {
      // Metadata-only: the user has already `git checkout`-ed a new branch in
      // the worktree; this re-records it in work.json. The optional branch arg
      // is a guard validated against the worktree's live branch (see core).
      const usage = 'usage: mx work -n <name> worktree set-branch <worktree> [<branch>]';
      const wtName = need(positionals[3], usage);
      const expected = positionals[4]; // optional; must match the live branch when given
      const res = worktreeSetBranch(root, name, wtName, expected);
      emit(
        () => {
          const label = res.name === res.repo ? bold(res.repo) : `${bold(res.name)} ${dim(`(${res.repo})`)}`;
          if (res.changed) {
            console.log(`${check()} ${label} ${dim(`[${res.previous}]`)} ${dim('→')} ${dim(`[${res.branch}]`)}`);
          } else {
            console.log(`${check()} ${label} ${dim(`already recorded on [${res.branch}]`)}`);
          }
        },
        res,
      );
      return;
    }
    case 'rm': {
      const wtName = need(positionals[3], 'usage: mx work -n <name> worktree rm <worktree-name>');
      const wt = worktreeList(root, name).find((w) => (w.name ?? w.repo) === wtName);
      const workFolder = workPath(root, name).path;
      const dest = worktreePath(root, name, wtName);
      const repo = wt?.repo ?? wtName;
      const gitDir = repoGitDir(root, repo);
      const branch = wt?.branch ?? '';
      // pre-worktree-remove: worktree still on disk; non-zero vetoes removal.
      runPreHook(
        root,
        'pre-worktree-remove',
        { cwd: fs.existsSync(dest) ? dest : workFolder, env: worktreeHookEnv(name, repo, wtName, branch, dest, workFolder, gitDir) },
        flags.porcelain,
      );
      const res = worktreeRemove(root, name, wtName);
      emit(
        () => {
          const label = res.name === res.repo ? bold(res.repo) : `${bold(res.name)} ${dim(`(${res.repo})`)}`;
          console.log(`${check()} removed worktree ${label} ${dim(`from ${name} (branch ${res.branch} kept)`)}`);
        },
        res,
      );
      runPostHook(
        root,
        'post-worktree-remove',
        { cwd: workFolder, env: worktreeHookEnv(name, res.repo, res.name, res.branch, dest, workFolder, gitDir) },
        flags.porcelain,
      );
      return;
    }
    default:
      throw new MxError(`unknown worktree command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}

/**
 * Handle `mx work -n <name> port set|unset|ls`.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param positionals - Positional args (positionals[2] is the port action).
 */
function workPort(root: string, name: string, positionals: string[]): void {
  const sub = positionals[2];
  switch (sub) {
    case 'set': {
      const usage = 'usage: mx work -n <name> port set <worktree> <service> [<port>]';
      const wtName = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const portArg = positionals[5];
      let port: number | undefined;
      if (portArg != null) {
        port = Number(portArg);
        if (!Number.isInteger(port)) throw new MxError(`invalid port: ${portArg}`, 'BAD_ARGS');
      }
      const res = portSet(root, name, wtName, service, port);
      emit(
        () =>
          console.log(
            `${check()} ${res.name}${dim('.')}${res.service} ${dim('→')} ${dim(String(res.port))}`,
          ),
        res,
      );
      return;
    }
    case 'unset': {
      const usage = 'usage: mx work -n <name> port unset <worktree> <service>';
      const wtName = need(positionals[3], usage);
      const service = need(positionals[4], usage);
      const res = portUnset(root, name, wtName, service);
      emit(
        () =>
          console.log(
            `${check()} unset ${res.name}${dim('.')}${res.service} ${dim(`(was ${res.released})`)}`,
          ),
        res,
      );
      return;
    }
    case 'ls': {
      const map = portList(root, name);
      emit(() => {
        const entries: { wt: string; service: string; port: number }[] = [];
        for (const [wt, ports] of Object.entries(map)) {
          for (const [service, port] of Object.entries(ports)) {
            entries.push({ wt, service, port });
          }
        }
        if (entries.length === 0) {
          console.log(dim('no ports allocated yet — `mx work -n <name> port set <worktree> <service>`'));
          return;
        }
        const lhsW = Math.max(...entries.map((e) => `${e.wt}.${e.service}`.length));
        for (const e of entries) {
          const lhs = `${e.wt}${dim('.')}${e.service}`;
          // padEnd works on visible length only since dim() adds invisible ANSI; pad
          // the plain "worktree.service" then re-render.
          const plain = `${e.wt}.${e.service}`;
          const pad = ' '.repeat(lhsW - plain.length);
          console.log(`${lhs}${pad}  ${dim('→')}  ${dim(String(e.port))}`);
        }
      }, map);
      return;
    }
    default:
      throw new MxError(`unknown port command: ${sub ?? '(none)'}`, 'BAD_ARGS');
  }
}
