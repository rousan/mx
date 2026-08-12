import { useTheme } from './theme';
import { Nav } from './sections/Nav';
import { Hero } from './sections/Hero';
import { Why } from './sections/Why';
import { Agents } from './sections/Agents';
import { Concepts } from './sections/Concepts';
import { Quickstart } from './sections/Quickstart';
import { Workflow } from './sections/Workflow';
import { Features } from './sections/Features';
import { Commands } from './sections/Commands';
import { Menubar } from './sections/Menubar';
import { Faq } from './sections/Faq';
import { Footer } from './sections/Footer';

/**
 * The mx landing + docs site: a single scrolling page that teaches mx from zero.
 * The story opens concrete — hook (Hero, with the Mission Control board), the
 * pain (Why), then immediately the day-to-day Mission Control workflow
 * (Workflow) so a newcomer "gets it" fast. Only then does it go into detail:
 * the agent pitch (Agents), vocabulary (Concepts), hands-on (Quickstart),
 * capabilities (Features), reference (Commands), objections (Faq), and a closing
 * CTA (Footer).
 */
export function App() {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-bg">
      <Nav theme={theme} onToggleTheme={toggle} />
      <main>
        <Hero />
        <Why />
        <Workflow />
        <Agents />
        <Concepts />
        <Quickstart />
        <Features />
        <Commands />
        <Menubar />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
