import { useEffect, useRef, useState } from 'react';

/**
 * Repo health snapshot — mirrors `@mx/core`'s `RepoHealth` (the shape the server
 * sends verbatim). Kept as a local type so the UI has no build-time dependency
 * on the core package.
 */
export interface RepoHealth {
  name: string;
  path: string;
  defaultBranch: string | null;
  currentBranch: string | null;
  isOnDefault: boolean;
  uncommittedChanges: number;
  untrackedFiles: number;
  aheadOfOrigin: number | null;
  behindOfOrigin: number | null;
  lastFetchedAt: string | null;
  worktreesInWorks: string[];
  healthy: boolean;
  issues: string[];
  extra: string | null;
}

/** One allocated port slot within a work. */
export interface WorkHealthPort {
  worktree: string;
  service: string;
  port: number;
}

/** A cross-work port collision. */
export interface WorkHealthPortConflict {
  port: number;
  worktree: string;
  service: string;
  otherWork: string;
  otherOwner: string;
}

/** A recorded worktree and whether it exists on disk. */
export interface WorkHealthWorktree {
  name: string;
  repo: string;
  branch: string;
  present: boolean;
}

/** Work health snapshot — mirrors `@mx/core`'s `WorkHealth`. */
export interface WorkHealth {
  name: string;
  path: string;
  archived: boolean;
  worktrees: WorkHealthWorktree[];
  ports: WorkHealthPort[];
  strayEntries: string[];
  portConflicts: WorkHealthPortConflict[];
  healthy: boolean;
  issues: string[];
  extra: string | null;
}

/** The full dashboard payload from `/api/state` and `/api/stream`. */
export interface MxState {
  runtime: string;
  version: string;
  generatedAt: string;
  counts: { repos: number; activeWorks: number; archivedWorks: number };
  repos: RepoHealth[];
  works: WorkHealth[];
}

/** Connection status of the live stream. */
export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribe to the live runtime state over Server-Sent Events. Returns the
 * latest state (null until the first message) and the stream status. The
 * browser's `EventSource` reconnects automatically on a dropped connection.
 *
 * @returns The latest `MxState` (or null) and the current stream status.
 */
export function useMxState(): { state: MxState | null; status: StreamStatus } {
  const [state, setState] = useState<MxState | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const everConnected = useRef(false);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => {
      everConnected.current = true;
      setStatus('live');
    };
    es.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data) as MxState);
        setStatus('live');
      } catch {
        // ignore a malformed frame; the next tick replaces it.
      }
    };
    es.onerror = () => {
      setStatus(everConnected.current ? 'reconnecting' : 'connecting');
    };
    return () => es.close();
  }, []);

  return { state, status };
}
