import { useEffect, useState } from 'react';
import { Icon, Logo } from '../ui';
import { NAV_LINKS, REPO_URL } from '../content';
import type { Theme } from '../theme';

/**
 * Sticky top navigation: the mx wordmark, in-page section links, a GitHub link,
 * and the light/dark toggle. It gains a border and blur once the user scrolls,
 * so it reads as flat over the hero and lifted over content.
 *
 * @param theme - The active theme, to pick the correct toggle icon.
 * @param onToggleTheme - Callback that flips the theme.
 */
export function Nav({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  // Track whether the page has scrolled past the hero fold so the bar can lift.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors ${
        scrolled
          ? 'border-b border-line bg-bg/80 backdrop-blur-md'
          : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2 font-mono text-xl font-bold">
          <Logo className="h-5 w-auto text-accent" />
          <span className="mx-grad-text">mx</span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="mx on GitHub"
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Icon name="github" className="h-5 w-5" />
          </a>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-5 w-5" />
          </button>
        </div>
      </nav>
    </header>
  );
}
