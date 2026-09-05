import type { TemplateDefinition } from './index';
import { FIVE_WS_NAME, FIVE_WS_SITE_TITLE, LAYOUT_WORKSHOP } from './index';
import historyShelf from './shelves/history.json';
import thingsShelf from './shelves/things.json';
// The round engine, verbatim (ADR 0016): the app's `src/game/*.ts` is the one
// source; the site gets a copy so the game runs in the visitor's browser.
import gameHidden from '@/game/hidden.ts?raw';
import gameShelf from '@/game/shelf.ts?raw';
import gameRound from '@/game/round.ts?raw';
import gamePrompts from '@/game/prompts.ts?raw';
import gameTranscript from '@/game/transcript.ts?raw';
import gameLeaks from '@/game/leaks.ts?raw';
import gameIndex from '@/game/index.ts?raw';
// The play surface — real files under 5ws-site/ (type-checked and tested here),
// written into the crux at the same relative paths.
import siteRound from './5ws-site/src/components/Round.tsx?raw';
import siteSession from './5ws-site/src/lib/session.ts?raw';
import siteModel from './5ws-site/src/lib/model.ts?raw';
import siteLocalState from './5ws-site/src/lib/local-state.ts?raw';
import siteLeaderboard from './5ws-site/src/lib/leaderboard.ts?raw';
import siteStore from './5ws-site/src/lib/store.ts?raw';
import siteFormat from './5ws-site/src/lib/format.ts?raw';
import siteTyping from './5ws-site/src/lib/typing.ts?raw';
import siteDecrypt from './5ws-site/src/lib/decrypt.ts?raw';
import siteShare from './5ws-site/src/lib/share.ts?raw';
import siteCountdown from './5ws-site/src/lib/countdown.ts?raw';
import sitePhosphor from './5ws-site/src/lib/phosphor.ts?raw';
import siteSound from './5ws-site/src/lib/sound.ts?raw';
import siteRoundCss from './5ws-site/src/styles/round.css?raw';

/**
 * 5Ws — an Interrogable Crux (ADR 0016) as an Astro Site Crux.
 *
 * The template is the engine; the Shelf is the game. `shelf.json` at the root
 * is the bounded set a round draws from (its `question` — "Who am I?", "What
 * am I?" — is the site's heading; nothing here hardcodes the product name).
 * `rounds/*.md` are finished rounds: the conversation is the artifact. The
 * pages show the shelf and the transcripts and hand off to the app to play.
 *
 * The whole site reads as one machine — a calm terminal: one monospace face,
 * the voice in phosphor, the interface in grey a step smaller (global.css says
 * why the spec's serif/sans rule was set aside). The voice types on /play; the
 * one keyframe is the cursor's blink. `meta.game.shelfPath` marks the crux
 * interrogable to the Builder.
 *
 * `/play` is the game itself: a React island that runs the round in the
 * visitor's browser with the AI they connect ("Connect your AI" — provider +
 * key, kept in this browser, sent only to that provider). The engine is the
 * app's `src/game/` copied in verbatim; the daily figure is seeded by the UTC
 * day; a signed-in visitor's daily score goes to the crux's board — a key in
 * the crux's own Crux Store (`leaderboard:<day>`, mode `public`: the crux's one
 * value, readable by all, written with a sign-in; one entry per username by
 * the page's convention), with `played:<day>` (protected) marking the day's
 * counted round. No other backend; a fork carries its own board.
 */

export const SHELF_PATH = 'shelf.json';
/** The second starter shelf ships alongside so a curator can swap genres without leaving the folder. */
export const THINGS_SHELF_PATH = 'shelves/things.json';
export const SAMPLE_ROUND_PATH = 'rounds/2026-09-05-1.md';
/** The play page's source file — the Builder opens it so the preview shows /play. */
export const PLAY_PAGE_PATH = 'src/pages/play.astro';

/** The engine, written into the crux at `src/game/` — every module of the app's `src/game/` but the harness. */
export const ENGINE_FILES: readonly { path: string; content: string }[] = [
  { path: 'src/game/hidden.ts', content: gameHidden },
  { path: 'src/game/shelf.ts', content: gameShelf },
  { path: 'src/game/round.ts', content: gameRound },
  { path: 'src/game/prompts.ts', content: gamePrompts },
  { path: 'src/game/transcript.ts', content: gameTranscript },
  { path: 'src/game/leaks.ts', content: gameLeaks },
  { path: 'src/game/index.ts', content: gameIndex },
];

