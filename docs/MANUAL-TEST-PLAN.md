# Manual test plan — everything, in the order you'd meet it

For a hands-on pass over the desktop app. Written 2026-09-21.

**Read this first.** 78 journey specs already drive the app end to end, so
repeating what they cover is the least valuable thing you can do. Every section
below is marked:

- **[auto]** — a journey covers it. Skim it; trust it unless something looks off.
- **[MANUAL]** — no journey covers it, or only a human can judge it. **This is
  where your time goes.**
- **[LIVE]** — needs real credentials or a signed build. Cannot pass until the
  console work is done.

Work top to bottom: each section assumes the state the previous one left.

Keep a note of anything that makes you hesitate, even if it "works" — the
judgement calls (does this feel right? is this the word for it?) are the only
thing a test suite can never give you.

---

## The question underneath all of it

Daniel, 2026-09-21: *"how effortless does it feel to use, once you know it — does
it make your job easier, more fun? Fun is a word that is important."*

Everything below checks whether something **works**. None of it checks whether
it is worth using. That second question is the one no suite can answer and the
one the product actually lives on, so carry it through every section rather
than saving it for the end.

**How to test a feeling without hand-waving.** Four probes that give real
answers:

1. **Test the second time, not the first.** Novelty and confusion both wear
   off. Do a task, then do the same task again tomorrow. Effortless means the
   second time took no thought — not that the first time was impressive.
2. **Count the thinking, not the clicks.** Note every moment you had to think
   about *the app* instead of *the work*: where is that, what is this called,
   did that save. Those are the friction. Clicks are fine; hesitation is not.
3. **Watch what you avoid.** If you find yourself not bothering to snapshot, or
   going to Finder instead of the Artifacts pane, or leaving a Mood alone
   because changing it is a faff — that avoidance is the finding. Write down
   what you dodged and why.
4. **Notice if you want to show someone.** That is what fun looks like from the
   outside: wanting to demo it unprompted, or carrying on after the test is
   done because you would rather keep going than stop.

**Write down the moments, not the verdict.** "The third time I opened a Mood I
knew exactly where the sound was" is worth more than "feels good". So is "I
closed the pane and could not remember how to get it back".

**Two honest cautions.** You cannot read your own app cold — you know where
everything is, so "obvious" is not something you can judge alone. And fun is
easiest to feel on a new empty garden; it is the twentieth crux and the
crowded one that tells you the truth.

---

## 0. Before you start

- [ ] `cd app && npm run verify` — green.
- [ ] `cd app/electron && npm run verify` — green.
- [ ] Launch the real app, not the dev server: `cd app/electron && npm start`.
      (Embedded-app journeys are blank under `CRUX_DEV_SERVER` — § Kinks.)
- [ ] Note which build you are on: a dev build behaves differently from the
      packaged DMG for updates, signing and native tools.

---

## 1. First run and the Gateway **[auto: `gateway-layout`, `smoke`]**

- [ ] Enter → _Plant a new garden_ → Welcome. You land in the Home Garden.
- [ ] **[MANUAL]** Does the first screen explain itself to somebody who has
      never seen this? You cannot un-know what it does; try to read it cold.
- [ ] Username: type one, see it validated; type a taken one, see it said.
- [ ] Avatar: upload, see it in the top bar and on your garden.
- [ ] AI keys: add a key in Settings → AI. It disappears from the field once
      saved (it is stored, not shown).
- [ ] Restart the app. You are still you, still in your garden.

## 2. Home Garden **[auto: `garden-panes`, `starters`, `tending`]**

- [ ] Crux list: created/updated sort, search, thumbnails.
- [ ] _Add Crux_ opens the picker; every starter is listed with a thumbnail.
- [ ] Crux actions menu: rename, duplicate, export, delete.
- [ ] Tending: the page lists what wants attention.
- [ ] **[MANUAL]** With 20+ cruxes, is the garden still legible? Most testing
      happens with three.

## 3. Every starter, created and opened **[auto: per-template journeys]**

Create one of each, let it finish installing, and look at it. For the Astro
ones the Workshop's Clean view _is_ the live site.

- [ ] Blank, Empty (Astro)
- [ ] Home Page (Keel), Blog (Cactus), Digital Garden (Veka)
- [ ] **Photo Gallery** — drop a `.jpg` into `src/assets/digital/` from Finder;
      it appears in the gallery, captioned from the filename.
- [ ] **Business Page** — change `name` in `src/config.json`; the site renames.
- [ ] **Resume** — edit `src/pages/index.md`; the page follows. The button at
      the top right prints it.
