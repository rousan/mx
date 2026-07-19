import { Section, Command, Icon } from '../ui';
import { WORKFLOW_STEPS } from '../content';

/**
 * The "In practice" section: one concrete, opinionated daily workflow — a
 * fullscreen macOS Space per feature (terminal split with the editor), the
 * agent in the first terminal tab, and a three-finger swipe to switch. It opens
 * with a visual of the split layout, then the numbered steps. The lede stresses
 * that mx doesn't mandate any of this; it's a starting shape to copy.
 */
export function Workflow() {
  return (
    <Section
      id="workflow"
      eyebrow="In practice"
      title="A workflow that works"
      lede="mx is deliberately workflow-agnostic — it manages the folders, branches, and ports, and leaves the rest to you. But a blank page is hard, so here’s one setup that works well: a fullscreen Space per feature, with the agent and editor side by side."
      tinted
    >
      <SpaceMock />

      <ol className="relative mt-14 flex flex-col gap-8">
        {/* Vertical connector line linking the step numbers. */}
        <div aria-hidden className="absolute top-4 bottom-4 left-[19px] w-px bg-line" />

        {WORKFLOW_STEPS.map((step) => (
          <li key={step.n} className="relative flex gap-5">
            <span className="mx-grad z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm">
              {step.n}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
              {step.cmds ? (
                <div className="mt-3 flex flex-col gap-2">
                  {step.cmds.map((cmd) => (
                    <Command key={cmd} cmd={cmd} />
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-14">
        <h3 className="text-lg font-semibold text-ink">Grouped in Mission Control</h3>
        <p className="mt-1.5 mb-5 max-w-2xl text-sm leading-relaxed text-muted">
          Swipe up with three fingers and your whole board appears: feature Spaces clustered between{' '}
          <span className="font-mono text-ink-soft">mx divider</span> labels, so you always know what’s
          in progress, in review, and merged.
        </p>
        <SpacesStrip />
      </div>
    </Section>
  );
}

/**
 * The ordered contents of the Mission Control Spaces strip: either a labeled
 * `mx divider` Space (a group header) or one or more feature Spaces (small
 * thumbnails) that belong to the preceding group. Mirrors the real layout a
 * user arranges — MAIN, then in-progress features, then review stages.
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
  { divider: 'MX' },
  { spaces: 1 },
];

/**
 * A horizontally-scrolling mock of the macOS Mission Control Spaces bar: big
 * block-text divider Spaces (from `mx divider`) act as group headers, with small
 * feature-Space thumbnails clustered under each. Recreates the user's real
 * board rather than a screenshot, so it stays crisp and theme-aware.
 */
function SpacesStrip() {
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

/**
 * A stylized mock of one feature's fullscreen Space: a terminal pane on the left
 * (tab 1 = the agent session, tab 2 = the dev server) and the editor on the
 * right, with swipe affordances on the sides to convey "each feature is its own
 * Space; swipe to switch." Purely decorative — built from styled divs.
 */
function SpaceMock() {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <SwipeArrow direction="left" />

      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-sm">
        {/* Window title bar for the whole fullscreen Space. */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-line-strong" />
          <span className="h-3 w-3 rounded-full bg-line-strong" />
          <span className="h-3 w-3 rounded-full bg-line-strong" />
          <span className="ml-2 font-mono text-xs text-faint">
            checkout-redesign — one feature, one Space
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left half: the terminal, with two tabs. */}
          <div className="border-b border-line md:border-r md:border-b-0">
            <div className="flex items-center gap-1 border-b border-line px-3 pt-2">
              <TermTab label="claude" active />
              <TermTab label="dev server" />
            </div>
            <div className="px-4 py-4 font-mono text-[12px] leading-6">
              <div className="text-ink-soft">
                <span className="mr-2 text-accent">$</span>mx work open -n checkout-redesign
              </div>
              <div className="text-muted">◆ Claude Code · auto mode on</div>
              <div className="text-faint"># create worktrees + build the feature…</div>
              <div className="mt-1 text-muted">› editing app, api…</div>
            </div>
          </div>

          {/* Right half: the editor. */}
          <div>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
              <Icon name="layers" className="h-4 w-4 text-faint" />
              dev-mx (Workspace)
            </div>
            <div className="px-4 py-4 font-mono text-[12px] leading-6 text-muted">
              <div className="text-faint">wt/</div>
              <div className="pl-3 text-ink-soft">app/</div>
              <div className="pl-3 text-ink-soft">api/</div>
              <div className="mt-1 text-faint">checkout-redesign.code-workspace</div>
            </div>
          </div>
        </div>
      </div>

      <SwipeArrow direction="right" />
    </div>
  );
}

/**
 * A single tab in the mock terminal's tab strip.
 *
 * @param label - The tab's label.
 * @param active - Whether this tab reads as the focused one.
 */
function TermTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-t-md px-3 py-1.5 font-mono text-[11px] ${
        active ? 'bg-surface text-ink' : 'text-muted'
      }`}
    >
      {label}
    </span>
  );
}

/**
 * A dimmed swipe affordance flanking the Space mock, conveying that a
 * three-finger trackpad swipe moves between per-feature Spaces.
 *
 * @param direction - Which way the arrow points (and sits).
 */
function SwipeArrow({ direction }: { direction: 'left' | 'right' }) {
  return (
    <div className="hidden shrink-0 flex-col items-center gap-1 text-faint sm:flex">
      <Icon
        name="arrow"
        className={`h-5 w-5 ${direction === 'left' ? 'rotate-180' : ''}`}
      />
      <span className="w-14 text-center text-[10px] leading-tight">
        {direction === 'left' ? 'prev feature' : 'next feature'}
      </span>
    </div>
  );
}
