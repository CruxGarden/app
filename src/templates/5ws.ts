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
import siteTheme from './5ws-site/src/lib/theme.ts?raw';
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
 * The whole site wears the app's Soft Serve Mood: a blush page (deep navy in
 * dark), white cards with 24px corners and no borders, heavy titles, hairline
 * dividers, grey secondary text, a coral accent; light and dark with a toggle
 * that defaults to the system (global.css says why the spec's serif/sans rule
 * was set aside — the voice is the biggest, boldest text instead). The voice
 * types on /play; the cursor blinks; nothing else moves. `meta.game.shelfPath`
 * marks the crux interrogable to the Builder.
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
  { path: 'src/lib/theme.ts', content: siteTheme },
  { path: 'src/lib/sound.ts', content: siteSound },
  { path: 'src/styles/round.css', content: siteRoundCss },
];

/**
 * The theme toggle's glyphs — a sun and a moon; the stylesheet shows the one
 * for the theme in effect. Inline SVG, so no request and no icon font.
 * (Round.tsx carries the same two as JSX.)
 */
const THEME_GLYPHS = `<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
            <svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

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
  <rect width="32" height="32" rx="9" fill="#FF4A2E"/>
  <rect x="14" y="7" width="4" height="18" rx="2" fill="#FFFFFF"/>
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
      content: `/* Soft Serve, on the site: a blush page, white cards with 24px corners and no
   borders, heavy black titles over a hairline, grey secondary text, a warm
   coral accent — the app's Soft Serve Mood (Daniel's order-screen reference,
   2026-09-05). Dark is a deep navy with the same coral. Fun and vibrant, calm.

   Type: one heavy geometric stack for everything — "Outfit" only when the
   visitor happens to have it installed (no webfont download in v1; the
   fallbacks are the system's rounded sans) — 800 for titles, 600 for the
   voice, 400–500 for the interface. The spec's "serif for anything with a
   voice, sans for the interface" stays set aside on purpose: voice and
   interface are told apart by weight, size and colour instead. The voice is
   the biggest, boldest text on the screen; the interface is smaller and grey.

   Shape: nothing is outlined (the share block's dashed coral box is the one
   asked-for exception); inputs are rounded fields on the ground colour with a
   3px coral focus ring at 35%; buttons are pills. Motion: the typing, the
   cursor's blink (the one keyframe here), a 2px nudge on a wrong guess and one
   200ms fade when a card appears (both in round.css) — nothing else. Under
   reduced motion everything is there at once.

   Theme: data-theme on <html> is what shows (light | dark), data-theme-choice
   what was picked (system | light | dark, remembered under 5ws:theme); the
   head applies both before first paint (src/lib/theme.ts). color-scheme
   follows so form controls and scrollbars match.

   Contrast (WCAG AA for body text): light — text 17:1, muted 4.9:1 on a card;
   dark — text 14:1, muted 6.5:1. The coral is for titles, pills and buttons,
   never running text. Mobile-first: one column, cards edge-to-edge with 12px
   gutters, every tap target at least 44px. */
:root {
  color-scheme: light;
  --ground: #FDEEEA;
  --card: #FFFFFF;
  --field: #FDEEEA; /* inputs sit on the ground colour */
  --text: #1C1C1C;
  --muted: #7A6F6B;
  --hairline: #EFE6E3;
  --accent: #FF4A2E;
  --accent-hover: #E63D24;
  --accent-soft: #FFEAE5;
  --on-accent: #FFFFFF;
  --highlight: #F5B400;
  --info: #7B86F6;
  --success: #2E9E5B;
  --error: #D93025;
  --shadow: 0 8px 32px rgba(60, 30, 20, 0.06);
  --ring: rgb(255 74 46 / 0.35);
  --sans: 'Outfit', 'SF Pro Rounded', ui-rounded, system-ui, sans-serif;
  --radius-card: 24px;
  --radius: 16px;
  --pill: 9999px;
  --ui: 0.9375rem;
  --voice-size: 1.35rem;
  --measure: 42rem;
  --gutter: 12px;
  --card-pad: 1.25rem;
  --tap: 2.75rem;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --ground: #0F1A2E;
  --card: #172440;
  --field: #1D2C4D;
  --text: #F3F1EC;
  --muted: #9AA4B8;
  --hairline: #22314F;
  --accent: #FF5A3F;
  --accent-hover: #FF7A63;
  --accent-soft: rgb(255 90 63 / 0.16);
  --highlight: #FFC233;
  --info: #8FA0FF;
  --success: #3FBF75;
  --error: #FF7A63;
  --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  --ring: rgb(255 90 63 / 0.35);
}
@media (min-width: 40rem) {
  :root {
    --gutter: clamp(1rem, 4vw, 2rem);
    --card-pad: 2rem;
  }
}