/** The play surface, mirrored from `src/templates/5ws-site/` (same relative paths). */
export const SITE_FILES: readonly { path: string; content: string }[] = [
  { path: 'src/components/Round.tsx', content: siteRound },
  { path: 'src/lib/session.ts', content: siteSession },
  { path: 'src/lib/model.ts', content: siteModel },
  { path: 'src/lib/local-state.ts', content: siteLocalState },
  { path: 'src/lib/leaderboard.ts', content: siteLeaderboard },
  { path: 'src/lib/store.ts', content: siteStore },
  { path: 'src/lib/format.ts', content: siteFormat },
  { path: 'src/lib/typing.ts', content: siteTyping },
  { path: 'src/lib/decrypt.ts', content: siteDecrypt },
  { path: 'src/lib/share.ts', content: siteShare },
  { path: 'src/lib/countdown.ts', content: siteCountdown },
  { path: 'src/lib/phosphor.ts', content: sitePhosphor },
  { path: 'src/lib/sound.ts', content: siteSound },
  { path: 'src/styles/round.css', content: siteRoundCss },
];

const shelfJson = JSON.stringify(historyShelf, null, 2) + '\n';
const thingsJson = JSON.stringify(thingsShelf, null, 2) + '\n';

const template: TemplateDefinition = {
  skill: '5ws',
  greeting:
    `${FIVE_WS_NAME} is set up: a Shelf of ${historyShelf.entries.length} historical ` +
    'figures in shelf.json (a second shelf of objects and places waits in shelves/things.json), ' +
    'one sample round in rounds/, and an Astro site that shows the shelf, every transcript, and the ' +
    'game itself at /play (visitors connect their own AI and play in the browser). ' +
    'This conversation is with you, the curator — never with the hidden thing. Ask me to add to the ' +
    'shelf, tighten a voice note, check a source, or restyle the pages. To play, use Start a ' +
    'round in the Builder — it opens /play in the preview.',
  layout: LAYOUT_WORKSHOP,
  meta: { game: { shelfPath: SHELF_PATH } },
  contentModel: {
    collections: [
      {
        name: 'Rounds',
        singular: 'Round',
        glob: 'rounds/*.md',
        routeBase: '/rounds/',
        fields: [
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Round 2' },
          { key: 'date', label: 'Date', type: 'text', placeholder: '2026-09-05' },
          { key: 'shelf', label: 'Shelf', type: 'text', placeholder: 'history' },
          { key: 'question', label: 'Question', type: 'text', placeholder: 'Who am I?' },
          { key: 'score', label: 'Score', type: 'number', placeholder: '10' },
          {
            key: 'outcome',
            label: 'Outcome',
            type: 'select',
            options: [
              { label: 'Solved', value: 'won' },
              { label: 'Out of points', value: 'lost' },
              { label: 'Gave up', value: 'gaveUp' },
              { label: 'Time up', value: 'timeUp' },
            ],
          },
          { key: 'questions', label: 'Questions asked', type: 'number', placeholder: '6' },
        ],
        new: {
          pathTemplate: 'rounds/{slug}.md',
          frontmatter: {
            title: '{title}',
            date: '{today}',
            shelf: 'history',
            question: 'Who am I?',
            score: '',
            outcome: '',
            questions: '',
          },
          body:
            '\n*A voice is here. It will not give itself away.*\n\n' +
            'A played round writes this file for you (Start a round in the Builder). ' +
            'If you are transcribing one by hand: **You:** lines for the questions, plain ' +
            'paragraphs for the voice, then "## Guesses" and "## Reveal" (with "### This was").\n',
        },
        sort: { field: 'date', dir: 'desc' },
      },
    ],
    settings: {
      path: SHELF_PATH,
      fields: [
        { key: 'title', label: 'Shelf title', type: 'text', placeholder: 'History' },
        {
          key: 'question',
          label: 'The question',
          type: 'text',
          placeholder: 'Who am I? · What am I? · Where am I? · When am I?',
        },
        {
          key: 'description',
          label: 'One line about this shelf',
          type: 'textarea',
          placeholder: "Somebody dead is talking to you and won't say who they are.",
        },
      ],
    },
    actions: [
      { label: 'Add to shelf', icon: '📚', do: { type: 'add-shelf-entry', path: SHELF_PATH } },
      { label: 'Start a round', icon: '🕯️', do: { type: 'open-round' } },
    ],
  },
  files: [
    {
      path: 'package.json',
      content: `{
  "name": "5ws",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^4.0.27",
    "@ai-sdk/google": "^4.0.31",
    "@ai-sdk/openai": "^4.0.27",
    "@astrojs/react": "^4.4.2",
    "ai": "^7.0.47",
    "astro": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
`,
    },
    {
      path: 'astro.config.mjs',
      content: `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The round (/play) is a React island; everything else is static HTML. The dev
// toolbar is off: it floats over the round's bottom bar in the preview.
export default defineConfig({ integrations: [react()], devToolbar: { enabled: false } });
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "noUncheckedIndexedAccess": true
  },
  "include": [".astro/types.d.ts", "src/**/*"],
  "exclude": ["dist"]
}
`,
    },
    ...ENGINE_FILES,
    ...SITE_FILES,
    {
      path: '.cruxignore',
      content: `# Files the app never versions (build machinery)
node_modules/
dist/
.astro/
`,
    },
    { path: SHELF_PATH, content: shelfJson },
    { path: THINGS_SHELF_PATH, content: thingsJson },
    {
      path: 'public/favicon.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#0f0f0e"/>
  <rect x="9" y="8" width="10" height="16" fill="#e0a83a"/>
</svg>
`,
    },
    {
      path: 'src/lib/shelf.ts',
      content: `/**
 * The Shelf is the game: its question is the site's heading. When a shelf
 * omits one, the kind of its entries decides — the most common kind wins,
 * ties go to the first entry.
 */
export const DEFAULT_QUESTIONS: Record<string, string> = {
  person: 'Who am I?',
  character: 'Who am I?',
  object: 'What am I?',
  place: 'Where am I?',
  event: 'When am I?',
};

export interface ShelfLike {
  title: string;
  question?: string;
  voicePerson?: string;
  description?: string;
  entries: { kind: string }[];
}

export function questionFor(shelf: ShelfLike): string {
  if (shelf.question && shelf.question.trim()) return shelf.question.trim();
  const counts = new Map<string, number>();
  for (const e of shelf.entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  let best = shelf.entries[0]?.kind ?? 'person';
  let bestCount = 0;
  for (const e of shelf.entries) {
    const n = counts.get(e.kind) ?? 0;
    if (n > bestCount) {
      best = e.kind;
      bestCount = n;
    }
  }
  return DEFAULT_QUESTIONS[best] ?? 'Who am I?';
}

/** How the hidden things refer to themselves. Objects and places speak as "I" too. */
export function voicePersonOf(shelf: ShelfLike): string {
  return shelf.voicePerson?.trim() || 'I';
}

/** "rounds/2026-09-05-1.md" → "2026-09-05-1" */
export function slugOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\\.md$/, '');
}
`,
    },
    {
      path: 'src/styles/global.css',
      content: `/* The whole site is one machine: a calm terminal program — a modern TUI, not
   an arcade cabinet. One monospace face for everything; the voice in phosphor
   at full brightness, the interface in a cool grey one size step down.

   This sets aside the spec's "serif for anything with a voice, sans for the
   interface" on purpose: a terminal has one face, so voice and interface are
   told apart by brightness and colour instead. Amber by default, green as the
   other phosphor (data-phosphor on <html>, remembered in this browser — the
   head applies it before first paint). Almost no motion: the one keyframe is
   the block cursor's blink, and nothing blinks under reduced motion. Faint
   scanlines on desktop only, felt more than seen. No glow beyond a 1px hint
   on the voice; no frame, no vignette, no flicker.

   Contrast (WCAG AA, against the ground): interface grey ≈ 8:1, dim grey ≈ 5.4:1,
   amber ≈ 8.9:1, green ≈ 10:1. Mobile-first: one column, a reading measure,
   tap targets you can hit with a thumb. */
:root {
  --bg: #0f0f0e;
  --voice: #e0a83a;
  --voice-dim: #9a7a36;
  --bright: #d4d7dc;
  --text: #a4aab3;
  --muted: #828a96;
  --rule: #26272a;
  --rule-strong: #3a3c40;
  --field: #161615;
  --error: #d98a7a;
  --glow: 0 0 1px color-mix(in srgb, var(--voice) 50%, transparent);
  --mono: 'IBM Plex Mono', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono',
    ui-monospace, monospace;
  --ui: 0.85rem; /* the interface: one step down from the voice */
  --voice-size: 1rem;
  --measure: 72ch;
  --gutter: clamp(1rem, 4vw, 2rem);
  --tap: 2.75rem;
}
:root[data-phosphor='green'] {
  --bg: #0c100d;
  --voice: #5fd77a;
  --voice-dim: #3f8a52;
  --rule: #222925;
  --rule-strong: #33403a;
  --field: #121815;
}

* { box-sizing: border-box; }
html { font-size: clamp(1rem, 0.95rem + 0.25vw, 1.0625rem); -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: var(--ui);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
/* Scanlines: ≤ 0.03, desktop only — on a phone they muddy small text */
@media (min-width: 40rem) {
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 99;
    pointer-events: none;
    background: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.028) 0,
      rgba(255, 255, 255, 0.028) 1px,
      transparent 1px,
      transparent 3px
    );
  }
}

