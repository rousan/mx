import { Section, Command, Mono } from '../ui';
import { STEPS } from '../content';

/**
 * The Quickstart: four numbered steps from an empty machine to coding inside a
 * worktree. Each step pairs the exact command with a plain "what this does"
 * note, so it reads top to bottom without needing the reference docs.
 */
export function Quickstart() {
  return (
    <Section
      id="quickstart"
      eyebrow="Quickstart"
      title="From zero to a running feature in four commands"
      lede="You need Node 22+ and git. That’s it — mx installs one global command and keeps everything else in its own folder."
    >
      <ol className="relative flex flex-col gap-8">
        {/* Vertical connector line linking the step numbers. */}
        <div aria-hidden className="absolute top-4 bottom-4 left-[19px] w-px bg-line" />

        {STEPS.map((step) => (
          <li key={step.n} className="relative flex gap-5">
            <span className="mx-grad z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm">
              {step.n}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 mb-3 text-sm leading-relaxed text-muted">{step.body}</p>
              <Command cmd={step.cmd} comment={step.comment} />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-xl border border-line bg-surface p-6">
        <p className="text-sm leading-relaxed text-muted">
          Your coding-agent session runs from the feature folder (<Mono>works/my-feature</Mono>) —
          its home base, with all the worktrees in view. The code itself lives in{' '}
          <Mono>wt/app</Mono>, a normal git checkout on your branch; <Mono>cd</Mono> there to start
          the dev server, commit, or push. Spin up another feature with <Mono>mx work new</Mono> and
          the two stay completely isolated.
        </p>
      </div>
    </Section>
  );
}