* { box-sizing: border-box; }
html { font-size: clamp(1rem, 0.95rem + 0.25vw, 1.0625rem); -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--ground);
  color: var(--text);
  font-family: var(--sans);
  font-size: var(--ui);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

a { color: var(--text); text-decoration: underline; text-decoration-color: var(--hairline); text-underline-offset: 0.15em; }
a:hover { text-decoration-color: currentColor; }
:focus-visible { outline: 3px solid var(--ring); outline-offset: 0; }

/* The one thing that moves: a coral rounded bar */
@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.cursor {
  display: inline-block;
  width: 0.16em;
  height: 0.9em;
  margin-left: 0.1em;
  vertical-align: -0.1em;
  border-radius: 2px;
  background: var(--accent);
  animation: blink 1s steps(1, end) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; }
}

main {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0.25rem var(--gutter) 4rem;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (min-width: 40rem) { main { gap: 1.25rem; padding-bottom: 6rem; } }
/* /play: the island is the page */
body.bare main { max-width: none; padding: 0; display: block; }

/* ── The card: white, round, borderless, one soft ambient shadow ── */
.card {
  background: var(--card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
  padding: var(--card-pad);
}
.card-head {
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--hairline);
}
.card-head > :last-child { margin-bottom: 0; }

/* ── Type ── */
h1, h2, h3, h4 { margin: 0; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
h1.question { font-size: clamp(2rem, 1.5rem + 2.5vw, 2.75rem); margin: 0 0 0.5rem; }
h2 { font-size: 1.25rem; }
h2 .count { margin-left: 0.4rem; color: var(--muted); font-weight: 600; font-size: 0.9em; }
.lede { font-size: 1.05rem; font-weight: 500; margin: 0 0 0.5rem; }
.how, .note, .facts, .crumb, .meta, .site-foot { color: var(--muted); }
.how { margin: 0 0 1rem; }
.how a, .crumb a { display: inline-block; padding: 0.35rem 0; color: var(--text); font-weight: 600; }
.note { margin: 0 0 0.75rem; font-size: 0.875rem; }
.note.error { color: var(--error); }

/* ── Pills and buttons ── */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--tap);
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--pill);
  font: inherit;
  font-size: var(--ui);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  background: var(--accent-soft);
  color: var(--accent);
}
.button:hover:not(:disabled) { filter: brightness(0.98); }
.button.primary { background: var(--accent); color: var(--on-accent); }
.button.primary:hover:not(:disabled) { background: var(--accent-hover); filter: none; }
.button.accent { background: none; color: var(--accent); }
.button.accent:hover:not(:disabled) { background: var(--accent-soft); filter: none; }
.button.quiet { background: none; color: var(--muted); }
.button.quiet:hover:not(:disabled) { color: var(--text); background: var(--field); filter: none; }
.button:disabled { opacity: 0.4; cursor: default; }
button.link {
  min-height: var(--tap);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--text);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--hairline);
  text-underline-offset: 0.15em;
  cursor: pointer;
}
button.link:hover { text-decoration-color: currentColor; }

