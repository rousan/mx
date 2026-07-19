/**
 * The ordered contents of the Mission Control Spaces strip: either a labeled
 * `mx divider` Space (a group header) or one or more feature Spaces (small
 * thumbnails) belonging to the preceding group. Mirrors a real board — MAIN,
 * then in-progress features, then review stages.
 */
const STRIP: ({ divider: string } | { spaces: number })[] = [
  { divider: 'MAIN' },
  { spaces: 3 },
  { divider: 'IN PROGRESS' },
  { spaces: 4 },
  { divider: 'IN REVIEWS' },
  { spaces: 2 },
  { divider: 'PR REVIEWS' },
  { spaces: 1 },
];

/**
 * A horizontally-scrolling mock of the macOS Mission Control Spaces bar: big
 * block-text divider Spaces (from `mx divider`) act as group headers, with small
 * feature-Space thumbnails clustered under each. Recreated as markup (not a
 * screenshot) so it stays crisp and theme-aware. Shared by the hero and the
 * workflow section.
 */
export function MissionControlStrip() {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-stretch gap-2.5">
        {STRIP.map((item, i) =>
          'divider' in item ? (
            <div
              key={i}
              className="flex h-16 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface px-4 font-mono text-xs font-bold tracking-widest text-ink"
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
 * One feature-Space thumbnail in the Mission Control strip — a tiny split-pane
 * window (terminal | editor) rendered abstractly with a few faint lines.
 */
function SpaceThumb() {
  return (
    <div className="flex h-16 w-24 shrink-0 flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-1 border-b border-line px-1.5 py-1">
        <span className="h-1 w-1 rounded-full bg-line-strong" />
        <span className="h-1 w-1 rounded-full bg-line-strong" />
      </div>
      <div className="grid flex-1 grid-cols-2">
        <div className="flex flex-col gap-1 border-r border-line p-1.5">
          <span className="h-0.5 w-8 rounded bg-line-strong" />
          <span className="h-0.5 w-6 rounded bg-line" />
          <span className="h-0.5 w-7 rounded bg-line" />
        </div>
        <div className="flex flex-col gap-1 p-1.5">
          <span className="h-0.5 w-5 rounded bg-line" />
          <span className="h-0.5 w-8 rounded bg-line" />
          <span className="h-0.5 w-6 rounded bg-line" />
        </div>
      </div>
    </div>
  );
}