/* The one thing that moves */
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.cursor {
  color: var(--voice);
  animation: blink 1s steps(1, end) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; }
}

main {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 1.5rem var(--gutter) 5rem;
}
@media (min-width: 40rem) { main { padding-top: 2.5rem; padding-bottom: 7rem; } }

a { color: var(--text); text-decoration: underline; text-decoration-color: var(--rule-strong); }
a:hover { color: var(--bright); text-decoration-color: currentColor; }

/* ── Interface ── */
.masthead {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0.35rem var(--gutter) 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0 1rem;
  color: var(--muted);
  border-bottom: 1px solid var(--rule);
}
.masthead a { color: var(--text); display: inline-flex; align-items: center; min-height: var(--tap); text-decoration: none; }
.masthead a:hover { text-decoration: underline; }
.masthead nav { display: flex; align-items: center; gap: 1.25rem; }
.masthead nav a { color: var(--muted); }
button.toggle {
  min-height: var(--tap);
  padding: 0 0.5rem;
  font: inherit;
  font-size: 0.7rem;
  color: var(--muted);
  background: none;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}
button.toggle::before { content: '['; color: var(--rule-strong); }
button.toggle::after { content: ']'; color: var(--rule-strong); }
button.toggle:hover { color: var(--text); }

/* Section headings as ruled lines: ── the shelf ──────── */
h2 {
  display: flex;
  align-items: center;
  gap: 0.75ch;
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--muted);
  margin: 2.5rem 0 1rem;
}
h2::before { content: '──'; color: var(--rule-strong); }
h2::after { content: ''; flex: 1; border-top: 1px solid var(--rule); }
h2 .count { color: var(--muted); }
h2 .count::before { content: '('; }
h2 .count::after { content: ')'; }