/* The corner: the sound pill and the theme toggle, top right, on every page */
.corner { display: flex; align-items: center; gap: 0.5rem; }
button.pill {
  min-height: var(--tap);
  padding: 0 1rem;
  border: 0;
  border-radius: var(--pill);
  background: var(--card);
  color: var(--muted);
  box-shadow: var(--shadow);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
button.pill:hover { color: var(--text); }
button.pill[aria-pressed='true'] { color: var(--accent); background: var(--accent-soft); }
button.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap);
  height: var(--tap);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--card);
  color: var(--text);
  box-shadow: var(--shadow);
  cursor: pointer;
}
.theme-toggle svg { width: 20px; height: 20px; }
:root[data-theme='dark'] .theme-toggle .sun,
:root:not([data-theme='dark']) .theme-toggle .moon { display: none; }

/* ── Masthead: part of the page, no rule ── */
.masthead {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 0.75rem var(--gutter) 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}
.masthead .brand {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  font-weight: 800;
  letter-spacing: -0.02em;
  text-decoration: none;
  white-space: nowrap;
}
.masthead nav { display: flex; align-items: center; gap: 0.25rem; }
.masthead nav a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  padding: 0 0.7rem;
  border-radius: var(--pill);
  color: var(--muted);
  font-weight: 600;
  text-decoration: none;
}
.masthead nav a:hover { color: var(--text); background: var(--card); }
.masthead .theme-toggle { margin-left: 0.25rem; }

/* ── The shelf page ── */
.hero .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 1.25rem 0 0.75rem; }
.hero .note { margin: 0; }

/* The shelf: a row per entry — name bold, kind · era muted — hairlines between */
ol.entries { list-style: none; margin: 0; padding: 0; }
ol.entries li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  min-height: var(--tap);
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--hairline);
  break-inside: avoid;
}
ol.entries li:last-child { border-bottom: 0; }
ol.entries .name { font-weight: 700; min-width: 0; }
ol.entries .meta { flex: 0 0 auto; font-size: 0.8125rem; text-align: right; white-space: nowrap; }
@media (min-width: 40rem) {
  ol.entries { columns: 2; column-gap: 2.5rem; }
  ol.entries li { min-height: 0; padding: 0.5rem 0; }
}

ul.round-list { list-style: none; margin: 0; padding: 0; }
ul.round-list li {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--hairline);
}
ul.round-list li:last-child { border-bottom: 0; padding-bottom: 0; }
ul.round-list li > a, ul.round-list li > span:first-child { display: inline-block; min-height: 1.75rem; }
ul.round-list li a { font-weight: 700; text-decoration: none; }
ul.round-list .facts { font-size: 0.875rem; }
@media (min-width: 40rem) {
  ul.round-list li { flex-direction: row; justify-content: space-between; align-items: baseline; gap: 1rem; }
}
.tag {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.1rem 0.6rem;
  border-radius: var(--pill);
  background: var(--field);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0;
  vertical-align: middle;
}

