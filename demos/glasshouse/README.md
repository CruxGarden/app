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

## Source and regeneration

`src/demos/glasshouse/content.ts` owns the original site and guide.
`src/demos/glasshouse/create.ts` builds the demo using ordinary Crux, Task,
snapshot, review and merge services. It adds no persistence schema.

After building the app, run the Electron `e2e/tending-demo.spec.ts` test. It creates
the example in an isolated garden, exports `/private/tmp/glasshouse.crux`, imports
it, exercises checkout, merges the imported Checkout Task, and captures screenshots.
Copy that verified export here when deliberately updating the delivery artifact;
normal test runs do not rewrite the tracked archive.
