import { Section, Command, Icon } from '../ui';
import { WORKFLOW_STEPS } from '../content';

/**
 * The workflow section — the concrete story of how a feature goes from new to
 * merged with mx: one fullscreen macOS Space per feature (terminal split with
 * the editor), the coding agent in the first terminal tab, a three-finger swipe
 * to switch, and archive on merge. Told as *the* workflow (not a hedged "one of
 * many"), with the it-doesn't-have-to-be-this-way note saved for the end.
 */
export function Workflow() {
  return (
    <Section
      id="workflow"
      eyebrow="The workflow"
      title="A day with mx"
      lede="One fullscreen Space per feature — your coding agent and editor side by side — and a swipe to move between them. Here’s the whole loop, from a fresh feature to a merged one."
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

      {/* The flexibility note lives at the END — so the story reads as concrete
          first, and "you don't have to do it this way" is the closing reassurance. */}
      <div className="mt-12 rounded-xl border border-line bg-surface p-6">
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-semibold text-ink">This is the setup mx was built around — not a
          requirement.</span>{' '}
          Use any editor, terminal, or window manager you like; mx just owns the folders, branches,
          and ports underneath and stays out of the way. Once you have the loop, bend it to your own
          tools.
        </p>
      </div>
    </Section>
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
      <Icon name="arrow" className={`h-5 w-5 ${direction === 'left' ? 'rotate-180' : ''}`} />
      <span className="w-14 text-center text-[10px] leading-tight">
        {direction === 'left' ? 'prev feature' : 'next feature'}
      </span>
    </div>
  );
}
