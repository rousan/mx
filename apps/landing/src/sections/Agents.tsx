import { Section, Icon, Terminal, Line, Mono } from '../ui';
import { AGENT_POINTS } from '../content';

/**
 * The "Built for coding agents" section — mx's origin story and core pitch:
 * combine a coding agent's ability to run many sessions with git worktrees'
 * isolation, and manage everything around them. It leads with the one-line
 * "equation", shows the actual open command, then the concrete workflow points.
 */
export function Agents() {
  return (
    <Section
      id="agents"
      eyebrow="Parallel AI sessions"
      title="Built for a fleet of coding agents"
      lede="mx began as a way to run many Claude Code sessions at once. The whole idea: take a coding agent’s parallel sessions, give each one an isolated git worktree, and let mx manage the branches, ports, workspaces, and session lifecycle around them."
    >
      <Equation />

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
        <Terminal title="one command per feature">
          <Line comment>start (or resume) this feature’s agent session</Line>
          <Line prompt>mx work open -n checkout-redesign</Line>
          <Line>→ fullscreen terminal, Claude Code session “checkout-redesign”</Line>
          <Line>→ seeded by the session-prompt hook</Line>
          <Line>&nbsp;</Line>
          <Line comment>meanwhile, other agents run in their own worktrees</Line>
          <Line prompt>mx work open -n search-filters</Line>
          <Line prompt>mx work open -n api-rate-limits</Line>
          <Line>three agents, three features, zero collisions</Line>
        </Terminal>

        <div className="flex flex-col gap-4">
          <p className="leading-relaxed text-muted">
            A coding agent can hold many sessions — but they all share one checkout, so they clobber
            each other’s branches, files, and ports. Worktrees fix the isolation;{' '}
            <span className="font-medium text-ink-soft">mx makes running a session per worktree a
            single command</span> and keeps the whole fleet organized.
          </p>
          <p className="leading-relaxed text-muted">
            It’s not Claude-only, either: the same model works for any coding agent, and the{' '}
            <Mono>--porcelain</Mono> JSON output plus cwd-based inference mean an agent can drive mx
            itself just as cleanly as you do.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {AGENT_POINTS.map((p) => (
          <div key={p.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon name={p.icon} className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-ink">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * The one-line "equation" that captures mx's core idea visually: a coding
 * agent's parallel sessions, plus git worktrees, equals isolated agents — one
 * per feature. Stacks vertically on small screens.
 */
function Equation() {
  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <EqBox icon="sparkles" title="Agent sessions" sub="many at once, one context each" />
      <EqOp symbol="+" />
      <EqBox icon="branch" title="git worktrees" sub="isolated branch per folder" />
      <EqOp symbol="=" />
      <EqBox
        icon="layers"
        title="A fleet of agents"
        sub="one per feature, no collisions"
        emphasized
      />
    </div>
  );
}

/**
 * A single term in the equation.
 *
 * @param icon - Glyph for the term.
 * @param title - The term's name.
 * @param sub - A short clarifying line.
 * @param emphasized - When true, style as the result (stronger border/fill).
 */
function EqBox({
  icon,
  title,
  sub,
  emphasized,
}: {
  icon: 'sparkles' | 'branch' | 'layers';
  title: string;
  sub: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 items-center gap-3 rounded-xl border p-4 ${
        emphasized ? 'border-line-strong bg-surface-2' : 'border-line bg-surface'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-ink">{title}</div>
        <div className="text-xs text-muted">{sub}</div>
      </div>
    </div>
  );
}

/**
 * The `+` / `=` operator glyph between equation terms, centered and dimmed.
 *
 * @param symbol - The operator character to show.
 */
function EqOp({ symbol }: { symbol: string }) {
  return (
    <div className="flex shrink-0 items-center justify-center py-1 text-2xl font-light text-faint sm:py-0">
      {symbol}
    </div>
  );
}
