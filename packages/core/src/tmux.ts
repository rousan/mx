/**
 * Pure helpers for mapping an mx work onto its tmux session name. No process
 * spawning lives here — the CLI layer (`apps/cli/src/tmux.ts`) owns the actual
 * `tmux`/`claude` orchestration; this module is just the naming math so it can
 * be unit-tested in isolation.
 *
 * The model: **one mx work == one tmux session**, named `mx/<work>` (see
 * {@link mxSessionName}) so mx-owned sessions are visually grouped and
 * machine-identifiable in a user's `tmux ls`. The work's Claude session is keyed
 * by the work *name* (resume-or-create via `claude --resume <work>` /
 * `claude -n <work>`), so there is no id to derive here.
 */

/**
 * Prefix every mx-owned tmux session name carries. A leading `mx/` groups mx
 * sessions together in tmux's session list / `choose-tree` and lets both mx and
 * the user tell them apart from ad-hoc sessions at a glance. The slash is a
 * deliberate choice: tmux uses `:` and `.` as target separators
 * (`session:window.pane`), so those characters are unsafe in a session name,
 * but `/` is fine.
 */
export const MX_SESSION_PREFIX = 'mx/';

/**
 * Sanitize an arbitrary string into a token safe to embed in a tmux session
 * name. tmux treats `:` and `.` as target separators and chokes on whitespace,
 * so those are collapsed to `-`. Work names are already kebab-case in practice,
 * so this is normally a no-op — it's a guard against an unusual name breaking
 * `tmux` targeting rather than a transformation callers should rely on.
 *
 * @param s - Raw name segment (typically a work name).
 * @returns The segment with tmux-hostile characters replaced by `-`.
 */
export function sanitizeTmuxName(s: string): string {
  return s.replace(/[.:\s]+/g, '-');
}

/**
 * The tmux session name for a work: the {@link MX_SESSION_PREFIX} followed by
 * the sanitized work name (e.g. `feature-a` -> `mx/feature-a`).
 *
 * @param workName - The mx work name.
 * @returns The tmux session name mx uses for that work.
 */
export function mxSessionName(workName: string): string {
  return MX_SESSION_PREFIX + sanitizeTmuxName(workName);
}

/**
 * Whether a tmux session name belongs to mx (carries the {@link MX_SESSION_PREFIX}).
 * Used to filter a raw `tmux ls` down to mx-owned sessions (e.g. for
 * `mx work switch` / `mx work gc`).
 *
 * @param sessionName - A tmux session name from `tmux ls`.
 * @returns True when the session is mx-owned.
 */
export function isMxSessionName(sessionName: string): boolean {
  return sessionName.startsWith(MX_SESSION_PREFIX);
}
