import { Icon, Logo } from '../ui';
import { REPO_URL } from '../content';

/**
 * Companion-app band: introduces the cross-platform mxbar menubar app with a
 * small popover mock, platform chips, and download / learn-more actions. Placed
 * late in the page as a "there's also a desktop app" beat.
 */
export function Menubar() {
  return (
    <section id="menubar" className="border-t border-line bg-bg-soft">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 md:grid-cols-2 md:items-center sm:py-24">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-ink">
            Companion app
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Your active works, in the menubar
          </h2>
          <p className="mt-4 max-w-md text-lg text-muted">
            <span className="font-semibold text-ink-soft">mxbar</span> is a tiny menubar app that
            keeps your active works one click away — the count, each name, and its path. Reveal or
            copy in a click.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {['macOS', 'Windows', 'Linux'].map((os) => (
              <span
                key={os}
                className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-ink-soft"
              >
                {os}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={`${REPO_URL}/releases/latest`}
              target="_blank"
              rel="noreferrer"
              className="mx-cta inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Download
              <Icon name="arrow" className="h-4 w-4" />
            </a>
            <a
              href="/docs/guides/menubar"
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-2"
            >
              Learn more
            </a>
          </div>
        </div>

        <MenubarMock />
      </div>
    </section>
  );
}

/** A small static mock of the mxbar popover — header with count, a few rows. */
function MenubarMock() {
  const works = [
    { name: 'checkout-redesign', path: '~/mx/works/checkout-redesign' },
    { name: 'dark-mode', path: '~/mx/works/dark-mode' },
    { name: 'search-filters', path: '~/mx/works/search-filters' },
    { name: 'refund-flow', path: '~/mx/works/refund-flow' },
  ];
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="relative">
        {/* pointer */}
        <div className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[6px] rotate-45 rounded-tl-[3px] border-l border-t border-line-strong bg-surface" />
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <Logo className="h-[18px] w-auto" />
            <span className="text-[15px] font-bold text-ink">mx</span>
            <span className="text-[11px] text-muted">active works</span>
            <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
              {works.length}
            </span>
          </div>
          <div className="h-px bg-line" />
          <div className="p-1.5">
            {works.map((w) => (
              <div key={w.name} className="rounded-lg px-2 py-1.5">
                <div className="text-[13px] font-semibold text-ink">{w.name}</div>
                <div className="truncate font-mono text-[11px] text-muted">{w.path}</div>
              </div>
            ))}
          </div>
          <div className="h-px bg-line" />
          <div className="flex items-center gap-2 px-3.5 py-2 text-[10px] text-faint">
            <Icon name="arrow" className="hidden" />
            <span className="font-mono">~/mx</span>
            <span className="ml-auto text-[11px] text-muted">Quit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
