# Skill: 5ws
Use when: the crux grew from the 5Ws template.

An Interrogable Crux (ADR 0016) built as an Astro Site Crux. The template is the engine; the Shelf is the game — each shelf asks one of the five Ws. This conversation is with the **author** — the shelf's curator. You never speak as the hidden thing here; the site's `/play` page does that in the visitor's browser with its own calls (the engine in `src/game/`, the model the visitor connects), and the secret is never in this conversation.

**The files**
- `shelf.json` — the Shelf: `id`, `title`, `kind` (the genre), `question` ("Who am I?", "What am I?", "Where am I?", "When am I?"), optional `voicePerson` (default "I"; objects and places speak as "I" too), `description`, and `entries[]`. Each entry: `id` (slug), `name`, `aliases[]`, `kind` (person | character | object | place | event), `era`, `voiceNote` (one line: temperament and how they deflect), `mostFamous[]` (1–3 terms the voice must never say outright), `provenance` (`sourced` with `sources[]` URLs, or `unsourced`). `shelves/things.json` is a second starter shelf; swapping it in means replacing `shelf.json` (the Builder's shelf view reads `meta.game.shelfPath`).
- `rounds/*.md` — finished rounds, written by play (`src/game/transcript.ts`). Frontmatter: `title`, `date`, `shelf`, `question`, `entry` (`name`, `kind`, `era`), `score`, `outcome` (won | lost | gaveUp | timeUp), `questions`, `guesses[]` (`text`, `correct`), `durationSeconds`, `keptPages[]`, optional `sample: true`. Body: an opening line, `**You:**` question lines, plain paragraphs for the voice, then `## Guesses` and `## Reveal` (`### This was`, `### Why they matter`, `### The misses`, `### Parting`).
- `src/pages/index.astro` (the shelf, bounded and visible, and today's board), `src/pages/rounds/[slug].astro` (a transcript), `src/pages/about.astro`, `src/lib/shelf.ts` (the question fallback by kind). The site's heading is always the shelf's `question` — never hardcode a product name into the pages.
- `src/components/Round.tsx` and `src/lib/` — the play surface: the round, the Connect step (the visitor's own model key, kept in their browser), the sign-in, the board. `src/lib/store.ts` is how the page reaches the crux's own store (the API when published, the host frame in the preview).

**The board** lives in this crux's own Crux Store — no other backend; a fork carries its own board. Two keys a day, UTC:
- `leaderboard:<YYYY-MM-DD>` — mode `common`: the crux's one value for the day, `{ entries: [{ name, score, seconds, at }] }`; anyone reads it, writing needs a sign-in. The page maintains it — read, replace-or-add the visitor's entry, sort (score, then seconds, then post time), cap at 50, write back — under its own convention, which the store does not enforce: one entry per name, the name being the signed-in account's username. Top 20 on the shelf page, top 10 after the reveal.
- `played:<YYYY-MM-DD>` — mode `protected`, private to the visitor: `{ entry, shelf, score, seconds }`, written when the day's counted round ends. The first round of a day is the daily (the date-seeded figure, the one that counts); once `played` exists the rest of the day is practice, on any of their browsers. Signed out, the browser's own `5ws:daily:<shelf>` record stands in.
- The page asks the visitor to sign in (email code) before it posts — the page's rule; the store only asks for the token. Never write these keys from this conversation, and never edit a score.

**Curating a shelf**
- Spread: eras, regions, fields, genders. A curated forty beats a random thousand; a shelf is a genre, so keep it coherent.
- Dead only. Nothing living, nothing born after ~1930 unless clearly dead. If in doubt, leave it out.
- Guessable: well-known enough that a good searcher can get there from oblique clues in five minutes.
- Aliases: common variants, spellings, titles, native forms — they are accepted as guesses and are also forbidden in the voice's mouth.
- `voiceNote` is one line of temperament and deflection, not a biography. `mostFamous` names what must stay unsaid.
- Never invent facts. `provenance: sourced` needs real URLs (Wikipedia is fine); when you cannot source it, mark it `unsourced` — never guess a source.
- Keep `id`s unique and slug-like; the Builder's **Add to shelf** form writes the same shape.

**Transcripts** are the record of play. Edit `rounds/*.md` only for typos; never rewrite what the voice said or change a score.

**Styling**: serif for anything with a voice, sans for the interface; one fade on the reveal at most. `node_modules/`, `dist/` and `.astro/` are the app's — never create or edit files there.
