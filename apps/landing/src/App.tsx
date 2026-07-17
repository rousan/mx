import { useTheme } from './theme';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { Why } from './sections/Why';
import { Concepts } from './sections/Concepts';
import { Quickstart } from './sections/Quickstart';
import { Features } from './sections/Features';
import { Commands } from './sections/Commands';
import { Faq } from './sections/Faq';
import { Footer } from './sections/Footer';

/**
 * The mx landing + docs site: a single scrolling page that teaches mx from zero
 * — hook (Hero), problem (Why), vocabulary (Concepts), hands-on (Quickstart),
 * capabilities (Features), reference (Commands), objections (Faq), then a
 * closing CTA (Footer). Ordered so each section builds on the last.
 */
export function App() {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-bg">
      <Nav theme={theme} onToggleTheme={toggle} />
      <main>
        <Hero />
        <Why />
        <Concepts />
        <Quickstart />
        <Features />
        <Commands />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
