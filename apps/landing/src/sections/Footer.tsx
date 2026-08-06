import { CopyButton, Icon, Logo } from '../ui';
import { PKG, REPO_URL, NPM_URL } from '../content';

/**
 * Closing call-to-action band plus the site footer: repeat the install line for
 * readers who scrolled the whole way, then the wordmark, resource links, and
 * license/attribution.
 */
export function Footer() {
  return (
    <>
      {/* Final CTA — a last, prominent chance to copy the install command. */}
      <section className="border-t border-line">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:py-24">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Run a coding agent on every feature
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            One global install, and your next parallel feature — and its agent session — is a single
            command away.
          </p>
          <div className="mx-auto mt-8 flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <code className="flex-1 text-left font-mono text-sm text-ink-soft">
              <span className="mr-2 select-none text-accent">$</span>
              npm i -g {PKG}
            </code>
            <CopyButton value={`npm i -g ${PKG}`} />
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-bg-soft">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-lg font-bold">
              <Logo className="h-5 w-auto" />
              <span className="mx-grad-text">mx</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              A coding agent on every feature — parallel sessions on git worktrees.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-muted transition-colors hover:text-ink"
            >
              <Icon name="github" className="h-4 w-4" />
              GitHub
            </a>
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-muted transition-colors hover:text-ink"
            >
              <Icon name="npm" className="h-4 w-4" />
              npm
            </a>
            <a href="/docs" className="text-muted transition-colors hover:text-ink">
              Docs
            </a>
            <a href="/deck" className="text-muted transition-colors hover:text-ink">
              Deck
            </a>
          </div>
        </div>

        <div className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-5 text-xs text-faint">
            MIT License · Copyright © Rousan Ali · Made for people who ship more than one thing at a
            time.
          </div>
        </div>
      </footer>
    </>
  );
}
