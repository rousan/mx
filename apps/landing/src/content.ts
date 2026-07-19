import type { IconName } from './ui';

/**
 * The npm package name and the canonical repo URL, referenced from several
 * sections. Kept here so a rename touches one place.
 */
export const PKG = '@rousan/mx';
export const REPO_URL = 'https://github.com/rousan/mx';
export const NPM_URL = 'https://www.npmjs.com/package/@rousan/mx';

/**
 * One capability card in the "What you get" grid. `title` is the headline,
 * `body` explains it in plain language, `icon` picks a shared glyph.
 */
export interface Feature {
  icon: IconName;
  title: string;
  body: string;
}

/**
 * The headline capabilities, written for someone who has never heard of mx.
 * These deliberately avoid jargon; the Concepts section defines the terms. The
 * parallel-agents card leads, since that is mx's reason for existing.
 */
export const FEATURES: Feature[] = [
  {
    icon: 'sparkles',
    title: 'A coding agent per feature',
    body: 'Open a feature in a fullscreen terminal that resumes or starts its own Claude Code session, pre-seeded with context. Run several agents at once, one per feature, without them tripping over each other.',
  },
  {
    icon: 'layers',
    title: 'A separate desk per feature',
    body: 'Every feature gets its own folder, branch, and running app. Switching between two features is just switching folders — nothing to stash, nothing to rebuild.',
  },
  {
    icon: 'branch',
    title: 'Built on git worktrees',
    body: 'mx uses a native git feature: multiple branches checked out at once, in separate folders, sharing one clone. You get the isolation without a second copy of the repo on disk.',
  },
  {
    icon: 'box',
    title: 'One runtime, many repos',
    body: 'Clone each repo once. Every feature forks lightweight worktrees from that clone — so a full-stack change spanning frontend and backend lives together under one feature.',
  },
  {
    icon: 'switch',
    title: 'Ports that never collide',
    body: 'mx hands each feature its own set of ports and remembers them, so you can run two copies of the same app side by side without editing config or fighting "port already in use".',
  },
  {
    icon: 'plug',
    title: 'Hooks for the boring setup',
    body: 'A new worktree can auto-copy your .env, install dependencies, or seed a database. One script per lifecycle event, in any language — so a fresh feature is ready the moment it exists.',
  },
  {
    icon: 'activity',
    title: 'Live mission control',
    body: 'A local, read-only web dashboard streams the health of every repo and feature plus a consolidated ports board — so you can see your whole fleet at a glance.',
  },
];

/**
 * One point in the "Built for coding agents" section — the workflow details
 * that make mx a fit for running many agent sessions in parallel.
 */
export interface AgentPoint {
  icon: IconName;
  title: string;
  body: string;
}

/**
 * How mx supports a fleet of coding agents, concretely. These map to real
 * commands and hooks (mx work open, the session-prompt hook, per-feature ports,
 * --porcelain output), so the section stays truthful rather than aspirational.
 */
export const AGENT_POINTS: AgentPoint[] = [
  {
    icon: 'sparkles',
    title: 'One session per feature',
    body: 'mx work open drops you into a fullscreen terminal that resumes — or starts — that feature’s Claude Code session. Each feature keeps its own conversation, history, and context.',
  },
  {
    icon: 'plug',
    title: 'Seed every session automatically',
    body: 'A session-prompt hook generates each new session’s opening prompt — global, per-repo, or per-feature — so an agent starts with the right context instead of a blank slate.',
  },
  {
    icon: 'switch',
    title: 'No agents stepping on each other',
    body: 'Every agent works in its own worktree, branch, and ports. Point a fleet at ten features at once; none share a checkout or fight over a port.',
  },
  {
    icon: 'terminal',
    title: 'Agent-friendly by design',
    body: 'Every read command emits stable JSON with --porcelain, and mx infers the feature from the working directory — so an agent can drive mx as reliably as a person can.',
  },
];

/**
 * A core concept, explained twice: a one-line "plain English" gloss and a
 * slightly deeper paragraph. This is the teaching heart of the site.
 */
export interface Concept {
  icon: IconName;
  term: string;
  plain: string;
  detail: string;
}

/**
 * The four nouns you need to hold in your head to use mx. Ordered outside-in:
 * runtime contains repos and works; a work contains worktrees.
 */
export const CONCEPTS: Concept[] = [
  {
    icon: 'folder',
    term: 'Runtime',
    plain: 'One folder on your machine where mx keeps everything.',
    detail:
      'Think of it as mx’s home base (default ~/mx). It holds your cloned repos and one folder per feature you’re working on. You can have several runtimes and switch with an environment variable.',
  },
  {
    icon: 'box',
    term: 'Repo',
    plain: 'A pristine clone of a repository, cloned once.',
    detail:
      'mx clones each repo a single time into the runtime and treats that clone as read-only reference. You never edit it directly — features branch off it instead, sharing its git history to save disk and time.',
  },
  {
    icon: 'layers',
    term: 'Work',
    plain: 'One feature you’re building — the unit you switch between.',
    detail:
      'A "work" bundles everything for one feature: which repos it touches, the branches, the ports, and an editor workspace. Starting a second feature is one command, and the two stay completely isolated.',
  },
  {
    icon: 'branch',
    term: 'Worktree',
    plain: 'A repo checked out on a feature’s branch, in its own folder.',
    detail:
      'Each work has one worktree per repo it touches (under wt/<repo>), each on its own branch. This is the folder you actually code in — a normal git checkout you can build, run, commit, and push.',
  },
];

