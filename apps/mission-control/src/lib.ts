import type { RepoHealth, WorkHealth } from './api';

/**
 * One rendered metric row: a label, its value, an optional ✓/⚠ verdict, and an
 * optional hint shown when the verdict is a warning. Mirrors the row model used
 * by `mx repo health` / `mx work health` in the CLI.
 */
export interface Metric {
  label: string;
  value: string;
  ok?: boolean;
  hint?: string;
}

/**
 * Whether the captured health-hook output counts as healthy: empty, or a bare
 * "ok"/"OK". Mirrors the CLI's silent-when-healthy convention.
 *
 * @param extra - The hook output (or null).
 * @returns True when the output means "healthy".
 */
export function extraOk(extra: string | null): boolean {
  const t = (extra ?? '').trim();
  return t === '' || t.toLowerCase() === 'ok';
}

/**
 * The single value shown on the `extra` row: "OK" when healthy, otherwise the
 * hook's message.
 *
 * @param extra - The hook output (or null).
 * @returns The display string.
 */
export function extraValue(extra: string | null): string {
  return extraOk(extra) ? 'OK' : (extra ?? '').trim();
}

/**
 * Coarse "N units ago" string for a timestamp, or "never" when null.
 *
 * @param iso - ISO-8601 timestamp, or null.
 * @returns Human relative string.
 */
export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Derive the metric rows shown for a repo (only rows that carry a ✓/⚠), plus
 * the trailing `extra` row. Mirrors `mx repo health`.
 *
 * @param h - The repo health snapshot.
 * @returns The metric rows in display order.
 */
export function repoMetrics(h: RepoHealth): Metric[] {
  const rows: Metric[] = [];
  // With no remote (no origin/HEAD) there's no default to compare against, so
  // any branch is fine — only a detached HEAD is flagged. Mirrors `@mx/core`.
  rows.push({
    label: 'current branch',
    value: h.currentBranch ?? '(detached)',
    ok: h.currentBranch !== null && (h.defaultBranch === null || h.isOnDefault),
    hint:
      h.currentBranch === null
        ? 'HEAD is detached'
        : h.defaultBranch !== null && !h.isOnDefault
          ? `should be ${h.defaultBranch}`
          : undefined,
  });
  rows.push({
    label: 'uncommitted',
    value: `${h.uncommittedChanges} change${h.uncommittedChanges === 1 ? '' : 's'}`,
    ok: h.uncommittedChanges === 0,
    hint: h.uncommittedChanges === 0 ? undefined : 'commit or discard',
  });
  rows.push({
    label: 'untracked',
    value: `${h.untrackedFiles} file${h.untrackedFiles === 1 ? '' : 's'}`,
    ok: h.untrackedFiles === 0,
  });
  if (h.aheadOfOrigin !== null) {
    rows.push({
      label: 'ahead of origin',
      value: `${h.aheadOfOrigin} commit${h.aheadOfOrigin === 1 ? '' : 's'}`,
      ok: h.aheadOfOrigin === 0,
    });
  }
  if (h.behindOfOrigin !== null) {
    rows.push({
      label: 'behind of origin',
      value: `${h.behindOfOrigin} commit${h.behindOfOrigin === 1 ? '' : 's'}`,
      ok: h.behindOfOrigin === 0,
      hint: h.behindOfOrigin > 0 ? 'fetch to update' : undefined,
    });
  }
  if (h.defaultBranch !== null) {
    const fetchedAt = h.lastFetchedAt ? Date.parse(h.lastFetchedAt) : null;
    const fresh = fetchedAt !== null && Date.now() - fetchedAt < 24 * 60 * 60 * 1000;
    rows.push({
      label: 'last fetched',
      value: relativeTime(h.lastFetchedAt),
      ok: fresh,
      hint: fresh ? undefined : 'stale (over 24h)',
    });
  }
  rows.push({ label: 'extra', value: extraValue(h.extra), ok: extraOk(h.extra) });
  return rows;
}

/**
 * Derive the metric rows shown for a work (only rows that carry a ✓/⚠), plus
 * the trailing `extra` row. Mirrors `mx work health`.
 *
 * @param h - The work health snapshot.
 * @returns The metric rows in display order.
 */
export function workMetrics(h: WorkHealth): Metric[] {
  const rows: Metric[] = [];
  const off = h.worktrees.filter((w) => (h.archived ? w.present : !w.present));
  rows.push({
    label: 'worktrees',
    value: String(h.worktrees.length),
    ok: off.length === 0,
    hint: off.length === 0 ? undefined : `${off.length} ${h.archived ? 'still on disk' : 'missing'}`,
  });
  if (h.archived) {
    rows.push({
      label: 'ports',
      value: String(h.ports.length),
      ok: h.ports.length === 0,
      hint: h.ports.length === 0 ? undefined : 'should be freed',
    });
  }
  rows.push({
    label: 'stray entries',
    value: String(h.strayEntries.length),
    ok: h.strayEntries.length === 0,
    hint: h.strayEntries.length === 0 ? undefined : h.strayEntries.join(', '),
  });
  rows.push({
    label: 'port conflicts',
    value: String(h.portConflicts.length),
    ok: h.portConflicts.length === 0,
    hint:
      h.portConflicts.length === 0
        ? undefined
        : h.portConflicts.map((c) => `${c.port} with ${c.otherWork}`).join('; '),
  });
  rows.push({ label: 'extra', value: extraValue(h.extra), ok: extraOk(h.extra) });
  return rows;
}

/**
 * Aggregate verdict for a block: healthy only when no metric flagged a problem
 * and the health hook reported OK. Mirrors the name-level ✓/⚠ in the CLI.
 *
 * @param metrics - The block's metric rows.
 * @returns True when every verdict-bearing row is a tick.
 */
export function allOk(metrics: Metric[]): boolean {
  return metrics.every((m) => m.ok !== false);
}
