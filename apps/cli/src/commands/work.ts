import {
  requireRuntime,
  inferContext,
  workNew,
  listRepoNames,
  parseInitWorktreeSpec,
  listWorksInfo,
  listWorkNames,
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
import { spawnWorkTerminal, shq } from '../open';
import {
  requireTmux,
  hasSession,
  buildSession,
  attachOrSwitch,
  killSession,
  busyPanes,
  sessionFor,
  listMxSessions,
  sessionEnv,
  fzfPick,
  fzfAvailable,
} from '../tmux';
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
 * Canonicalize a path for comparison, tolerating a missing target (falls back
 * to the resolved-but-not-real path). Used to compare a session's `MX_RUNTIME`
 * against the current runtime root despite symlinks (macOS `/tmp` ->
 * `/private/tmp`).
 *
 * @param p - The path to canonicalize.
 * @returns The realpath when it exists, else the absolute path.
 */
function canonical(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Whether a live mx tmux session belongs to the given runtime, judged by the
 * `MX_RUNTIME` mx seeds into every session it builds:
 *
 * - `true` — the session reports this runtime;
 * - `false` — it reports a *different* runtime (e.g. a same-named work in another
 *   runtime sharing the tmux server) and must not be touched;
 * - `null` — the session has no `MX_RUNTIME` (can't tell).
 *
 * `mx work gc` only prunes a *destroyed*-work session on a `true`, so it never
 * kills another runtime's session; `mx work switch` treats non-`false` as
 * candidates.
 *
 * @param session - The tmux session name.
 * @param root - The current runtime root.
 * @returns Ownership verdict as described.
 */
function sessionBelongsTo(session: string, root: string): boolean | null {
  const rt = sessionEnv(session, 'MX_RUNTIME');
  if (rt == null || rt === '') return null;
  return canonical(rt) === canonical(root);
}

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
 * The resolved `claude` command a work's main pane runs, plus whether it
 * resumes an existing conversation or creates a fresh one.
 */
interface ClaudeLaunch {
  /** Shell command the main pane runs (a `claude` invocation). */
  command: string;
  /** Whether an existing session is resumed or a fresh one is created. */
  action: 'resume' | 'create';
  /** The resumed session's id, when resuming (unknown on a fresh create — Claude assigns it). */
  sessionId?: string;
}

/**
 * Resolve the `claude` command for a work's session — **resume the existing
 * session named after the work when there is one, otherwise create a new one**
 * with the work name as its display name. The whole model is one name per work:
 *
 * - **Resume.** If a Claude session whose display name equals the work name
 *   exists in the work's project directory, run `claude --resume <work>`. Claude
 *   Code resolves `--resume` by session title, so this reattaches the work's
 *   conversation by name — covering a session created by this flow *and* any
 *   older one (the pre-tmux `mx work open`, or a `claude` you ran in the folder
 *   by hand), since those are named after the work too. In the rare case of two
 *   sessions sharing the name, Claude Code shows its picker — an acceptable
 *   worst case.
 * - **Create.** With no such session, run `claude -n <work>` (Claude assigns the
 *   id; we only pin the name), seeded with the resolved initial prompt (from
 *   `--prompt` or the `session-prompt` hook) when there is one.
 *
 * The existence check (`findSessionsByName`) is what keeps `--resume` from
 * running when there's nothing to resume, and decides whether to seed a prompt.
 * When creating with a prompt, the prompt is written to a throwaway file under
 * the work's `tmp/` and the launched shell reads-then-removes it — keeping
 * arbitrary multi-line prompt text out of the command line entirely.
 *
 * @param root - Runtime root.
 * @param name - Work name (also the session's display name).
 * @param workFolder - Absolute work folder path (the pane's cwd).
 * @param flags - Parsed flags (provides `--prompt` / `--porcelain`).
 * @returns The command to run plus whether it resumes or creates.
 */
function resolveClaudeCommand(
  root: string,
  name: string,
  workFolder: string,
  flags: Flags,
): ClaudeLaunch {
  // Claude keys its project dir off the realpath'd cwd (macOS /tmp -> /private/tmp).
  let realWork = workFolder;
  try {
    realWork = fs.realpathSync(workFolder);
  } catch {
    // Fall back to the given path; the lookup just won't match if it's wrong.
  }
  // Resume by NAME when a session named after the work already exists.
  const named = findSessionsByName(claudeProjectsRoot(), realWork, name);
  if (named.length >= 1) {
    return { command: `claude --resume ${shq(name)}`, action: 'resume', sessionId: named[0].id };
  }
  // Nothing to resume — create a session named after the work (Claude assigns the id).
  const create = `claude -n ${shq(name)}`;
  const prompt = resolveInitialPrompt(root, name, workFolder, flags);
  if (!prompt) return { command: create, action: 'create' };
  const promptFile = path.join(workFolder, 'tmp', `.mx-session-prompt-${process.pid}`);
  fs.mkdirSync(path.dirname(promptFile), { recursive: true });
  fs.writeFileSync(promptFile, prompt);
  // The pane's shell reads the prompt from the file, deletes it, then hands it to
  // claude as the first message — preserving newlines/quotes with no inline
  // escaping. `"$(...)"` keeps the whole file content as one argument.
  const command = `${create} "$(cat ${shq(promptFile)}; rm -f ${shq(promptFile)})"`;
  return { command, action: 'create' };
}

/**
 * Outcome of ensuring a work's tmux session exists.
 */
interface EnsureResult {
  /** The tmux session name (`mx/<work>`). */
  session: string;
  /** Whether this call built the session (true) or it already existed (false). */
  created: boolean;
  /** How the Claude pane was launched when the session was built (undefined when it already existed). */
  claudeAction?: 'resume' | 'create';
}

/**
 * Ensure a work's tmux session exists, building it (and firing the
 * `work-session` hook) when missing. Idempotent and self-healing: after a reboot
 * or a manual `tmux kill-session`, the next call simply rebuilds the layout. Does
 * **not** attach — the caller attaches (in-place) or opens a terminal that does.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param workFolder - Absolute work folder path.
 * @param flags - Parsed flags.
 * @returns The session name and whether it was freshly built.
 */
function ensureWorkSession(root: string, name: string, workFolder: string, flags: Flags): EnsureResult {
  requireTmux();
  const session = sessionFor(name);
  if (hasSession(session)) return { session, created: false };
  const launch = resolveClaudeCommand(root, name, workFolder, flags);
  // Flatten every worktree's allocated ports into MX_PORT_* handles for the panes.
  const ports: { worktree: string; service: string; port: number }[] = [];
  for (const wt of workInfo(root, name).worktrees ?? []) {
    const wtName = wt.name ?? wt.repo;
    for (const [service, port] of Object.entries(wt.ports ?? {})) {
      ports.push({ worktree: wtName, service, port });
    }
  }
  buildSession(session, {
    root,
    work: name,
    workPath: workFolder,
    claudeCmd: launch.command,
    claudeSessionId: launch.sessionId,
    ports,
  });
  // work-session hook (best-effort): the user can rearrange/extend the layout.
  runPostHook(
    root,
    'work-session',
    {
      cwd: workFolder,
      env: {
        MX_WORK: name,
        MX_WORK_PATH: workFolder,
        MX_TMUX_SESSION: session,
        // Known only when resuming an existing session; empty on a fresh create
        // (Claude assigns the id).
        MX_CLAUDE_SESSION_ID: launch.sessionId ?? '',
      },
    },
    flags.porcelain,
  );
  return { session, created: true, claudeAction: launch.action };
}

/**
 * Open a work: ensure its tmux session exists, then hand a **new terminal
 * window** to it (macOS fullscreen Terminal; a Linux emulator via
 * `$MX_TERMINAL` or a built-in list). Best-effort on the window step — the
 * session already exists, so a launch failure downgrades to a warning pointing
 * at `mx work -n <name> attach`, which always works in-place.
 *
 * @param root - Runtime root.
 * @param name - Work name.
 * @param workFolder - Absolute work folder path.
 * @param flags - Parsed flags.
 * @returns The ensure result (session name, created/attach state).
 */
export function openWorkInTerminal(root: string, name: string, workFolder: string, flags: Flags): EnsureResult {
  const res = ensureWorkSession(root, name, workFolder, flags);
  // The new terminal re-invokes this CLI to attach. MX_RUNTIME is passed inline
  // because macOS `do script` (and a detached Linux shell) start a fresh login
  // shell that won't inherit our environment.
  const attachCmd =
    `MX_RUNTIME=${shq(root)} ${shq(process.execPath)} ${shq(process.argv[1])} ` +
    `work -n ${shq(name)} attach`;
  spawnWorkTerminal(attachCmd);
  return res;
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
      // Best-effort window step: the work is already created, so failing to
      // spawn a terminal (or a missing emulator) is a warning pointing at the
      // always-works in-place `attach`. Ensuring the session itself surfaces a
      // real tmux error (e.g. tmux not installed).
      try {
        openWorkInTerminal(root, res.name, res.path, flags);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(
          `${warn()} ${dim(`could not open a terminal: ${msg}`)}\n` +
            `${dim(`  run \`mx work -n ${res.name} attach\` in a terminal instead.`)}\n`,
        );
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

  if (action === 'switch') {
    // Jump between works' tmux sessions. With an explicit name it's `attach`;
    // without one, an fzf picker over the runtime's live mx sessions.
    const root = requireRuntime({ runtime: flags.runtime });
    requireTmux();
    const explicit = flags.name || positionals[2] || inferContext(root).work;
    if (explicit) {
      const res = workPath(root, explicit);
      const ensured = ensureWorkSession(root, explicit, res.path, flags);
      if (flags.porcelain) {
        emit(() => {}, { work: explicit, session: ensured.session, created: ensured.created, attach: false });
        return;
      }
      attachOrSwitch(ensured.session);
      return;
    }
    // Picker: this runtime's live sessions — include those with no MX_RUNTIME
    // (can't tell), exclude only sessions that explicitly report another runtime.
    const mine = listMxSessions().filter((s) => sessionBelongsTo(s.session, root) !== false);
    if (mine.length === 0) {
      emit(() => console.log(dim('no live mx sessions — `mx work -n <name> attach` to start one')), { sessions: [] });
      return;
    }
    if (flags.porcelain) {
      // Non-interactive: just list the candidates; the caller picks + attaches.
      emit(() => {}, { sessions: mine.map((s) => ({ work: s.work, session: s.session, attached: s.attached })) });
      return;
    }
    if (!fzfAvailable()) {
      process.stderr.write(`${warn()} ${dim('install fzf for a picker, or pass a name: `mx work switch <name>`')}\n`);
      emit(() => {
        for (const s of mine) console.log(`  ${bold(s.work)}${s.attached ? dim('  (attached)') : ''}`);
      }, { sessions: mine.map((s) => ({ work: s.work, session: s.session, attached: s.attached })) });
      return;
    }
    const pick = fzfPick(mine.map((s) => s.work), 'mx work> ');
    if (!pick) return; // cancelled
    attachOrSwitch(sessionFor(pick));
    return;
  }

  if (action === 'gc') {
    // Prune orphaned mx tmux sessions: those whose work (in THIS runtime) is
    // archived or no longer exists. Active works with a live session are healthy.
    const root = requireRuntime({ runtime: flags.runtime });
    requireTmux();
    const known = new Set(listWorkNames(root));
    const orphans: { session: string; work: string; reason: 'archived' | 'destroyed'; busy: string[] }[] = [];
    for (const s of listMxSessions()) {
      const belongs = sessionBelongsTo(s.session, root);
      if (known.has(s.work)) {
        // A work in this runtime — only an orphan if it's archived (a session
        // shouldn't outlive the archive). Skip a same-named work in another
        // runtime whose session explicitly reports a different MX_RUNTIME.
        if (belongs === false) continue;
        if (workInfo(root, s.work).isArchived === true) {
          orphans.push({ session: s.session, work: s.work, reason: 'archived', busy: busyPanes(s.session) });
        }
      } else if (belongs === true) {
        // Work is gone from this runtime and the session says it's ours → destroyed.
        orphans.push({ session: s.session, work: s.work, reason: 'destroyed', busy: busyPanes(s.session) });
      }
    }
    if (orphans.length === 0) {
      emit(() => console.log(`${check()} no orphaned mx sessions`), { pruned: [] });
      return;
    }
    // Killing sessions is destructive; confirm unless --yes (required for
    // --porcelain / non-TTY).
    if (!flags.yes) {
      if (flags.porcelain || !process.stdin.isTTY) {
        throw new MxError(
          'gc removes tmux sessions — pass --yes when running non-interactively or with --porcelain',
          'NEED_CONFIRMATION',
        );
      }
      process.stderr.write(`${warn()} About to kill ${orphans.length} orphaned mx session(s):\n`);
      for (const o of orphans) {
        const busyNote = o.busy.length ? `  ${warn()} ${dim(`live: ${o.busy.join(', ')}`)}` : '';
        process.stderr.write(`  ${bold(o.session)} ${dim(`(work ${o.reason})`)}${busyNote}\n`);
      }
      process.stderr.write('\n');
      if (!confirmYesNo('Proceed? (y/N) ')) {
        process.stderr.write(`${dim('Aborted.')}\n`);
        return;
      }
    }
    const pruned: string[] = [];
    for (const o of orphans) {
      try {
        killSession(o.session);
        pruned.push(o.session);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        if (!flags.porcelain) process.stderr.write(`${warn()} ${dim(`could not kill ${o.session}: ${msg}`)}\n`);
      }
    }
    emit(() => {
      console.log(`${check()} pruned ${pruned.length} orphaned mx session(s)`);
      for (const s of pruned) console.log(`  ${dim(s)}`);
    }, { pruned: orphans.map((o) => ({ session: o.session, work: o.work, reason: o.reason })) });
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
    case 'attach': {
      // Ensure the work's tmux session (build it if missing — self-healing after
      // a reboot / manual kill), then hand THIS terminal to it: switch-client
      // when already inside tmux, otherwise a blocking attach.
      const res = workPath(root, name); // throws NO_WORK if it doesn't exist
      const ensured = ensureWorkSession(root, name, res.path, flags);
      // In porcelain mode we can't hand the terminal to an interactive tmux, so
      // just report what would happen and leave attaching to the caller.
      if (flags.porcelain) {
        emit(() => {}, { work: name, session: ensured.session, created: ensured.created, attach: false });
        return;
      }
      attachOrSwitch(ensured.session);
      return;
    }
    case 'open': {
      // Ensure the work's session, then open it in a NEW terminal window
      // (fullscreen where supported). A window-management failure downgrades to
      // a warning — `attach` always works in-place.
      const res = workPath(root, name); // throws NO_WORK if it doesn't exist
      let ensured: EnsureResult;
      try {
        ensured = openWorkInTerminal(root, name, res.path, flags);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        process.stderr.write(
          `${warn()} ${dim(`could not open a terminal: ${msg}`)}\n` +
            `${dim(`  run \`mx work -n ${name} attach\` in a terminal instead.`)}\n`,
        );
        return;
      }
      emit(() => {
        const how = ensured.created
          ? ensured.claudeAction === 'resume'
            ? 'built session, resumed claude'
            : 'built session, new claude'
          : 'attached to existing session';
        console.log(`${check()} opened ${bold(name)} ${dim(`(${how})`)}`);
      }, { work: name, opened: true, session: ensured.session, created: ensured.created });
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
      // Kill the work's tmux session before removing the folder — same
      // one-work-one-session teardown as archive. Best-effort; a tmux error
      // never blocks the destroy.
      const destroySession = sessionFor(name);
      let destroyKilled = false;
      try {
        destroyKilled = killSession(destroySession);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        if (!flags.porcelain) process.stderr.write(`${warn()} ${dim(`could not kill tmux session: ${msg}`)}\n`);
      }
      const res = workDestroy(root, name, { force: flags.force });
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} destroyed work ${bold(name)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
        if (destroyKilled) console.log(`  ${dim(`tmux session ${destroySession} killed`)}`);
      }, { ...res, sessionKilled: destroyKilled });
      return;
    }
    case 'archive': {
      // The work's tmux session (if any) is killed as part of archiving —
      // detect live foreground processes up front so the prompt can warn that
      // dev servers / a running claude will be terminated.
      const archiveSession = sessionFor(name);
      const sessionLive = hasSession(archiveSession);
      const busy = sessionLive ? busyPanes(archiveSession) : [];
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
        if (sessionLive) {
          process.stderr.write(
            `${dim(`  Its tmux session (${archiveSession}) will be killed.`)}\n`,
          );
          if (busy.length) {
            process.stderr.write(
              `${warn()} ${dim(`  live processes will be terminated: ${busy.join(', ')}`)}\n`,
            );
          }
        }
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
      // Tear down the work's tmux session (one work == one session). Safe no-op
      // when none exists; guarded so a tmux hiccup never fails an archive that
      // already mutated the manifest.
      let sessionKilled = false;
      try {
        sessionKilled = killSession(archiveSession);
      } catch (e) {
        const msg = e instanceof MxError ? e.message : String(e);
        if (!flags.porcelain) process.stderr.write(`${warn()} ${dim(`could not kill tmux session: ${msg}`)}\n`);
      }
      runPostHook(root, 'post-work-archive', { cwd: archiveHookEnv.MX_WORK_PATH, env: archiveHookEnv }, flags.porcelain);
      emit(() => {
        const removed = res.removedWorktrees.join(', ') || 'none';
        console.log(`${check()} archived work ${bold(name)}`);
        console.log(`  ${dim(`at ${res.archived_at}`)}`);
        console.log(`  ${dim(`worktrees removed: ${removed}; branches kept`)}`);
        if (sessionKilled) console.log(`  ${dim(`tmux session ${archiveSession} killed`)}`);
      }, { ...res, sessionKilled });
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
