import { useCallback, useEffect, useState } from 'react';

/**
 * The two concrete themes the site can render in. There is no "system" runtime
 * state — on first load we resolve the OS preference to one of these and stamp
 * it, so the rest of the app only ever deals with a concrete value.
 */
export type Theme = 'light' | 'dark';

/**
 * localStorage key under which the user's explicit choice is remembered across
 * visits. Absent until the user toggles at least once.
 */
const STORAGE_KEY = 'mx-theme';

/**
 * Resolve the theme to apply on first paint: a previously-saved explicit choice
 * wins, otherwise fall back to the OS `prefers-color-scheme` setting.
 *
 * @returns The concrete theme to stamp on the document element.
 */
function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Theme controller hook: stamps `data-theme` on <html> so the CSS tokens and
 * every `dark:` utility resolve, and persists the user's explicit toggle.
 *
 * @returns The active theme and a `toggle` callback that flips it.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => initialTheme());

  // Reflect the current theme onto the document element on every change so the
  // `[data-theme=...]` selectors in index.css take effect.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      // Persisting marks the choice as explicit, so it survives reloads and
      // overrides the OS preference from then on.
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
