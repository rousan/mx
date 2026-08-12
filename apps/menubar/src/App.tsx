import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** One active work, as returned by the Rust `list_works` command. */
type Work = { name: string; path: string; worktrees: number };

/** The full result of `list_works`: the resolved runtime and its active works. */
type WorksResult = { runtime_path: string; runtime_missing: boolean; works: Work[] };

/**
 * The menubar popover: a header with the mx mark and the active-work count, the
 * list of works (name + path), and a footer with the runtime path and controls.
 * Rendered inside a transparent Tauri window with an arrow pointing up at the
 * tray icon.
 */
export default function App() {
  const [data, setData] = useState<WorksResult | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await invoke<WorksResult>('list_works'));
    } catch {
      // The command only fails if the backend is unreachable; keep the last data.
    }
  }, []);

  useEffect(() => {
    load();
    // Reload each time the popover regains focus (i.e. is reopened).
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const works = data?.works ?? [];

  return (
    <div className="flex h-full flex-col px-2.5 pt-2.5 pb-2.5">
      {/* Arrow pointing up at the tray icon (tuned for the macOS menubar). */}
      <div className="relative flex-1">
        <div className="absolute left-1/2 top-0 -z-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[6px] rotate-45 rounded-tl-[3px] border-l border-t border-line-strong bg-surface" />

        <div className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <Header count={works.length} />
          <div className="h-px bg-line" />

          {data?.runtime_missing ? (
            <MissingState path={data.runtime_path} />
          ) : works.length === 0 ? (
            <EmptyState />
          ) : (
            <WorkList works={works} />
          )}

          <div className="h-px bg-line" />
          <Footer path={data?.runtime_path ?? ''} onRefresh={load} />
        </div>
      </div>
    </div>
  );
}

/** Popover header: the mx mark, the wordmark, and a teal active-work count pill. */
function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5">
      <Logo className="h-[18px] w-auto" />
      <span className="text-[15px] font-bold text-ink">mx</span>
      <span className="text-[11px] text-muted">active works</span>
      <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent tabular-nums">
        {count}
      </span>
    </div>
  );
}

/** The scrollable list of active works. */
function WorkList({ works }: { works: Work[] }) {
  return (
    <div className="max-h-[360px] flex-1 overflow-y-auto p-1.5">
      {works.map((work) => (
        <WorkRow key={work.path} work={work} />
      ))}
    </div>
  );
}

/** One work row: name + tilde-abbreviated path, with reveal/copy on hover. */
function WorkRow({ work }: { work: Work }) {
  const [hover, setHover] = useState(false);
  const home = homePrefix(work.path);
  const shown = home ? '~' + work.path.slice(home.length) : work.path;

  const reveal = () => void invoke('reveal_path', { path: work.path });
  const copy = () => void navigator.clipboard?.writeText(work.path).catch(() => {});

  return (
    <div
      className="flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink/[0.06]"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={reveal}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{work.name}</div>
        <div className="truncate text-[11px] text-muted" dir="rtl">
          {shown}
        </div>
      </div>
      {hover ? (
        <div className="flex items-center gap-1">
          <IconButton title="Reveal in Finder" onClick={reveal} icon="folder" />
          <IconButton
            title="Copy path"
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            icon="copy"
          />
        </div>
      ) : (
        work.worktrees > 0 && (
          <span className="font-mono text-[10px] text-faint tabular-nums">{work.worktrees}</span>
        )
      )}
    </div>
  );
}

/** Footer: refresh, the runtime path, and quit. */
function Footer({ path, onRefresh }: { path: string; onRefresh: () => void }) {
  const home = homePrefix(path);
  const shown = home ? '~' + path.slice(home.length) : path;
  return (
    <div className="flex items-center gap-2 px-3.5 py-2">
      <button
        className="text-muted transition-colors hover:text-ink"
        title="Refresh"
        onClick={onRefresh}
      >
        <Refresh className="h-3.5 w-3.5" />
      </button>
      <span className="truncate font-mono text-[10px] text-faint" dir="rtl">
        {shown}
      </span>
      <button
        className="ml-auto text-[11px] text-muted transition-colors hover:text-ink"
        onClick={() => void invoke('quit')}
      >
        Quit
      </button>
    </div>
  );
}

/** Shown when the runtime has no active works. */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      <div className="text-[13px] font-medium text-ink">No active works</div>
      <div className="font-mono text-[11px] text-muted">mx work new &lt;name&gt;</div>
    </div>
  );
}

/** Shown when no mx runtime is found on disk. */
function MissingState({ path }: { path: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      <div className="text-[13px] font-medium text-ink">No mx runtime found</div>
      <div className="font-mono text-[11px] text-muted">{path}</div>
      <div className="text-[11px] text-muted">
        Run <span className="font-mono">mx init</span> to create one.
      </div>
    </div>
  );
}

/** A small square hover-action button. */
function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  icon: 'folder' | 'copy';
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1 text-muted transition-colors hover:bg-ink/[0.08] hover:text-ink"
    >
      {icon === 'folder' ? <Folder className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Home-directory prefix of a path (best-effort, for tilde abbreviation). */
function homePrefix(path: string): string | null {
  const m = path.match(/^((?:\/Users|\/home)\/[^/]+)/);
  if (m) return m[1];
  const win = path.match(/^([A-Za-z]:\\Users\\[^\\]+)/);
  return win ? win[1] : null;
}

/** The multi-pastel mx mark. */
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 33 28" className={className} fill="none" aria-hidden="true">
      <g strokeWidth="2.8" strokeLinecap="round">
        <path d="M9 14 L26 6" stroke="#2dd4bf" />
        <path d="M9 14 H26" stroke="#fbbf24" />
        <path d="M9 14 L26 22" stroke="#fb7185" />
      </g>
      <circle cx="7" cy="14" r="3.8" fill="#a78bfa" />
      <circle cx="26" cy="6" r="3.4" fill="#2dd4bf" />
      <circle cx="26" cy="14" r="3.4" fill="#fbbf24" />
      <circle cx="26" cy="22" r="3.4" fill="#fb7185" />
    </svg>
  );
}

function Folder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function Copy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function Refresh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  );
}