- [ ] Feed, Media, Recipe Book, Storefront, Order Desk, Garden, 5Ws
- [ ] **[MANUAL]** Read the placeholder copy in each. Does it tell you what to
      put there, or does it read as somebody else's content you have to delete?
- [ ] **[MANUAL]** Create one of each _tool_ crux (Piskel, Kan, GDevelop,
      Notes, Moqira…). They are individually journey-covered, but nobody has
      sat and used them in a row. Watch for slow first opens and disk use.

## 4. The workspace and its panes **[auto: `garden-panes`, `files`]**

- [ ] Open each pane from the top bar; close each from its own header.
- [ ] Layout survives a restart, per crux.
- [ ] **[MANUAL]** Open _all_ panes at once. Known bug: at nine the leftmost
      run off canvas and Collaboration becomes unreachable (§ handoff open
      threads 7). Decide what you want to happen.
- [ ] **[MANUAL]** Resize the window narrow and wide. Panes ask for room rather
      than breaking — does the message read well?

## 5. Collaboration **[auto: `chat`, `background-turn`, `parallel-tasks`]**

- [ ] Send a message with a real key. Words stream; tool calls fold under the
      reply as one expandable line; the line grows as work arrives.
- [ ] Stop mid-turn. Steer mid-turn.
- [ ] A multi-step request produces a plan, steps tick over, snapshots per step.
- [ ] Model selector, usage and context readout below the composer.
- [ ] Ask it to remember something → Settings → Memory shows it.
- [ ] **[MANUAL]** **This is the heart of the product and the least testable.**
      Spend an hour making something real with it. Does it feel like working
      with someone, or like operating a machine? That judgement is yours alone.
- [ ] **[MANUAL]** Persona: switch in Mood → Persona. Does the voice change?

## 6. Artifacts and the editor **[auto: `files`, `upload-skills-apex`]**

- [ ] New file, rename, move between folders, delete (with the confirm), undo
      via Growth.
- [ ] Upload by button and by dragging from Finder.
- [ ] Edit in Monaco, ⌘S, the file changes on disk.
- [ ] **Edit the file in an external editor.** The tree and the preview follow.
- [ ] **[MANUAL]** Delete a file in Finder while the app is open. Does the app
      cope, and does Growth still hold the old version?

## 7. Growth **[auto: `snapshots`, `growth-actions`, `growth-tools`, `growth-graph`]**

- [ ] Take a snapshot, label it, see it in the timeline.
- [ ] View an old snapshot; the banner offers Branch / Revert / Back.
- [ ] Revert — editor, disk and history agree afterwards.
- [ ] Branch, then switch between branches.
- [ ] Remove the last snapshot.
- [ ] Whole-Crux Growth explorer; the graph view.
- [ ] **[MANUAL]** Restore something from a week of real work, not a fixture.
      This is the promise the product makes; it deserves a real test.

## 8. Tasks **[auto: `task-details`, `parallel-tasks`, `cruxspace-task-transfer`]**

- [ ] New task, work in it, review changes, merge into Main.
- [ ] Two tasks at once; they do not tread on each other.
- [ ] **[MANUAL]** Abandon a task halfway and come back tomorrow. Is its state
      obvious?

## 9. Preview **[auto: `multi-crux-preview`, `devserver.unit`]**

- [ ] Site Crux: `astro dev` starts by itself; Refresh; Open externally.
- [ ] Static crux: the plain server serves it.
- [ ] Screenshot, Export video, Check it.
- [ ] **[MANUAL]** Break a build on purpose (bad frontmatter). The failure is
      explained, not just red, and _Retry preview_ recovers.

## 10. Cruxspaces **[auto: `cruxspace`, `business-cruxspace`, `game-cruxspace`]**

- [ ] Create one, add members, write the brief.
- [ ] Save an output in one member; use it in another; the origin is recorded.
- [ ] The story walkthrough; revert every member to a moment.
- [ ] Export a `.cruxspace`, import into a clean garden.
- [ ] **[MANUAL]** Import `demos/office-garden/bloom-and-ink.cruxspace` on a
      machine that does _not_ have Kan and PPTist. It now tells you which tools
      are missing — is that message enough to act on?

## 11. The Keeper console **[auto: `keeper-plants`, `keeper-operates`, `keeper-tour`]**

- [ ] Escape opens it. Ask it to plant a crux; watch it happen.
- [ ] The activity chip in the top bar while it works, with Stop.
- [ ] **[MANUAL]** Ask it to _build you something_ — the multi-step skill. This
      is the "I sit down and say what I want" story; it needs a human.

## 12. Moods and appearance **[auto: `bundled-moods`, `mood-builder`, `plasma`, `names`]**