/**
 * One step in the quickstart. `cmd` is the shell command, `comment` an optional
 * inline note, and `body` the plain-language "what this does / why".
 */
export interface Step {
  n: number;
  title: string;
  cmd: string;
  comment?: string;
  body: string;
}

/**
 * The minimal path from zero to coding in a worktree. Each step reads on its
 * own so a newcomer can follow without cross-referencing the reference docs.
 */
export const STEPS: Step[] = [
  {
    n: 1,
    title: 'Install mx',
    cmd: `npm i -g ${PKG}`,
    body: 'A single global install gives you the mx command. You need Node 22+ and git. That’s the only thing that ever gets installed globally.',
  },
  {
    n: 2,
    title: 'Create your runtime',
    cmd: 'mx init',
    comment: 'scaffolds ~/mx',
    body: 'This sets up mx’s home folder — the one place all its state lives. Run it once. Everything after this happens through mx commands.',
  },
  {
    n: 3,
    title: 'Add a repo (once)',
    cmd: 'mx repo add git@github.com:you/app.git',
    body: 'mx clones the repo into the runtime as read-only reference. You do this once per repo, no matter how many features you build from it.',
  },
  {
    n: 4,
    title: 'Start a feature and dive in',
    cmd: 'mx work new my-feature app',
    comment: 'creates a worktree of "app" on branch my-feature',
    body: 'This creates a feature and a git worktree for it. cd into works/my-feature/wt/app and you’re in a normal checkout on your feature branch — build, run, commit, push as usual. Start a second feature the same way; both stay isolated.',
  },
];

/**
 * One step in the example end-to-end workflow. `body` explains the step; `cmds`
 * are the optional literal commands for it.
 */
export interface WorkflowStep {
  n: number;
  title: string;
  body: string;
  cmds?: string[];
}

/**
 * A concrete, opinionated way to work day to day with mx — one fullscreen macOS
 * Space per feature (terminal split with the editor), the coding agent in the
 * first terminal tab, and a swipe to switch features. mx doesn't require any of
 * this; it's one workflow that works well, offered so a newcomer has a starting
 * shape to copy rather than a blank page.
 */
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    n: 1,
    title: 'One fullscreen Space per feature',
    body: 'Open a fullscreen terminal and create the work. Then jump into its folder and open the editor workspace mx generated for you — every repo’s worktree shows up as a folder in one window (code for VS Code, cursor for Cursor).',
    cmds: [
      'mx work new checkout-redesign app api',
      'cd "$(mx work -n checkout-redesign path)"',
      'code checkout-redesign.code-workspace',
    ],
  },
  {
    n: 2,
    title: 'Split the terminal and editor side by side',
    body: 'Put the terminal and the editor into a macOS split view — terminal on the left, editor on the right. That single fullscreen pane is one feature. Build the next feature the same way, in its own Space.',
  },
  {
    n: 3,
    title: 'Agent in tab 1, everything else in more tabs',
    body: 'Run the feature’s Claude Code session in the first terminal tab. Use a second tab — or tmux panes — for the dev server, logs, and git, so each concern for that feature has its place.',
    cmds: ['mx work open -n checkout-redesign'],
  },
  {
    n: 4,
    title: 'Hand the feature to the agent',
    body: 'Once the session is up, ask it to create the worktrees for the repos the feature touches (through mx), give it the feature description to work from, and switch the session to auto mode for the best hands-off results.',
  },
  {
    n: 5,
    title: 'Switch features with a three-finger swipe',
    body: 'Because each feature is its own fullscreen Space, a three-finger left/right swipe on the trackpad jumps you between features instantly — no windows to hunt for, nothing torn down behind you.',
  },
  {
    n: 6,
    title: 'Group your Spaces with labeled dividers',
    body: 'Open Mission Control (a three-finger swipe up) to see every Space at once, and slot in labeled separators with mx divider so features cluster by stage — MAIN, IN PROGRESS, IN REVIEWS, PR REVIEWS. Each divider is just a Space filled with big block text, so the groups are easy to spot as you swipe.',
    cmds: ['mx divider "IN PROGRESS" -o'],
  },
  {
    n: 7,
    title: 'Wrap up when it’s merged',
    body: 'When the feature ships, ask the agent to write a session summary (per mx’s session rules), then archive the work — that frees its ports and worktrees while keeping the branches and summaries — and close the terminal and editor.',
    cmds: ['mx work archive -n checkout-redesign'],
  },
];

/**
 * A group of related CLI commands for the reference section, so the full
 * surface is scannable by intent rather than as one long flat list.
 */
export interface CommandGroup {
  title: string;
  blurb: string;
  commands: { cmd: string; desc: string }[];
}

