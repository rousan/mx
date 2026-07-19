/**
 * The ordered contents of the Mission Control Spaces board: either a labeled
 * `mx divider` Space (a group header) or one or more feature Spaces (small
 * thumbnails) belonging to the preceding group. Kept compact so the whole board
 * — every stage label — fits within the content width without horizontal
 * scrolling. Mirrors a real board: MAIN, then in-progress features, then review
 * stages.
 */
const STRIP: ({ divider: string } | { spaces: number })[] = [
  { divider: 'MAIN' },
  { spaces: 2 },
  { divider: 'IN PROGRESS' },
  { spaces: 3 },
  { divider: 'IN REVIEWS' },
  { spaces: 2 },
  { divider: 'PR REVIEWS' },
  { spaces: 1 },
];

/**
 * A mock of the macOS Mission Control Spaces board: big block-text divider
 * Spaces (from `mx divider`) act as group headers, with small feature-Space
 * thumbnails clustered under each. Recreated as markup (not a screenshot) so it
 * stays crisp and theme-aware. Wraps (rather than scrolls) on narrow screens so
 * every stage stays visible. Shared by the hero and the workflow section.
 */
export function MissionControlStrip() {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-stretch justify-center gap-2">
        {STRIP.map((item, i) =>
          'divider' in item ? (
            <div
              key={i}
              className="flex h-14 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface px-3 font-mono text-[10px] font-bold tracking-widest text-ink"
            >
              {item.divider}
            </div>
          ) : (
            Array.from({ length: item.spaces }).map((_, j) => <SpaceThumb key={`${i}-${j}`} />)
          ),
        )}
      </div>
    </div>
  );
}

/**
 * One feature-Space thumbnail in the Mission Control board — a tiny split-pane
 * window (terminal | editor) rendered abstractly with a few faint lines.
 */
function SpaceThumb() {
  return (
    <div className="flex h-14 w-16 shrink-0 flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-1 border-b border-line px-1.5 py-0.5">
        <span className="h-1 w-1 rounded-full bg-line-strong" />
        <span className="h-1 w-1 rounded-full bg-line-strong" />
      </div>
      <div className="grid flex-1 grid-cols-2">
        <div className="flex flex-col gap-1 border-r border-line p-1.5">
          <span className="h-0.5 w-6 rounded bg-line-strong" />
          <span className="h-0.5 w-4 rounded bg-line" />
          <span className="h-0.5 w-5 rounded bg-line" />
        </div>
        <div className="flex flex-col gap-1 p-1.5">
          <span className="h-0.5 w-4 rounded bg-line" />
          <span className="h-0.5 w-5 rounded bg-line" />
          <span className="h-0.5 w-4 rounded bg-line" />
        </div>
      </div>
    </div>
  );
}