- [ ] Switch Moods from the Mood Bar; the whole app changes.
- [ ] Mood Builder: theme, background, sound, persona.
- [ ] Soundscape plays; volume; per-Mood track.
- [ ] Names: change what panes are called (Settings → Names).
- [ ] **[MANUAL]** Live with one Mood for an evening. Moods are judged by
      dwelling in them, not by switching.
- [ ] **[MANUAL]** Check light Moods as carefully as dark ones — most work
      happens in dark.

## 13. Settings **[auto: `settings`, `billing` partial]**

- [ ] Account, Names, AI, Memory, Agents, Plan, Usage, Data, Desktop, Sync,
      Installed tools — open each, change something in each.
- [ ] Sign out: **your local author stays** (name, avatar). Only the account
      connection goes.
- [ ] Data → wipe the garden (in a throwaway garden, with "delete me").

## 14. Multiple workspaces **[auto: `multi-crux-*`]**

- [ ] Open several cruxes at once; the switcher (⌘⌥K, Ctrl+Tab).
- [ ] Close one with unsaved work — you are asked.
- [ ] Quit with turns running — you are warned.
- [ ] **[MANUAL]** Seven or more open, as in the office garden. Watch memory
      and whether anything gets slow.

## 15. Export, import, backup **[auto: `data-safety`, `auto-backup`, `recover`, `trash`]**

- [ ] `.crux` export and import round trip.
- [ ] `.garden` full backup and restore into a clean garden.
- [ ] Trash: delete, recover, delete forever; survives restart.
- [ ] **[MANUAL]** Note the file sizes. A GDevelop crux exports at ~194 MB
      because the runtime travels with it — the v1 by-reference work (ROADMAP
      § 9b) is aimed at exactly this. Is the current size tolerable meanwhile?

## 16. Publish and share **[LIVE + auto: `publish`, `guestbook`, `functions`]**

- [ ] Publish a crux; visit the URL; _How was this made?_ shows the conversation.
- [ ] Republish after a change; unpublish.
- [ ] Guestbook on a published site; a visitor signs in and leaves a note.
- [ ] Crux Store: add keys locally, then live.
- [ ] Functions: an event function, the custom API, a schedule, a secret.
- [ ] **[LIVE]** Custom domain end to end.
- [ ] **[LIVE]** Sync push/pull, and the new-device flow on a second machine.

## 17. Native tools (desktop only) **[auto: `media-tools`, `convert-actions`]**

- [ ] Media Tools crux: convert a video, an image, a document.
- [ ] Artifacts' contextual Convert buttons on a dropped file.
- [ ] Markdown → PDF (Typst).
- [ ] **[MANUAL]** Install ImageMagick from inside the app when a picture
      recipe needs it. Does the prompt make sense if you have never heard of it?

## 18. Stack, Link and Runner (the workspace, ADR 0053) **[MANUAL — untried by you]**

Built 2026-09-20, never driven by hand.

- [ ] Import `demos/sitemetric/sitemetric-workspace.cruxspace`.
- [ ] Point the two Link Cruxes at real checkouts.
- [ ] Press Start in the Runner; Postgres and Redis come up; ports are assigned
      and remembered; the log shows every service.
- [ ] Stop; reopen; the Runner still knows what is running.
- [ ] **[MANUAL]** This is the thing you wanted for the team. Judge it against
      "make running our platform locally as easy as clicking a button".

## 19. Explore and tool installation **[auto: `tool-info`, `tool-sampler`]**

- [ ] Explore lists tools; install one; create from it.
- [ ] Tool Info shows the upstream project and what Crux Garden changed.

## 20. The packaged app **[LIVE — never done]**

- [ ] Build a DMG, install it as a stranger would, and run § 1–7 again on it.
      **Nothing below the DMG has ever been acceptance-tested.** Updates,
      signing, native binaries and the `userData` path all differ from a dev
      build.

---

## Known open issues — do not report these as new

- Nine panes: the leftmost run off canvas (§ 4).
- `SyncPane` reloads the whole window after a pull, dropping open workspaces.
- `keeper-plants` and `data-safety` flake in a batch, pass alone.
- `trash` "delete forever survives restart" fails on its own (pre-existing; the Artifacts pane toggle races).
- A GDevelop crux exports at ~194 MB (§ 15).
- `/fn/*` is not routed on the publish subdomain in production.

## What no amount of clicking will tell you

Real model behaviour, Stripe, CloudFront, DNS, certificates, Apple
notarization, and how any of this feels on Windows or Linux. Those are the
eval harness, the console runbooks, and machines neither of us has.