.lede { color: var(--bright); margin: 0 0 0.5rem; }
.how, .note, .facts, .crumb, .tag, .adjacent, .site-foot { color: var(--muted); }
.how { margin: 0; }
.how a, .crumb a, .play a { display: inline-block; padding: 0.35rem 0; }
.note { margin: -0.5rem 0 1.25rem; }

.play { padding-top: 0.5rem; }
.play p { margin: 0; }
.play .play-link { display: inline-block; min-height: var(--tap); line-height: var(--tap); color: var(--bright); }
.play .play-link::before { content: '> '; color: var(--voice); }
.play .url { display: block; margin-top: 0.35rem; font-size: 0.75rem; color: var(--muted); }
/* /play: the island is the page */
body.bare main { max-width: none; padding: 0; }

/* The shelf as a directory listing: name, dotted leader, kind and era */
ol.entries { list-style: none; padding: 0; margin: 0; }
ol.entries li {
  display: flex;
  align-items: baseline;
  gap: 1ch;
  min-height: var(--tap);
  padding: 0.35rem 0;
  break-inside: avoid;
}
/* Names wrap at words, never inside one; the leader takes what is left */
ol.entries .name { order: 1; flex: 0 1 auto; min-width: 0; overflow-wrap: normal; color: var(--text); }
ol.entries li::before {
  content: '';
  order: 2;
  flex: 1 1 2ch;
  min-width: 2ch;
  border-bottom: 1px dotted var(--rule-strong);
  transform: translateY(-0.35em);
}
ol.entries .meta { order: 3; flex: 0 0 auto; color: var(--muted); font-size: 0.75rem; white-space: nowrap; }
/* One column, like a directory listing: at the reading measure every name, its leader and
   its era fit on a single line */
@media (min-width: 40rem) {
  ol.entries li { min-height: 0; padding: 0.3rem 0; }
}

ul.round-list { list-style: none; padding: 0; margin: 0; }
ul.round-list li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--rule);
}
ul.round-list li > a, ul.round-list li > span:first-child { display: inline-block; min-height: 1.75rem; }
@media (min-width: 40rem) {
  ul.round-list li { flex-direction: row; justify-content: space-between; gap: 1rem; }
}
.tag {
  display: inline-block;
  padding: 0 0.4rem;
  border: 1px solid var(--rule-strong);
  border-radius: 2px;
  font-size: 0.7rem;
  margin-left: 0.5rem;
  vertical-align: middle;
}

