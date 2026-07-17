import { Section, Mono } from '../ui';
import { COMMAND_GROUPS, REPO_URL } from '../content';

/**
 * The command reference, grouped by intent (set up, daily work, ports &
 * sessions, maintenance) rather than as one flat list — so a newcomer scans by
 * what they want to do. It's a curated teaching subset; the exhaustive
 * flag-level reference lives in the repo docs, linked at the end.
 */
export function Commands() {
  return (
    <Section
      id="commands"
      eyebrow="Commands"
      title="The commands you’ll actually use"
      lede="Grouped by what you’re trying to do. Every read command also takes --porcelain for stable JSON, which is what makes mx pleasant to script and to drive from an AI agent."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {COMMAND_GROUPS.map((group) => (
          <div key={group.title} className="rounded-2xl border border-line bg-surface p-6">
            <h3 className="text-lg font-semibold text-ink">{group.title}</h3>
            <p className="mt-1 text-sm text-muted">{group.blurb}</p>
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {group.commands.map((c) => (
                <li key={c.cmd} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <code className="font-mono text-[13px] font-medium text-accent-ink">{c.cmd}</code>
                  <span className="text-sm leading-relaxed text-muted">{c.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted">
        Tip: inside a feature folder you can drop the <Mono>-n &lt;name&gt;</Mono> — mx infers the
        feature (and repo) from your current directory. For the full reference with every flag, see{' '}
        <a
          href={`${REPO_URL}/blob/main/docs/commands.md`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent-ink underline underline-offset-2 hover:text-accent"
        >
          docs/commands.md
        </a>
        .
      </p>
    </Section>
  );
}
