import { Section, Terminal, Line, Mono } from '../ui';

/**
 * The "Why mx" section: first make the pain visceral (the stash-and-switch
 * dance everyone knows), then reframe the solution with a plain analogy, then
 * show the before/after side by side. This is where a newcomer decides mx is
 * worth their time, so it leads with feeling, not features.
 */
export function Why() {
  return (
    <Section
      id="why"
      eyebrow="Why mx"
      title="Switching features shouldn’t cost you 20 minutes"
      lede="You’re deep in a feature. An urgent fix lands. What happens next is the problem mx exists to remove."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* The pain, dramatized as the familiar terminal dance. */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold tracking-wide text-amber uppercase">
            The old way
          </h3>
          <Terminal title="one folder, one branch at a time">
            <Line comment>mid-feature, then a hotfix comes in — stash your half-done work</Line>
            <Line prompt>git stash</Line>
            <Line prompt>git checkout main && git checkout -b hotfix</Line>
            <Line>&nbsp;</Line>
            <Line comment>dev server died, ports freed, state gone</Line>
            <Line prompt>pnpm install</Line>
            <Line>… reinstalling because the branch differs</Line>
            <Line prompt>pnpm dev</Line>
            <Line>Error: port 3000 already in use</Line>
            <Line>&nbsp;</Line>
            <Line comment>fix shipped — now rebuild your headspace</Line>
            <Line prompt>git checkout my-feature && git stash pop</Line>
            <Line>where was I again?</Line>
          </Terminal>
          <p className="text-sm leading-relaxed text-muted">
            Every switch tears down your running app, risks port clashes, and evicts the mental
            context you’d built up. Across two repos — say a frontend and an API — it’s twice the
            teardown.
          </p>
        </div>

        {/* The relief: two folders, switch instantly. */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold tracking-wide text-accent-2 uppercase">With mx</h3>
          <Terminal title="every feature has its own folder">
            <Line comment>the feature you were building — still running</Line>
            <Line prompt>cd ~/mx/works/my-feature/wt/app</Line>
            <Line>dev server up on :3000, exactly as you left it</Line>
            <Line>&nbsp;</Line>
            <Line comment>the hotfix — its own folder, branch, and port</Line>
            <Line prompt>mx work new hotfix app</Line>
            <Line prompt>cd ~/mx/works/hotfix/wt/app</Line>
            <Line>dev server up on :3002 — no clash</Line>
            <Line>&nbsp;</Line>
            <Line comment>done? switch back — nothing was torn down</Line>
            <Line prompt>cd ~/mx/works/my-feature/wt/app</Line>
            <Line>still running. still in context.</Line>
          </Terminal>
          <p className="text-sm leading-relaxed text-muted">
            No stashing. No re-install. No port fight. Each feature is a separate checkout in its own
            folder, on its own branch, with its own ports — so switching is just{' '}
            <Mono>cd</Mono>.
          </p>
        </div>
      </div>

      {/* The one-sentence mental reframe, given room to land. */}
      <div className="mt-14 rounded-2xl border border-line bg-surface p-8 sm:p-10">
        <p className="text-xl leading-relaxed text-ink-soft sm:text-2xl">
          The idea in one line:{' '}
          <span className="font-semibold text-ink">
            instead of one workbench you clear off for every task, give each feature its own bench
          </span>{' '}
          — that stays exactly as you left it. mx builds those benches (using git worktrees under the
          hood) and keeps track of the branches, ports, and editor workspace for each one.
        </p>
      </div>
    </Section>
  );
}
