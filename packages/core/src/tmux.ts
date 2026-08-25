/**
 * Pure helpers for mapping an mx work onto a tmux session and a stable Claude
 * Code session id. No process spawning lives here — the CLI layer
 * (`apps/cli/src/tmux.ts`) owns the actual `tmux`/`claude` orchestration; this
 * module is just the naming/identity math so it can be unit-tested in isolation.
 *
 * The model: **one mx work == one tmux session**. The session is named
 * `mx/<work>` (see {@link mxSessionName}) so mx-owned sessions are visually
 * grouped and machine-identifiable in a user's `tmux ls`, and the work's Claude
 * Code session id is derived deterministically from the work name (see
 * {@link claudeSessionId}) so re-attaching a session always resumes the same
 * conversation with no stored state.
 */
import { createHash } from 'node:crypto';

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
 * Fixed UUID namespace for deriving per-work Claude session ids. A constant,
 * randomly-generated v4 UUID used as the {@link claudeSessionId} UUIDv5
 * namespace so the mapping `work name -> session id` is stable across machines
 * and mx versions. Never change this — doing so would orphan every existing
 * work's Claude session.
 */
export const MX_CLAUDE_NAMESPACE = '6f3a1c9e-2b7d-5e84-9a1f-0c2d4e6f8a10';

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
 * Used to filter a raw `tmux ls` down to mx-owned sessions and to decide which
 * sessions the resurrect filter should drop.
 *
 * @param sessionName - A tmux session name from `tmux ls`.
 * @returns True when the session is mx-owned.
 */
export function isMxSessionName(sessionName: string): boolean {
  return sessionName.startsWith(MX_SESSION_PREFIX);
}

/**
 * Convert 16 bytes into canonical `8-4-4-4-12` hyphenated UUID text.
 *
 * @param bytes - A 16-byte buffer holding the UUID's octets.
 * @returns The formatted UUID string.
 */
function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  );
}

/**
 * Deterministic UUIDv5 (RFC 4122, SHA-1 name-based) of `name` within
 * `namespace`. Implemented on `node:crypto` so `@mx/core` keeps its zero
 * runtime-dependency guarantee. The output is stable: the same
 * (namespace, name) pair always yields the same UUID.
 *
 * @param name - The name to hash (here, the work name).
 * @param namespace - The namespace UUID in canonical hyphenated form.
 * @returns The derived v5 UUID.
 */
export function uuidv5(name: string, namespace: string): string {
  // The namespace UUID contributes its raw 16 octets as the hash prefix.
  const nsHex = namespace.replace(/-/g, '');
  const nsBytes = Buffer.from(nsHex, 'hex');
  const hash = createHash('sha1')
    .update(nsBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  // Take the first 16 bytes of the SHA-1 digest, then stamp the version (5) and
  // RFC 4122 variant bits into the well-known positions.
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  return formatUuid(bytes);
}

/**
 * The Claude Code session id mx pins for a work: `uuidv5(workName)` in the mx
 * namespace. Claude's `--session-id` flag requires a UUID, so the work name
 * can't be used literally; deriving it deterministically gives a stable id
 * (unique because work names are unique and immutable) with nothing to persist.
 * On first launch mx creates the session with this id and names it after the
 * work (`claude --session-id <id> -n <work>`); on re-attach it resumes the same
 * id (`claude --resume <id>`).
 *
 * @param workName - The mx work name.
 * @returns The deterministic Claude session UUID for that work.
 */
export function claudeSessionId(workName: string): string {
  return uuidv5(workName, MX_CLAUDE_NAMESPACE);
}