/* The board: a plain aligned table */
table.board { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
table.board th, table.board td { text-align: left; padding: 0.4rem 0.5ch; border-bottom: 1px solid var(--rule); }
table.board th { font-size: 0.7rem; font-weight: 400; letter-spacing: 0.04em; text-transform: lowercase; color: var(--muted); }
table.board td:first-child, table.board th:first-child { width: 3ch; color: var(--muted); }
table.board td:nth-child(3), table.board td:nth-child(4), table.board th:nth-child(3), table.board th:nth-child(4) { text-align: right; white-space: nowrap; }
#board-switch a { display: inline-block; min-height: var(--tap); line-height: var(--tap); }

/* ── Voice: the bright thing on the screen ── */
h1.question, .voice, .transcript p, .transcript li, .transcript h3 {
  color: var(--voice);
  text-shadow: var(--glow);
  font-size: var(--voice-size);
}
h1.question {
  font-size: clamp(1.5rem, 1.2rem + 1.5vw, 2rem);
  font-weight: 400;
  line-height: 1.2;
  margin: 0 0 1rem;
}
h1.question::before { content: '▮ '; color: var(--voice-dim); }
/* The round's title is interface, not voice */
.round-head h1 { font-size: 1.15rem; font-weight: 600; color: var(--bright); margin: 0.25rem 0 0.5rem; }
.round-head .crumb { margin: 0; }
.round-head .facts { margin: 0 0 2rem; }

.transcript { line-height: 1.7; }
.transcript p { margin: 0 0 1.3rem; }
.transcript p em:only-child { color: var(--voice-dim); }
/* The player's lines are interface, not voice */
.transcript p:has(> strong:first-child) {
  color: var(--muted);
  text-shadow: none;
  font-size: var(--ui);
  margin: 1.75rem 0 0.75rem;
}
.transcript p:has(> strong:first-child)::before { content: '> '; color: var(--rule-strong); }
.transcript p:has(> strong:first-child) strong { font-weight: 600; color: var(--text); }
/* "Guesses" and "Reveal" are section labels: interface */
.transcript h2 { margin: 3rem 0 1.5rem; }
/* "This was", "Why they matter", "The misses", "Parting": the voice's own headings */
.transcript h3 { font-size: calc(var(--voice-size) * 1.15); font-weight: 400; margin: 2rem 0 0.75rem; color: var(--voice-dim); text-shadow: none; }
.transcript h3 + p { font-size: calc(var(--voice-size) * 1.1); }
.transcript ul { list-style: none; padding: 0; }
.transcript li { margin-bottom: 0.75rem; padding-left: 2ch; text-indent: -2ch; }
.transcript li::before { content: '· '; color: var(--muted); }
.transcript li strong { color: var(--text); text-shadow: none; }

.adjacent { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--rule); }
.adjacent h3 {
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--muted);
  margin: 1.5rem 0 0.5rem;
}
.adjacent ul { list-style: none; padding: 0; margin: 0; }
.adjacent li a { display: inline-block; min-height: var(--tap); line-height: var(--tap); }
.adjacent p a { display: inline-block; min-height: var(--tap); line-height: var(--tap); }

.about h2 { margin-top: 2.5rem; }
.about p, .about li { color: var(--text); }
.about li { margin-bottom: 0.5rem; }
.about strong { color: var(--bright); }

.site-foot { max-width: var(--measure); margin: 0 auto; padding: 0 var(--gutter) 3rem; font-size: 0.75rem; }
`,
    },
    {
      path: 'src/layouts/Base.astro',
      content: `---
import shelf from '../../shelf.json';
import { questionFor } from '../lib/shelf';
import '../styles/global.css';
const question = questionFor(shelf);
const tagline = ${JSON.stringify(FIVE_WS_SITE_TITLE)};
const { title = tagline, description = shelf.description, bare = false } = Astro.props;
const base = import.meta.env.BASE_URL;
---

<!doctype html>
<html lang="en" data-phosphor="amber">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <!-- The remembered phosphor, before first paint (see src/lib/phosphor.ts) -->
    <script is:inline>
      try {
        if (localStorage.getItem('5ws:phosphor') === 'green')
          document.documentElement.setAttribute('data-phosphor', 'green');
      } catch (e) {}
    </script>
  </head>
  <body class={bare ? 'bare' : ''}>
    {!bare && (
      <header class="masthead">
        <a href={base}>{shelf.title}</a>
        <nav>
          <a href={base}>Shelf</a>
          <a href={base + 'play/'}>Play</a>
          <a href={base + 'about/'}>About</a>
          <button type="button" class="toggle" id="phosphor-toggle" title="Switch phosphor">amber</button>
        </nav>
      </header>
    )}
    <main>
      <slot />
    </main>
    {!bare && <footer class="site-foot">A Shelf and its Rounds. Press Play.</footer>}
  </body>
</html>