/* The board: a soft table — hairlines, no box */
table.board { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
table.board th, table.board td { text-align: left; padding: 0.6rem 0.25rem; border-bottom: 1px solid var(--hairline); }
table.board tr:last-child td { border-bottom: 0; }
table.board th { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
table.board td:first-child, table.board th:first-child { width: 2.5rem; color: var(--muted); }
table.board td:nth-child(2) { font-weight: 600; }
table.board td:nth-child(3), table.board td:nth-child(4), table.board th:nth-child(3), table.board th:nth-child(4) { text-align: right; white-space: nowrap; }
.today .card-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
#board-switch { margin: 0; }
#board-switch a { display: inline-block; min-height: var(--tap); line-height: var(--tap); font-weight: 600; text-decoration: none; color: var(--accent); }

/* ── The voice: the biggest, boldest text on the screen ── */
.voice, .transcript p, .transcript h3 + p {
  font-size: var(--voice-size);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--text);
}
/* A transcript page: the card head is the round; the voice is bold, You: is muted */
.round-head .crumb { margin: 0 0 0.35rem; font-size: 0.8125rem; }
.round-head .crumb a { padding: 0; color: var(--muted); text-decoration: none; }
.round-head h1 { font-size: 1.5rem; }
.round-head .facts { margin: 0.4rem 0 0; font-size: 0.875rem; }

.transcript p { margin: 0 0 1.25rem; }
.transcript p em:only-child { color: var(--muted); font-weight: 500; font-style: normal; }
.transcript p:has(> strong:first-child) {
  margin: 0 0 0.6rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--hairline);
  color: var(--muted);
  font-size: var(--ui);
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: 0;
}
.transcript p:has(> strong:first-child) strong { font-weight: 700; }
/* "Guesses" and "Reveal" are section labels: interface */
.transcript h2 {
  margin: 2.5rem 0 1rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--hairline);
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
/* "This was", "Why they matter", "The misses", "Parting": the voice's own headings */
.transcript h3 { margin: 1.75rem 0 0.5rem; font-size: 1.05rem; }
.transcript h2 + h3 { margin-top: 0; }
.transcript ul { list-style: none; margin: 0; padding: 0; }
.transcript li {
  padding: 0.75rem 0;
  border-top: 1px solid var(--hairline);
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.45;
}
.transcript li:first-child { border-top: 0; padding-top: 0; }
.transcript li strong { font-weight: 800; }

.adjacent h3 { margin: 1rem 0 0.25rem; color: var(--muted); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.adjacent ul { list-style: none; margin: 0; padding: 0; }
.adjacent li { border-top: 1px solid var(--hairline); }
.adjacent li a, .adjacent p a { display: inline-block; min-height: var(--tap); line-height: var(--tap); font-weight: 600; text-decoration: none; }
.adjacent p { margin: 0; }
.adjacent p a { color: var(--muted); }
.adjacent .facts { font-size: 0.875rem; }

/* ── About ── */
.about section + section { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--hairline); }
.about h2 { margin: 0 0 0.5rem; font-size: 1.15rem; }
.about p, .about li { margin: 0 0 0.75rem; }
.about ul { margin: 0; padding-left: 1.1rem; }
.about strong { font-weight: 700; }
.about .voice { margin: 0.5rem 0 0; }

