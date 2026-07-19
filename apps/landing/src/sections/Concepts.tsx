import { Section, Icon } from '../ui';
import { CONCEPTS } from '../content';

/**
 * The Concepts section teaches the four nouns behind mx (runtime, repo, work,
 * worktree) two ways: a labeled diagram of how they nest on disk, then a card
 * per term with a plain-English gloss and a short detail. After this a reader
 * should be able to parse any mx command.
 */
export function Concepts() {
  return (
    <Section
      id="concepts"
      eyebrow="The mental model"
      title="Four words, and you’ve got it"
      lede="mx has almost no vocabulary to learn. Everything is one of these four things, nested inside each other."
      tinted
    >
      <ModelDiagram />

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {CONCEPTS.map((c) => (
          <div key={c.term} className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon name={c.icon} className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold text-ink">{c.term}</h3>
            </div>
            <p className="mt-4 font-medium text-ink-soft">{c.plain}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{c.detail}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * A labeled, responsive diagram of the on-disk nesting: the runtime contains
 * cloned repos (read-only) and one folder per feature; each feature holds
 * worktrees that fork from those repos, each on its own branch and ports. Built
 * from styled divs rather than an SVG so text reflows on small screens.
 */
function ModelDiagram() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
      {/* Outer frame: the runtime. */}
      <div className="rounded-xl border border-line-strong bg-bg-soft p-4 sm:p-6">
        <DiagramLabel icon="folder" text="Runtime" hint="~/mx — one folder for everything" />

        {/* Repos row: cloned once, read-only. */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Repos · cloned once, read-only
          </div>
          <div className="flex flex-wrap gap-3">
            {['app', 'api'].map((r) => (
              <div
                key={r}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 font-mono text-sm text-ink-soft"
              >
                <Icon name="box" className="h-4 w-4 text-muted" />
                {r}
              </div>
            ))}
          </div>
        </div>

        {/* Works row: one card per feature, each holding its worktrees. */}
        <div className="mt-6">
          <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Works · one per feature — the thing you switch between
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkBox
              name="my-feature"
              worktrees={[
                { repo: 'app', branch: 'my-feature', port: ':3000' },
                { repo: 'api', branch: 'my-feature', port: ':3001' },
              ]}
            />
            <WorkBox
              name="hotfix"
              worktrees={[{ repo: 'app', branch: 'hotfix', port: ':3002' }]}
            />
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        Two features live side by side. Each <span className="font-mono text-accent">wt/&lt;repo&gt;</span>{' '}
        is a real git checkout you code in — forked from the shared clone, on its own branch and
        ports.
      </p>
    </div>
  );
}

/**
 * A small labeled header row used inside the diagram frame.
 *
 * @param icon - Glyph for the entity.
 * @param text - The entity name.
 * @param hint - A dimmed clarifying note.
 */
function DiagramLabel({ icon, text, hint }: { icon: 'folder'; text: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <Icon name={icon} className="h-4 w-4 text-accent" />
        {text}
      </span>
      <span className="font-mono text-xs text-faint">{hint}</span>
    </div>
  );
}

/**
 * One feature card in the diagram, listing its worktrees with branch and port.
 *
 * @param name - The feature (work) name.
 * @param worktrees - The per-repo worktrees this feature holds.
 */
function WorkBox({
  name,
  worktrees,
}: {
  name: string;
  worktrees: { repo: string; branch: string; port: string }[];
}) {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/40 p-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-sm font-semibold text-accent-ink">
        <Icon name="layers" className="h-4 w-4" />
        {name}
      </div>
      <div className="flex flex-col gap-1.5">
        {worktrees.map((wt) => (
          <div
            key={wt.repo}
            className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-xs"
          >
            <span className="text-ink-soft">wt/{wt.repo}</span>
            <span className="flex items-center gap-2 text-muted">
              <Icon name="branch" className="h-3.5 w-3.5" />
              {wt.branch}
              <span className="text-accent-2">{wt.port}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
