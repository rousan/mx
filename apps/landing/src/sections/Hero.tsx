import { CopyButton, Icon, Logo } from '../ui';
import { PKG, REPO_URL } from '../content';

/**
 * The hero: the one-line promise, a subheadline that names the problem, the
 * install command, and two calls to action. A faint parallel-lanes backdrop
 * (see `.mx-lanes`) hints at features running side by side.
 */
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Decorative background: faint parallel lanes only — no colored glow, to
          keep the monochrome, documentation-site calm. */}
      <div aria-hidden className="mx-lanes pointer-events-none absolute inset-0" />

      <div className="relative mx-auto w-full max-w-5xl px-5 pt-16 pb-24 text-center sm:pt-20 sm:pb-32">
        <Logo className="mx-auto mb-8 h-10 w-auto sm:h-12" />

        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3.5 py-1.5 text-xs text-muted backdrop-blur transition-colors hover:border-line-strong hover:text-ink"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Open source · MIT · for Claude Code &amp; coding agents
          <Icon name="arrow" className="h-3.5 w-3.5" />
        </a>

        <h1 className="mx-auto mt-8 max-w-3xl text-5xl font-bold tracking-tight text-ink sm:text-6xl">
          Work on parallel features
          <br />
          using <span className="mx-accent-text">coding agents</span>.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          <span className="font-semibold text-ink-soft">mx</span> combines your coding agent’s
          parallel sessions — Claude Code, Cursor, and the rest — with git worktrees. Every feature
          gets its own isolated folder, branch, ports, and agent session, so a fleet of agents can
          work at once without tripping over each other.
        </p>

        {/* Primary install line — the single most important thing to copy. */}
        <div className="mx-auto mt-9 flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface/70 px-4 py-3 backdrop-blur">
          <code className="flex-1 text-left font-mono text-sm text-ink-soft">
            <span className="mr-2 select-none text-accent">$</span>
            npm i -g {PKG}
          </code>
          <CopyButton value={`npm i -g ${PKG}`} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#quickstart"
            className="mx-cta inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Get started
            <Icon name="arrow" className="h-4 w-4" />
          </a>
          <a
            href="#why"
            className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-2"
          >
            Why mx?
          </a>
        </div>
      </div>
    </section>
  );
}