.site-foot { max-width: var(--measure); margin: 0 auto; padding: 0 var(--gutter) 3rem; font-size: 0.8125rem; }
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
<html lang="en" data-theme="light" data-theme-choice="system">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <!-- The remembered theme, before first paint: system unless this browser picked one.
         Mirrors resolveTheme in src/lib/theme.ts. -->
    <script is:inline>
      try {
        var t = localStorage.getItem('5ws:theme');
        var choice = t === 'light' || t === 'dark' ? t : 'system';
        var dark =
          choice === 'dark' ||
          (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme-choice', choice);
      } catch (e) {}
    </script>
  </head>
  <body class={bare ? 'bare' : ''}>
    {!bare && (
      <header class="masthead">
        <a class="brand" href={base}>{shelf.title}</a>
        <nav>
          <a href={base}>Shelf</a>
          <a href={base + 'play/'}>Play</a>
          <a href={base + 'about/'}>About</a>
          <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Theme">
            ${THEME_GLYPHS}
          </button>
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
  // The theme toggle: system → light → dark, remembered in this browser; system follows the OS.
  // (/play has no masthead: the island carries its own toggle and does the same.)
  import {
    DARK_QUERY,
    applyTheme,
    currentThemeChoice,
    nextTheme,
    saveTheme,
    systemPrefersDark,
    themeToggleLabel,
  } from '../lib/theme';
  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  if (button) {
    const show = () => {
      const label = themeToggleLabel(currentThemeChoice(root));
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    show();
    button.addEventListener('click', () => {
      const next = nextTheme(currentThemeChoice(root));
      applyTheme(root, next, systemPrefersDark());
      saveTheme(localStorage, next);
      show();
    });
    matchMedia(DARK_QUERY).addEventListener('change', () => {
      applyTheme(root, currentThemeChoice(root), systemPrefersDark());
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
  <section class="card hero">
    <h1 class="question">{question}</h1>
    <p class="lede">{shelf.description ?? 'A voice is talking to you and will not give itself away.'}</p>
    <p class="how">
      Ten questions cost nothing. A wrong guess costs a point. Five minutes.
      <a href={base + 'about/'}>How to play</a>
    </p>
    <div class="actions">
      <a class="button primary play-link" href={base + 'play/'}>Play today’s round</a>
    </div>
    <p class="note">Runs in your browser with an AI you connect. The first round of the day counts for the board.</p>
  </section>

  <section class="card today" id="today" hidden>
    <header class="card-head">
      <h2 id="board-title">Today</h2>
      <p class="note" id="board-switch" hidden><a href="#today" id="board-link">Yesterday</a></p>
    </header>
    <p class="note" id="board-empty">No one has played today.</p>
    <table class="board" id="board" hidden>
      <thead>
        <tr><th>#</th><th>Name</th><th>Score</th><th>Time</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </section>

  <section class="card shelf">
    <header class="card-head">
      <h2>The shelf <span class="count">{shelf.entries.length}</span></h2>
      <p class="note">You are guessing against this set and nothing outside it.</p>
    </header>
    <ol class="entries">
      {shelf.entries.map((e) => (
        <li class="entry">
          <span class="name">{e.name}</span>
          <span class="meta">{e.kind}{e.era ? ' · ' + e.era : ''}</span>
        </li>
      ))}
    </ol>
  </section>

  <section class="card rounds">
    <header class="card-head">
      <h2>Rounds <span class="count">{rounds.length}</span></h2>
    </header>
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
  <article class="card round">
    <header class="card-head round-head">
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
  </article>

  <footer class="card adjacent">
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
  <section class="card about">
    <h1 class="question">{question}</h1>
    <p class="voice">
      {shelf.description ?? 'A voice is talking to you and will not give itself away.'} It speaks
      as “{person}”. You ask questions. You work it out. A round takes about five minutes.
    </p>
  </section>

  <div class="card about">
    <section>
      <h2>How to play</h2>
      <p>
        <a href={base + 'play/'}>Press Play.</a> The first time, connect your AI — a provider and a
        key, kept in this browser and sent only to that provider. Someone is already talking when
        the round opens. Ask what you like; guess when you are ready. Losing is fine — a shrug and
        another round.
      </p>
    </section>

    <section>
      <h2>Three currencies</h2>
      <ul>
        <li><strong>Questions cost nothing.</strong> Ten of them.</li>
        <li><strong>Searches cost seconds.</strong> Search opens a new tab; the five-minute clock runs while you read a page and pauses while the voice is composing.</li>
        <li><strong>Guesses cost points.</strong> Ten to start. A wrong guess costs one; the right one costs nothing. A first-try hit is a clean ten.</li>
      </ul>
    </section>

    <section>
      <h2>The disclosure rule</h2>
      <p>
        The voice will never say its name, nor the single most famous work, invention, battle
        or act, outright. Everything else is fair. It may evade, boast, bristle or refuse — in
        character — but it will not lie. A vivid line is a gift to a good searcher; that is a
        skill.
      </p>
    </section>

    <section>
      <h2>The reveal</h2>
      <p>
        At the end: who it was, why it matters, and why each wrong guess was reasonable. The
        misses are the curriculum. A finished round hands you its transcript — a markdown page the
        curator can add to this crux, so the conversation is the artifact.
      </p>
    </section>

    <section>
      <h2>Provenance</h2>
      <p>
        This shelf, <strong>{shelf.title}</strong>, holds {shelf.entries.length} entries:
        {sourced} <em>sourced</em> (each carries pages its facts can be checked against)
        {unsourced > 0 ? ' and ' + unsourced + ' unsourced (the voice speaks from what is commonly told, and may be wrong)' : ''}.
        Nobody on it is alive. A shelf is a genre; fork this crux and curate your own.
      </p>
      <p class="crumb"><a href={base}>← The shelf</a></p>
    </section>
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