/**
 * The command reference, grouped by what you're trying to do. This is a curated
 * teaching subset with plain descriptions; the exhaustive flag-level reference
 * lives in the repo's docs/commands.md.
 */
export const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: 'Set up',
    blurb: 'Create the runtime and bring repos in. You run these rarely.',
    commands: [
      { cmd: 'mx init', desc: 'Scaffold the runtime (the ~/mx home folder).' },
      { cmd: 'mx repo add <git-url>', desc: 'Clone a repo into the runtime as read-only reference.' },
      { cmd: 'mx repo new <name>', desc: 'Create a fresh local repo with no remote (for experiments).' },
      { cmd: 'mx repo ls', desc: 'List the repos mx knows about.' },
    ],
  },
  {
    title: 'Daily work',
    blurb: 'Start features, look around, jump into a worktree. Your bread and butter.',
    commands: [
      { cmd: 'mx work new <name> <repo>', desc: 'Create a feature plus an initial worktree for it.' },
      { cmd: 'mx info', desc: 'See every repo, feature, worktree, and allocated port at a glance.' },
      { cmd: 'mx work -n <name> path', desc: 'Print a feature’s folder (handy for cd).' },
      { cmd: 'mx work -n <name> worktree add <repo>', desc: 'Add another repo’s worktree to a feature.' },
      { cmd: 'mx work -n <name> worktree set-branch <wt>', desc: 'Record the branch after you git checkout inside a worktree.' },
    ],
  },
  {
    title: 'Ports & sessions',
    blurb: 'Give a feature its own ports, and open it in a terminal or editor.',
    commands: [
      { cmd: 'mx work -n <name> port set <wt> <service>', desc: 'Allocate a free port, unique across all features.' },
      { cmd: 'mx work -n <name> open', desc: 'Open a fullscreen terminal that resumes or starts the feature’s Claude session (macOS).' },
      { cmd: 'mx mission-control', desc: 'Launch a live web dashboard of health and ports (alias: mx mc).' },
      { cmd: 'mx divider <text>', desc: 'Fill a terminal with big block text — a visual separator for macOS Spaces.' },
    ],
  },
  {
    title: 'Maintenance',
    blurb: 'Health checks, cleanup, and keeping mx itself up to date.',
    commands: [
      { cmd: 'mx health', desc: 'Whole-runtime overview: every repo and active feature’s health.' },
      { cmd: 'mx work -n <name> archive', desc: 'Remove worktrees but keep the feature and its branches (recoverable).' },
      { cmd: 'mx work -n <name> destroy', desc: 'Permanently delete a feature’s folder; branches are kept.' },
      { cmd: 'mx update', desc: 'Self-update the CLI and refresh the runtime.' },
      { cmd: 'mx sync', desc: 'Re-stamp runtime files to match the current mx version.' },
    ],
  },
];

/**
 * One frequently-asked question, answered for someone still deciding whether mx
 * is for them.
 */
export interface Faq {
  q: string;
  a: string;
}

/**
 * The objections and clarifications a newcomer typically has. Answers stay
 * short and reassuring, pointing at the mental model rather than internals.
 */
export const FAQS: Faq[] = [
  {
    q: 'Do I need to understand git worktrees first?',
    a: 'No. mx creates and manages worktrees for you — you interact with plain folders and normal git inside them. Worktrees are the engine; you rarely touch them directly. If you’re curious, they’re a built-in git feature for checking out several branches at once.',
  },
  {
    q: 'Does mx replace git or my editor?',
    a: 'Neither. Inside a worktree you use git exactly as you always have — branch, commit, push, open PRs. mx only orchestrates the folders, branches, ports, and workspaces around your repos. It generates a VS Code workspace file, but you edit however you like.',
  },
  {
    q: 'Do I have to use it with AI coding agents?',
    a: 'No. mx grew out of running many Claude Code sessions in parallel, and that’s its sweet spot — but the same isolation is just as useful for plain human work: juggling several features, reviewing a PR while building another, or a full-stack change across repos. The agent-session support sits on top; you can ignore it and still get all the worktree, branch, and port management.',
  },
  {
    q: 'Where does my actual code live?',
    a: 'In worktrees, under works/<feature>/wt/<repo>. That’s a normal git checkout on your feature branch — build it, run it, commit, push. The pristine clone mx keeps is only read-only reference that worktrees fork from.',
  },
  {
    q: 'Do I have to hand-edit any config files?',
    a: 'No — and you shouldn’t. mx owns its state files (the work manifest and the editor workspace). You change them only through mx commands; every read command has a --porcelain flag that emits stable JSON for scripts and agents.',
  },
  {
    q: 'Which platforms does it run on?',
    a: 'mx is cross-platform (Node 22+ and git). A couple of convenience helpers that open a fullscreen Terminal window — mx work open -o and mx divider -o — are macOS-only; everything else works everywhere.',
  },
];

/**
 * The in-page nav links. `href` is an anchor to a section id on this page.
 */
export const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Why mx', href: '#why' },
  { label: 'Agents', href: '#agents' },
  { label: 'Concepts', href: '#concepts' },
  { label: 'Quickstart', href: '#quickstart' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Commands', href: '#commands' },
];
