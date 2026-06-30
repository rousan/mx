import { useState, type ReactNode } from 'react';
import {
  useMxState,
  type MxState,
  type RepoHealth,
  type WorkHealth,
  type WorkHealthPort,
} from './api';
import {
  repoMetrics,
  workMetrics,
  allOk,
  relativeTime,
  type Metric,
} from './lib';

/**
 * Root mission-control view: a calm, monochrome, auto-refreshing overview of the
 * whole runtime — repos, works, their health, and a consolidated ports table.
 * The whole UI auto-syncs with the OS light/dark setting (light classes are the
 * base; `dark:` variants are driven by `prefers-color-scheme`).
 */
export function App() {
  const { state, status } = useMxState();
  const [showArchived, setShowArchived] = useState(false);
  // Works grid: active only by default, archived behind the checkbox. The ports
  // board below stays independent — it always covers every work.
  const shownWorks = state ? (showArchived ? state.works : state.works.filter((w) => !w.archived)) : [];
  return (
    <div className="mx-auto max-w-[1800px] px-6 py-6">
      <Header state={state} status={status} />
      {state ? (
        <div className="mt-8 flex flex-col gap-10">
          <PortsPanel works={state.works} />
          <Section title={`repos · ${state.repos.length}`}>
            <Grid>
              {state.repos.map((r) => (
                <RepoCard key={r.name} repo={r} />
              ))}
              {state.repos.length === 0 && <Empty>no repos yet</Empty>}
            </Grid>
          </Section>
          <Section
            title={`works · ${state.counts.activeWorks} active, ${state.counts.archivedWorks} archived`}
            action={
              state.counts.archivedWorks > 0 ? (
                <label className="flex cursor-pointer items-center gap-2 text-[11px] tracking-normal text-zinc-500">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-3.5 w-3.5 accent-zinc-500"
                  />
                  show archived
                </label>
              ) : undefined
            }
          >
            <Grid>
              {shownWorks.map((w) => (
                <WorkCard key={w.name} work={w} />
              ))}
              {shownWorks.length === 0 && (
                <Empty>{state.counts.activeWorks === 0 ? 'no active works' : 'no works'}</Empty>
              )}
            </Grid>
          </Section>
        </div>
      ) : (
        <div className="mt-24 text-center text-sm text-zinc-400 dark:text-zinc-600">
          connecting to the runtime…
        </div>
      )}
    </div>
  );
}

/** Top bar: product mark, runtime path/version, counts, and the live indicator. */
function Header({ state, status }: { state: MxState | null; status: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          mx <span className="text-zinc-400 dark:text-zinc-500">·</span> mission control
        </h1>
        {state && <span className="text-xs text-zinc-400 dark:text-zinc-600">v{state.version}</span>}
      </div>
      <div className="flex items-center gap-6 text-xs text-zinc-500">
        {state && <span className="truncate font-mono">{state.runtime}</span>}
        <span className="flex items-center gap-2">
          <Dot status={status} />
          <span>
            {status === 'live' && state
              ? `updated ${relativeTime(state.generatedAt)}`
              : status === 'reconnecting'
                ? 'reconnecting…'
                : 'connecting…'}
          </span>
        </span>
      </div>
    </header>
  );
}

/** The live-status dot: pulsing when live, dim otherwise. */
function Dot({ status }: { status: string }) {
  const color =
    status === 'live'
      ? 'bg-emerald-500'
      : status === 'reconnecting'
        ? 'bg-amber-500'
        : 'bg-zinc-400 dark:bg-zinc-600';
  return <span className={`h-2 w-2 rounded-full ${color} ${status === 'live' ? 'mc-live' : ''}`} />;
}

/** A labelled section with an uppercase heading and an optional right-aligned control. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Responsive card grid — denser on wide monitors, single column on laptops. */
function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-zinc-500">{children}</div>;
}

/** A repo health card. */
function RepoCard({ repo }: { repo: RepoHealth }) {
  const metrics = repoMetrics(repo);
  return <Card title={repo.name} ok={allOk(metrics)} metrics={metrics} />;
}

/** A work health card, with an archived chip. */
function WorkCard({ work }: { work: WorkHealth }) {
  const metrics = workMetrics(work);
  return (
    <Card
      title={work.name}
      ok={allOk(metrics)}
      metrics={metrics}
      chip={work.archived ? 'archived' : undefined}
      dimTitle={work.archived}
    />
  );
}