<script>
  // The phosphor toggle: amber ⇄ green, remembered in this browser
  import { applyPhosphor, currentPhosphor, otherPhosphor, savePhosphor } from '../lib/phosphor';
  const root = document.documentElement;
  const button = document.getElementById('phosphor-toggle');
  if (button) {
    const show = () => {
      const p = currentPhosphor(root);
      button.textContent = p;
      button.setAttribute('aria-label', 'Phosphor ' + p + ' — switch to ' + otherPhosphor(p));
    };
    show();
    button.addEventListener('click', () => {
      const next = otherPhosphor(currentPhosphor(root));
      applyPhosphor(root, next);
      savePhosphor(localStorage, next);
      show();
    });
  }
</script>
`,
    },
    {
      path: 'src/pages/index.astro',
      content: `---
import Base from '../layouts/Base.astro';
import shelf from '../../shelf.json';
import { questionFor, slugOf } from '../lib/shelf';

const base = import.meta.env.BASE_URL;
const question = questionFor(shelf);

const modules = import.meta.glob('../../rounds/*.md', { eager: true });
const all = Object.entries(modules).map(([path, mod]) => ({
  slug: slugOf(path),
  fm: (mod as { frontmatter: Record<string, any> }).frontmatter,
}));
// The sample round keeps the site from being empty; once real rounds exist it steps aside.
const real = all.filter((r) => !r.fm.sample);
const rounds = (real.length ? real : all).sort(
  (a, b) => day(b.fm.date).localeCompare(day(a.fm.date)) || b.slug.localeCompare(a.slug),
);
const outcomes: Record<string, string> = {
  won: 'solved',
  lost: 'out of points',
  gaveUp: 'gave up',
  timeUp: 'time up',
};
const day = (d: unknown) => String(d ?? '').slice(0, 10);
---

