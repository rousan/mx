import { Section, Icon } from '../ui';
import { FAQS } from '../content';

/**
 * The FAQ: the objections and clarifications a newcomer typically has before
 * committing. Rendered as native <details> so each answer is expandable,
 * keyboard-accessible, and works without JavaScript.
 */
export function Faq() {
  return (
    <Section
      id="faq"
      eyebrow="Questions"
      title="Still wondering?"
      lede="The things people ask before they try mx."
      tinted
    >
      <div className="flex flex-col gap-3">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-line bg-surface px-5 open:border-line-strong"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <Icon
                name="plus"
                className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-45"
              />
            </summary>
            <p className="pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
