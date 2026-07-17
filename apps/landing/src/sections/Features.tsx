import { Section, Icon } from '../ui';
import { FEATURES } from '../content';

/**
 * The "What you get" grid: six capability cards in plain language. It comes
 * after the mental model and quickstart, so a reader already has the vocabulary
 * to appreciate each one.
 */
export function Features() {
  return (
    <Section
      id="features"
      eyebrow="What you get"
      title="Isolation, without the busywork"
      lede="mx handles the fiddly parts of parallel work — folders, branches, ports, setup, editor workspaces — so you can stay on the feature."
      tinted
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform group-hover:-translate-y-0.5">
              <Icon name={f.icon} className="h-5.5 w-5.5" />
            </span>
            <h3 className="mt-5 text-base font-semibold text-ink">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