<Base>
  <section class="intro">
    <h1 class="question">{question}</h1>
    <p class="lede">{shelf.description ?? 'A voice is talking to you and will not give itself away.'}</p>
    <p class="how">
      Ten questions cost nothing. A wrong guess costs a point. Five minutes.
      <a href={base + 'about/'}>How to play</a>
    </p>
  </section>

  <section class="play">
    <h2>Play</h2>
    <p>
      <a class="play-link" href={base + 'play/'}>Play today’s round</a>
      <span class="url">Runs in your browser with an AI you connect. The first round of the day counts for the board.</span>
    </p>
  </section>

  <section class="today" id="today" hidden>
    <h2 id="board-title">Today</h2>
    <p class="note" id="board-empty">No one has played today.</p>
    <table class="board" id="board" hidden>
      <thead>
        <tr><th>#</th><th>Name</th><th>Score</th><th>Time</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="note" id="board-switch" hidden><a href="#today" id="board-link">Yesterday</a></p>
  </section>

  <section class="shelf">
    <h2>The shelf <span class="count">{shelf.entries.length}</span></h2>
    <p class="note">You are guessing against this set and nothing outside it.</p>
    <ol class="entries">
      {shelf.entries.map((e) => (
        <li class="entry">
          <span class="name">{e.name}</span>
          <span class="meta">{e.kind}{e.era ? ' · ' + e.era : ''}</span>
        </li>
      ))}
    </ol>
  </section>

  <section class="rounds">
    <h2>Rounds <span class="count">{rounds.length}</span></h2>
    {rounds.length === 0 ? (
      <p class="note">No rounds yet.</p>
    ) : (
      <ul class="round-list">
        {rounds.map((r) => (
          <li>
            <span>
              <a href={base + 'rounds/' + r.slug + '/'}>{r.fm.title}</a>
              {r.fm.sample && <span class="tag">sample</span>}
            </span>
            <span class="facts">
              {day(r.fm.date)} · {outcomes[r.fm.outcome] ?? r.fm.outcome} · {r.fm.score} pts
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
</Base>

<script>
  // ── Today's board ──
  // The day's board is a key in this crux's own store ('leaderboard:<day>',
  // mode 'public': the crux's one value, readable by all, written with a sign-in).
  // The play page writes it; this page only reads, whichever way the store is
  // reachable — the API when published, the host frame in the preview.
  import { storeFor } from '../lib/store';
  import { clockOf, readBoard, utcDayAgo, type Leaderboard } from '../lib/leaderboard';

  const store = storeFor(null);
  const section = document.getElementById('today');
  const title = document.getElementById('board-title');
  const empty = document.getElementById('board-empty');
  const table = document.getElementById('board') as HTMLTableElement | null;
  const switcher = document.getElementById('board-switch');
  const link = document.getElementById('board-link');

  function render(board: Leaderboard, label: string) {
    if (!table || !empty || !title) return;
    const rows = board.entries.slice(0, 20);
    title.textContent = label;
    empty.textContent = 'No one has played ' + label.toLowerCase() + '.';
    const tbody = table.tBodies[0]!;
    tbody.replaceChildren(
      ...rows.map((e, i) => {
        const tr = document.createElement('tr');
        for (const text of [String(i + 1), e.name, String(e.score), clockOf(e.seconds)]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        return tr;
      }),
    );
    table.hidden = rows.length === 0;
    empty.hidden = rows.length > 0;
  }
  if (section && store) {
    (async () => {
      const [today, yesterday] = await Promise.all([
        readBoard(store, utcDayAgo(0)),
        readBoard(store, utcDayAgo(1)),
      ]);
      render(today, 'Today');
      section.hidden = false;
      if (switcher && link && yesterday.entries.length > 0) {
        switcher.hidden = false;
        let showing: 'today' | 'yesterday' = 'today';
        link.addEventListener('click', (ev) => {
          ev.preventDefault();
          showing = showing === 'today' ? 'yesterday' : 'today';
          render(showing === 'today' ? today : yesterday, showing === 'today' ? 'Today' : 'Yesterday');
          link.textContent = showing === 'today' ? 'Yesterday' : 'Today';
        });
      }
    })();
  }
</script>
`,
    },
    {
      path: 'src/pages/rounds/[slug].astro',
      content: `---
import Base from '../../layouts/Base.astro';
import shelf from '../../../shelf.json';
import { questionFor } from '../../lib/shelf';

export async function getStaticPaths() {
  const modules = import.meta.glob('../../../rounds/*.md', { eager: true });
  const slug = (p: string) => (p.split('/').pop() ?? p).replace(/\\.md$/, '');
  const all = Object.entries(modules).map(([path, mod]) => ({
    slug: slug(path),
    mod: mod as { frontmatter: Record<string, any>; Content: any },
  }));
  return all.map(({ slug, mod }) => ({
    params: { slug },
    props: {
      round: mod,
      others: all
        .filter((o) => o.slug !== slug)
        .map((o) => ({ slug: o.slug, title: o.mod.frontmatter.title, date: o.mod.frontmatter.date }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 6),
    },
  }));
}

const base = import.meta.env.BASE_URL;
const question = questionFor(shelf);
const { round, others } = Astro.props as {
  round: { frontmatter: Record<string, any>; Content: any };
  others: { slug: string; title: string; date: string }[];
};
const fm = round.frontmatter;
const { Content } = round;
const guesses = Array.isArray(fm.guesses) ? fm.guesses.length : 0;
const outcomes: Record<string, string> = {
  won: 'solved',
  lost: 'out of points',
  gaveUp: 'gave up',
  timeUp: 'time up',
};
const day = (d: unknown) => String(d ?? '').slice(0, 10);
const mins = Math.round((Number(fm.durationSeconds) || 0) / 60);
---

<Base title={fm.title}>
  <article class="round">
    <header class="round-head">
      <p class="crumb"><a href={base}>{question}</a></p>
      <h1>{fm.title}{fm.sample && <span class="tag">sample</span>}</h1>
      <p class="facts">
        {day(fm.date)} · {fm.questions} questions · {guesses} {guesses === 1 ? 'guess' : 'guesses'} ·
        {fm.score} points · {outcomes[fm.outcome] ?? fm.outcome}{mins ? ' · ' + mins + ' min' : ''}
      </p>
    </header>

    <div class="transcript">
      <Content />
    </div>

    <footer class="adjacent">
      <p><a href={base}>← The shelf</a></p>
      {others.length > 0 && (
        <>
          <h3>Other rounds</h3>
          <ul>
            {others.map((o) => (
              <li>
                <a href={base + 'rounds/' + o.slug + '/'}>{o.title}</a>
                <span class="facts"> · {day(o.date)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </footer>
  </article>
</Base>
`,
    },
    {
      path: 'src/pages/about.astro',
      content: `---
import Base from '../layouts/Base.astro';
import shelf from '../../shelf.json';
import { questionFor, voicePersonOf } from '../lib/shelf';

const base = import.meta.env.BASE_URL;
const question = questionFor(shelf);
const person = voicePersonOf(shelf);
const sourced = shelf.entries.filter((e) => e.provenance === 'sourced').length;
const unsourced = shelf.entries.length - sourced;
---

<Base title={'About · ' + question}>
  <div class="about">
    <h1 class="question">{question}</h1>
    <p class="voice">
      {shelf.description ?? 'A voice is talking to you and will not give itself away.'} It speaks
      as “{person}”. You ask questions. You work it out. A round takes about five minutes.
    </p>

    <h2>How to play</h2>
    <p>
      <a href={base + 'play/'}>Press Play.</a> The first time, connect your AI — a provider and a
      key, kept in this browser and sent only to that provider. Someone is already talking when
      the round opens. Ask what you like; guess when you are ready. Losing is fine — a shrug and
      another round.
    </p>

    <h2>Three currencies</h2>
    <ul>
      <li><strong>Questions cost nothing.</strong> Ten of them.</li>
      <li><strong>Searches cost seconds.</strong> Search opens a new tab; the five-minute clock runs while you read a page and pauses while the voice is composing.</li>
      <li><strong>Guesses cost points.</strong> Ten to start. A wrong guess costs one; the right one costs nothing. A first-try hit is a clean ten.</li>
    </ul>

    <h2>The disclosure rule</h2>
    <p>
      The voice will never say its name, nor the single most famous work, invention, battle
      or act, outright. Everything else is fair. It may evade, boast, bristle or refuse — in
      character — but it will not lie. A vivid line is a gift to a good searcher; that is a
      skill.
    </p>

    <h2>The reveal</h2>
    <p>
      At the end: who it was, why it matters, and why each wrong guess was reasonable. The
      misses are the curriculum. A finished round hands you its transcript — a markdown page the
      curator can add to this crux, so the conversation is the artifact.
    </p>

    <h2>Provenance</h2>
    <p>
      This shelf, <strong>{shelf.title}</strong>, holds {shelf.entries.length} entries:
      {sourced} <em>sourced</em> (each carries pages its facts can be checked against)
      {unsourced > 0 ? ' and ' + unsourced + ' unsourced (the voice speaks from what is commonly told, and may be wrong)' : ''}.
      Nobody on it is alive. A shelf is a genre; fork this crux and curate your own.
    </p>

    <p class="crumb"><a href={base}>← The shelf</a></p>
  </div>
</Base>
`,
    },
    {
      path: PLAY_PAGE_PATH,
      content: `---
import Base from '../layouts/Base.astro';
import shelf from '../../shelf.json';
import { questionFor } from '../lib/shelf';
import Round from '../components/Round';
import '../styles/round.css';

// The game. Nothing else on screen: the layout is bare, the island is the page.
// The game's name (the tagline's first word) heads the boot line and the share block.
const base = import.meta.env.BASE_URL;
const question = questionFor(shelf);
const tagline = ${JSON.stringify(FIVE_WS_SITE_TITLE)};
const name = tagline.split(' — ')[0];
---

<Base title={question} bare>
  <Round client:only="react" shelf={shelf} base={base} name={name} />
</Base>
`,
    },
    {
      path: SAMPLE_ROUND_PATH,
      content: `---
title: "Round 1"
date: "2026-09-05T09:12:00.000Z"
shelf: "history"
question: "Who am I?"
entry:
  name: "Hypatia"
  kind: "person"
  era: "c. 355–415"
score: 8
outcome: "won"
questions: 5
guesses:
  - text: "Archimedes"
    correct: false
  - text: "Sappho"
    correct: false
  - text: "Hypatia"
    correct: true
durationSeconds: 231
keptPages: []
sample: true
---

Ask what you like. I have answered harder questions than yours, in a harder city.

**You:** Are you a man or a woman?

A woman, and I taught men who paid to be corrected by one. Do not look so surprised; the surprise was theirs.

**You:** Did you write anything?

Commentaries — on other people's mathematics, which is the honest kind of writing. None survived. The city was careless with paper.

**You:** Were you religious?

Pagan enough to be killed for it, and philosophical enough to have argued that the two words were the trouble. The heavens I studied were the only ones I felt sure of.

**You:** What century?

The fourth turning into the fifth, by your counting. The empire was Christian by then. I was not.

**You:** Did you have students?

Many, and from every faith the city held. One became a bishop and kept writing to me anyway. That should tell you something about the teacher, or the bishop.

## Guesses

- Archimedes — not it
- Sappho — not it
- Hypatia — that was it

## Reveal

### This was

Hypatia of Alexandria, c. 355–415.

### Why they matter

Mathematician, astronomer and philosopher; she led the city's Neoplatonist school and taught pagans and Christians alike in a city tearing itself apart along that line. She was murdered by a mob in 415. Almost nothing she wrote survives; what we know comes from her students' letters and the historians who argued about her death.

### The misses

- **Archimedes** — a mathematician of the ancient Mediterranean who died violently at a soldier's hands. The era was off by six centuries, and he was Sicilian, not Alexandrian; the voice gave you both.
- **Sappho** — a learned woman of the Greek world whose work survives only in fragments, which fit "none survived". But a poet, and much earlier.

### Parting

You got there with two points to spare and a bishop's help. Most of my students needed longer.
`,
    },
  ],
};

export default template;
