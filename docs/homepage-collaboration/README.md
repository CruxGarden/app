# Astro Home Page collaboration acceptance

Verified 2026-09-15 by `electron/e2e/homepage-collaboration.spec.ts`: 1 test passed in 59 seconds (1.1 minutes total). Uses the actual isolated Electron app, Monaco editor, file tools, Astro builds/dev server and complete Crux archive. The model is scripted; this is not a real-model quality evaluation.

Twelve model calls cover: read/edit after a person changes frontmatter and appends a note; refusal when the person changes the targeted Saturday sentence to Sunday, then read/retry; actual failed Astro build on an invalid date and successful repair; and continued editing after restart/export/import into a clean Garden with the original Project Folder renamed offline. A second manual paragraph and all prior changes survive. The imported live route renders the final shared text.

Evidence: `calls.json`, `compost.md`, `manual-agent-handoff.png`, `live-post.png`, `imported-post.png`. One deliberate stale-edit refusal and one deliberate failed build are expected. The native screenshots and final rendered post were inspected.

Test-harness corrections: wait for Astro's asynchronously updated route before opening a fresh browser; reopen Workshop and select the post after clean import rather than waiting for a closed preview. No production preview/storage fix was needed. Monaco's specific cancellation-on-dispose promise errors are retained in `editor-cancellations.json`; the harness fails on all other page errors. The cancellation issue remains in the UI polish plan.

This proves preservation of already-saved/ingested edits through these handoffs. ADR 0001 still uses last-write-wins for concurrent disk writes; unsaved-buffer and watcher/read-to-write races are not certified. Full application/Electron verification is recorded separately in the root Build Log.
