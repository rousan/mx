import { useState, type ReactNode, type SVGProps } from 'react';

/**
 * Names of the inline stroke icons the site uses. Keeping them in one keyed set
 * means every icon shares the same 24x24 grid, 1.6 stroke, and currentColor
 * fill, so they stay visually consistent wherever they appear.
 */
export type IconName =
  | 'copy'
  | 'check'
  | 'github'
  | 'npm'
  | 'sun'
  | 'moon'
  | 'arrow'
  | 'terminal'
  | 'layers'
  | 'shield'
  | 'branch'
  | 'plug'
  | 'sparkles'
  | 'activity'
  | 'folder'
  | 'box'
  | 'switch'
  | 'plus';

/**
 * Path/element markup for each icon, drawn on a shared 24x24 viewBox with
 * `currentColor` so callers control size and color via className.
 */
const ICON_PATHS: Record<IconName, ReactNode> = {
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  github: (
    <path
      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  npm: (
    <path
      d="M2 6h20v11h-10v2H6v-2H2V6Zm2 2v7h2V9h2v6h2V8H4Zm8 0v7h2V9h2v6h2V8h-6Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 18l9 5 9-5" opacity="0.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="M6 7.5v9M18 9.5c0 4-6 2-6 7" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" />
      <path d="M18 15.5 18.8 18 21 18.8 18.8 19.6 18 22l-.8-2.4L15 18.8l2.2-.8.8-2.5Z" opacity="0.6" />
    </>
  ),
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" opacity="0.5" />
    </>
  ),
  switch: (
    <>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14a4 4 0 0 1 0 8h-2" />
      <path d="m17 20 4-4-4-4" opacity="0.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

/**
 * Render one of the shared inline icons.
 *
 * @param name - Which icon from the keyed set to draw.
 * @param props - Standard SVG props (notably `className` for size/color).
 * @returns The SVG element, inheriting size and color from its className.
 */
export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/**
 * A small copy-to-clipboard button that flips to a checkmark for ~1.5s after a
 * successful copy, giving the user immediate feedback.
 *
 * @param value - The text written to the clipboard when clicked.
 * @param label - Accessible label describing what gets copied.
 */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      onClick={() => {
        // navigator.clipboard is available in all target browsers; ignore the
        // rare rejection (e.g. denied permission) rather than surfacing an error.
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      <Icon name={copied ? 'check' : 'copy'} className={`h-3.5 w-3.5 ${copied ? 'text-accent-2' : ''}`} />
      <span className="tabular-nums">{copied ? 'Copied' : label}</span>
    </button>
  );
}

/**
 * A single terminal command rendered as a copyable line: a dimmed `$` prompt,
 * the command in monospace, and a copy button. The copied text excludes the
 * prompt so it pastes cleanly into a shell.
 *
 * @param cmd - The shell command (without the leading `$`).
 * @param comment - Optional trailing explanation shown dimmed after the command.
 */
export function Command({ cmd, comment }: { cmd: string; comment?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-[var(--code-bg)] px-3.5 py-2.5">
      <code className="flex-1 overflow-x-auto font-mono text-[13px] leading-relaxed whitespace-pre text-ink-soft">
        <span className="mr-2 select-none text-accent">$</span>
        {cmd}
        {comment ? <span className="ml-2 text-faint"># {comment}</span> : null}
      </code>
      <CopyButton value={cmd} />
    </div>
  );
}

/**
 * A stylized terminal window frame with the three traffic-light dots and an
 * optional title. Used to present multi-line command sequences and output.
 *
 * @param title - Small label shown in the window's title bar.
 * @param children - The terminal body (typically <Line> rows).
 */
export function Terminal({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[var(--code-bg)] shadow-sm">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        {title ? <span className="ml-2 font-mono text-xs text-faint">{title}</span> : null}
      </div>
      <div className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">{children}</div>
    </div>
  );
}

/**
 * One line inside a <Terminal>. A `prompt` line shows the `$` and the command;
 * an output line (no prompt) is dimmed to read as program output.
 *
 * @param children - The line's text content.
 * @param prompt - When true, prefix with a `$` prompt and use command styling.
 * @param comment - When true, render as a dim `# ...` annotation line.
 */
export function Line({
  children,
  prompt,
  comment,
}: {
  children: ReactNode;
  prompt?: boolean;
  comment?: boolean;
}) {
  if (comment) {
    return <div className="whitespace-pre text-faint"># {children}</div>;
  }
  if (prompt) {
    return (
      <div className="whitespace-pre text-ink-soft">
        <span className="mr-2 select-none text-accent">$</span>
        {children}
      </div>
    );
  }
  return <div className="whitespace-pre text-muted">{children}</div>;
}

/**
 * A titled top-level page section with a consistent id anchor, eyebrow label,
 * heading, and optional lede paragraph. Wraps content in the shared max-width.
 *
 * @param id - Anchor id used by the nav's in-page links.
 * @param eyebrow - Small uppercase label above the heading.
 * @param title - The section heading.
 * @param lede - Optional intro paragraph under the heading.
 * @param children - The section body.
 * @param tinted - When true, paint a soft background band (for visual rhythm).
 */
export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  tinted,
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  tinted?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-24 ${tinted ? 'bg-bg-soft' : ''}`}>
      <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:py-24">
        <div className="mb-12 max-w-2xl">
          {eyebrow ? (
            <div className="mb-3 text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
          {lede ? <p className="mt-4 text-lg leading-relaxed text-muted">{lede}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * A small inline monospace token for referring to a command, flag, or path in
 * running prose without the weight of a full code block.
 *
 * @param children - The literal text to render in monospace.
 */
export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[0.85em] text-ink-soft">
      {children}
    </code>
  );
}
