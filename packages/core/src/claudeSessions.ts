/**
 * Discovery of local Claude Code sessions for a work, used by `mx work open` to
 * resume-or-create the per-work session.
 *
 * Claude Code stores each session as a transcript at
 * `~/.claude/projects/<project-dir>/<session-id>.jsonl`, where `<project-dir>`
 * is the session's launch directory (realpath-canonicalized) with every
 * character outside `[A-Za-z0-9-]` replaced by `-`. The session's display name
 * (set by `/rename` or `claude -n`) is stored inside the transcript as the last
 * `{"type":"custom-title","customTitle":...}` record.
 *
 * Because `mx work open` launches Claude with the work folder as the cwd, every
 * session for a work lives under that one project directory — so a lookup scoped
 * to it never returns sessions from other works.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * A Claude Code session discovered for a work.
 */
export interface ClaudeSession {
  /** Session id (the transcript filename without `.jsonl`) — pass to `claude --resume`. */
  id: string;
  /** The session's current display name (latest `/rename` / `claude -n` title), or null if never named. */
  name: string | null;
  /** Absolute path to the session transcript. */
  path: string;
  /** Transcript last-modified time in ms, used to order newest-first. */
  mtimeMs: number;
}

/**
 * Encode an absolute filesystem path into the directory name Claude Code uses
 * under `~/.claude/projects`. Claude canonicalizes the launch cwd (realpath) and
 * replaces every character outside `[A-Za-z0-9-]` with `-` (so both `/` and the
 * `.` in a username like `rousan.ali` become `-`).
 *
 * Callers must pass an already realpath-canonicalized path — on macOS the work
 * folder under `/tmp` resolves to `/private/tmp`, and Claude keys the project
 * dir off the resolved path.
 *
 * @param realWorkPath - The work folder's realpath (canonicalized absolute path).
 * @returns The project directory name (not a full path).
 */
export function claudeProjectDirName(realWorkPath: string): string {
  return realWorkPath.replace(/[^A-Za-z0-9-]/g, '-');
}

/**
 * Read a transcript's current display title — the last
 * `{"type":"custom-title","customTitle":...}` record, as written by both
 * `/rename` and `claude -n <name>`. Returns null when the session was never
 * named or the file can't be read.
 *
 * @param transcriptFile - Absolute path to a `<session-id>.jsonl` transcript.
 * @returns The latest custom title, or null.
 */
export function readSessionTitle(transcriptFile: string): string | null {
  let data: string;
  try {
    data = fs.readFileSync(transcriptFile, 'utf8');
  } catch {
    return null;
  }
  let title: string | null = null;
  for (const line of data.split('\n')) {
    // Cheap pre-filter before JSON.parse — most lines aren't title records.
    if (!line.includes('"custom-title"')) continue;
    try {
      const o = JSON.parse(line);
      if (o && o.type === 'custom-title' && typeof o.customTitle === 'string') title = o.customTitle;
    } catch {
      // Skip malformed lines; a partially-written transcript shouldn't crash the scan.
    }
  }
  return title;
}

/**
 * Find Claude Code sessions for a work whose display name **exactly** equals the
 * given name. Scans only the work's own project directory (derived from its
 * realpath), so sessions from other works are never returned, and the match is
 * exact so numbered variants (`<work>-2`, `<work>-3`) are intentionally excluded
 * — those are opened manually. Results are ordered newest-first.
 *
 * @param projectsRoot - Root of Claude's project store (typically `~/.claude/projects`).
 * @param realWorkPath - The work folder's realpath (canonicalized).
 * @param name - Exact session name to match (the work name).
 * @returns Matching sessions, newest-first (empty when the project dir or a match is absent).
 */
export function findSessionsByName(
  projectsRoot: string,
  realWorkPath: string,
  name: string,
): ClaudeSession[] {
  const dir = path.join(projectsRoot, claudeProjectDirName(realWorkPath));
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    // No project directory yet — the work has never had a Claude session.
    return [];
  }
  const out: ClaudeSession[] = [];
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const file = path.join(dir, f);
    const title = readSessionTitle(file);
    if (title !== name) continue; // exact-match only
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
      // Race: file vanished between readdir and stat — treat as oldest.
    }
    out.push({ id: f.slice(0, -'.jsonl'.length), name: title, path: file, mtimeMs });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}