/** Shared health card: title + aggregate verdict, then the metric rows. */
function Card({
  title,
  ok,
  metrics,
  chip,
  dimTitle,
}: {
  title: string;
  ok: boolean;
  metrics: Metric[];
  chip?: string;
  dimTitle?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mb-3 flex items-center gap-2">
        <Verdict ok={ok} />
        <span
          className={`font-semibold ${dimTitle ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
        >
          {title}
        </span>
        {chip && (
          <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
            {chip}
          </span>
        )}
      </div>
      <dl className="flex flex-col gap-1.5">
        {metrics.map((m) => (
          <Row key={m.label} metric={m} />
        ))}
      </dl>
    </div>
  );
}

/** A single metric row: label, value, verdict marker, optional hint. */
function Row({ metric }: { metric: Metric }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <dt className="w-32 shrink-0 text-zinc-500">{metric.label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200">{metric.value}</dd>
      {metric.ok !== undefined && <Marker ok={metric.ok} />}
      {metric.hint && <span className="text-xs text-red-600 dark:text-red-400/90">{metric.hint}</span>}
    </div>
  );
}

/**
 * Inline verdict marker. Semantic on an otherwise monochrome canvas: a green ✓
 * for healthy, a red ⚠ for not. Shared by metric rows and card headers.
 */
function Marker({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
  ) : (
    <span className="text-red-600 dark:text-red-400">⚠</span>
  );
}

/** Card-header verdict marker (same semantics as {@link Marker}). */
function Verdict({ ok }: { ok: boolean }) {
  return <Marker ok={ok} />;
}

/**
 * Consolidated ports view across every work — the "which work owns which port,
 * give me the URL" board. A nested tree (work → worktree → ports) so names
 * aren't repeated per row; leaf columns (service / port / url) stay aligned, and
 * port collisions across works are flagged in red.
 */
function PortsPanel({ works }: { works: WorkHealth[] }) {
  // Global per-port count, to flag a port allocated by more than one slot.
  const counts = new Map<number, number>();
  for (const w of works) for (const p of w.ports) counts.set(p.port, (counts.get(p.port) ?? 0) + 1);

  const total = works.reduce((n, w) => n + w.ports.length, 0);
  if (total === 0) return null;
  const withPorts = works.filter((w) => w.ports.length > 0);

  return (
    <Section title={`ports · ${total}`}>
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        {withPorts.map((w) => (
          <div key={w.name}>
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold ${w.archived ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
              >
                {w.name}
              </span>
              {w.archived && (
                <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
                  archived
                </span>
              )}
            </div>
            <div className="ml-1 mt-1 flex flex-col gap-2 border-l border-zinc-200 pl-3 dark:border-zinc-800">
              {groupByWorktree(w.ports).map(([worktree, ports]) => (
                <div key={worktree}>
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">{worktree}</div>
                  <div className="ml-1 mt-0.5 flex flex-col gap-0.5 border-l border-zinc-200 pl-3 font-mono text-sm dark:border-zinc-800">
                    {ports
                      .slice()
                      .sort((a, b) => a.port - b.port)
                      .map((p) => {
                        const conflict = (counts.get(p.port) ?? 0) > 1;
                        const url = `http://localhost:${p.port}`;
                        return (
                          <div
                            key={p.service}
                            className="grid grid-cols-[8rem_5rem_1fr] items-baseline gap-2"
                          >
                            <span className="text-zinc-500 dark:text-zinc-400">{p.service}</span>
                            <span
                              className={
                                conflict ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'
                              }
                            >
                              {p.port}
                              {conflict && <span className="ml-1 text-[10px]">⚠</span>}
                            </span>
                            <a
                              className="text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {url}
                            </a>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/**
 * Group a work's ports by worktree name, preserving first-seen order.
 *
 * @param ports - The work's allocated port slots.
 * @returns Entries of `[worktreeName, ports]`.
 */
function groupByWorktree(ports: WorkHealthPort[]): [string, WorkHealthPort[]][] {
  const byWt = new Map<string, WorkHealthPort[]>();
  for (const p of ports) {
    const arr = byWt.get(p.worktree);
    if (arr) arr.push(p);
    else byWt.set(p.worktree, [p]);
  }
  return [...byWt.entries()];
}
