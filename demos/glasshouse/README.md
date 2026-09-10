# Glasshouse · Tending demo

A small, fictional plant shop showing several Tasks within one Crux. All artwork
is original inline SVG; the site uses local HTML, CSS and JavaScript. No dependency
installation, network access or API key is needed to explore the saved demo.

## Open it

- **Fresh example with Tending badges:** in Desktop Mode, open **Tending → Create
  demo Crux**. Each click creates a separate Glasshouse Crux in your garden.
- **Portable example:** use **Home Garden → Add Crux → Import .crux file** and
  select [`glasshouse.crux`](glasshouse.crux). This creates an independent copy.

The example is scripted and labelled as such. It does not run an agent or invent
live permission requests. Imported copies start idle because `.crux` archives
strip runtime jobs and queues; their saved Task results are still reviewable.

## Five-minute walkthrough

1. In Tending, explore **Checkout**, **Accessibility** and **Autumn campaign**.
2. Open Checkout, select `index.html` in Artifacts and choose Preview. Add a plant
   to the bag and try the demo checkout. Compare with Main's unfinished checkout.
3. Choose **Review changes**, inspect `checkout.js`, then **Check combined result**.
   Try the combined preview, acknowledge the review, and **Merge into Main**.
4. Review Accessibility separately. Its focus styles, larger targets and
   reduced-motion support live in `accessibility.css`, so both Tasks can merge
   independently. This is not a completed accessibility audit.
5. Open **Growth → Whole Crux · branches & merges**. The already-merged
   **Brand foundation** branch and your new merge remain in the history.

To demonstrate live work, open Autumn campaign, then send the brief using your
configured collaborator. Start a second Task for a plant-care guide and return
to Tending. Concurrency limits may queue a turn; approval requests appear only
when the real collaborator requests them. Keep the app window open while working.
The Crux's `README.md` includes copyable prompts and the same walkthrough.

Export from Main to carry all Tasks, conversations, snapshots and merge ancestry
in one `.crux` file. Shared content is stored by fingerprint; Git is not required.
Publishing serves Main's website; the private archive carries the Task graph.
The shop never takes payments or submits orders.

## Completed example: two Tasks through a fresh-garden restore

[`glasshouse-grown.crux`](glasshouse-grown.crux) is the finished example. Import it
through **Home Garden → Add Crux → Import .crux file**. Checkout and Accessibility
are merged into Main alongside Brand foundation; Autumn campaign remains ready
for further work. The guide inside the Crux describes the original starting
stage; use `glasshouse.crux` above to perform those merges yourself.

To explore just the finished website, unzip
[`glasshouse-website.zip`](glasshouse-website.zip) and open `index.html`. It uses
local files and performs only a simulated checkout.

The real Electron journey in `e2e/glasshouse-full-journey.spec.ts` passed on
September 10, 2026. It:

1. Created the demo through Tending and checked that the two Tasks had isolated
   checkout behavior before merging.
2. Reviewed, checked and merged Checkout and Accessibility separately, then
   exercised the combined cart, simulated checkout, empty-bag response and
   keyboard focus in Main.
3. Used Share with a local mock API and verified that the outgoing website
   included both changes and its private backup retained the Task graph.
4. Exported the completed Crux, closed the app, launched a completely fresh
   garden, and imported it. Historical Artifact fingerprints, checkpoint
   conversations and merge ancestry survived. Runtime jobs and queues did not
   transfer, by design. The reopened shop still passed its functional checks.

The **212,429-byte archive (about 207 KiB)** preserves **15 Growth snapshots and
four Tasks**. Its 258 Artifact references share only 20 unique content blobs.
These measurements describe this small example, not a general performance
benchmark. See [`evidence.json`](evidence.json) for the recorded results.

This validates the workflow and portability with scripted Collaboration. It does
not evaluate live AI output, perform a full accessibility audit, demonstrate
real payments, or deploy a public website. Share was tested against a local mock
API; the website and private archive are separate outputs.

Screenshots from the verified fresh-garden restore:

- [Finished shop](05-finished-site.png)
- [Mobile shop](06-finished-mobile.png)
- [Growth after reopening](04-reopened-growth.png)

Regenerate the proof after building the app with
`cd app/electron && npm run test:e2e -- e2e/glasshouse-full-journey.spec.ts`.
It writes its exports, screenshots and evidence to `/private/tmp/glasshouse-proof`;
normal test runs do not replace these tracked delivery files.

## Source and regeneration

`src/demos/glasshouse/content.ts` owns the original site and guide.
`src/demos/glasshouse/create.ts` builds the demo using ordinary Crux, Task,
snapshot, review and merge services. It adds no persistence schema.

After building the app, run the Electron `e2e/tending-demo.spec.ts` test. It creates
the example in an isolated garden, exports `/private/tmp/glasshouse.crux`, imports
it, exercises checkout, merges the imported Checkout Task, and captures screenshots.
Copy that verified export here when deliberately updating the delivery artifact;
normal test runs do not rewrite the tracked archive.
