# Crux Garden v1 — page-by-page manual testing guide

**Start here:** the [story-based release rehearsal](v1-user-stories.html) carries forward every check below and adds the current onboarding, docs, game, CLI and other newer capabilities. It has independent results and a source-mapped coverage ledger. This document is the earlier 67-choice baseline, not the complete current inventory.

**Original format:** use the [interactive checklist](v1-checklist.html) to keep status and notes, or tick this Markdown copy. There are **346 checks across 36 sections**, including **all 67 creation choices at that checkpoint**. Work through it over several sessions; this is a full product pass, not a quick smoke test.

Prepared from app `f580bf89b` and API `0ad16a9` on 2026-09-21; sections 04, 05 and 26 updated for Gardens and Garden Moods at app `cf7b76b42` on 2026-09-25. Every item starts **Untested**. Earlier automated passes do not mark your manual results. Labels use the default Names; custom pane names can change what you see.

## How to use it

1. Make a disposable test garden/profile. Start without an account or key, then add a test account and real providers as needed. Keep a separate second profile for clean imports and sync checks.
2. For each row, do the action and compare the expected result. Record **Pass**, **Fail**, **Blocked** (missing prerequisite) or **Not applicable** (intentional scope exclusion, with a reason). An unavailable feature you intend to ship is Blocked, not Not applicable.
3. Distinguish **behavior** from **feel**. A control can technically work and still need a design issue: confusing wording, too many steps, unreadable text, lag, excessive animation or poor feedback.
4. At the end of a session, export the tracker JSON/Markdown report. Its browser storage belongs to this file/browser, is not Garden data, and is not synced. Keep exported copies before clearing browser data or moving machines.
5. Stop using a project if a test corrupts or loses data; preserve its exported copy/logs and record the exact action before retrying. All wipe, overwrite, permanent-delete and crash tests belong in the disposable profile.

## What changed in the UI (read first)

The app you are testing differs from earlier guides in these ways:

- **Everything is a panel.** Settings, Mood, Explore, Tending, the Garden's Collaboration (the Keeper), the Navigator, Crux Synth and WWW open as resizable, movable panels in the workspace you are in, beside your work. There are no pop-up windows for them and no fixed side columns. The **Panels** picker (top right) lists every panel with open/close and **pin**; a pinned panel keeps its square in the top bar while closed.
- **Garden Home is the entry.** Entering the app or relaunching lands on the Garden's Home (its cards and actions), not the last open Crux. The top bar reads `Garden › Crux` and stays two levels deep however deep your Gardens nest. **Garden location** (the Garden name) opens the ancestry sheet; **Navigator** (⊕, far left) shows the whole graph as Tree, Neighborhood or Graph.
- **Gardens own things.** Each Garden wears its own Mood (a child inherits until it chooses), keeps its own Collaboration, and holds its own Schedules; a look you change in a Garden is kept only if you press **Keep for <Garden>** in the Mood panel. Collections are Gardens.
- **Growth is deliberate.** Routine saves and collaborator edits go to **Edit history** (recovery points); Growth versions exist only when you press **Mark version**.
- **The public garden** is one flat page per account at `@username` listing shared Cruxes; it never shows your private Gardens. Other people's work is reached through Explore.
- **Old words you may still see in tools:** "Save … to Cruxspace" in some native tools means "save as a Garden output".

## Your test kit

- Two disposable profiles, one test account (a second for account switching), and a place to save archives/results.
- A small image, audio clip, video, PDF, Markdown document and CSV. Use non-sensitive content and familiar files whose correctness you can judge.
- A scratch Crux, another Crux, two Tasks, a child Garden, one Notes project and one Astro site.
- A real model for collaborator checks; an outside MCP client for agent-control checks. Microphone/camera/audio devices, Docker, external apps and native binaries only for the rows that need them.
- An API/catalog target you can identify. The local catalog is populated; production catalog/examples still need rollout. Local mock mail, local publication and test billing do not prove the corresponding production service.

**Optional isolated launch from this checkout (macOS):** run the following in Terminal. It uses the existing compiled desktop/renderer; it does not rebuild or launch against your normal profile. For profile B, change `CruxGarden-V1-Test` to `CruxGarden-V1-Test-B`. This is a development-only override: `CRUX_TEST_PROFILE` must be an absolute directory, with `userData/` and `garden/` managed inside it. Packaged release builds ignore it; test fresh installation with a clean OS account or spare device.

```sh
env -u ELECTRON_RUN_AS_NODE \
  CRUX_TEST_PROFILE="$HOME/CruxGarden-V1-Test" \
  "/Users/daniel/Workspace/CruxGarden/app/electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" \
  "/Users/daniel/Workspace/CruxGarden/app/electron"
```

For local account/catalog checks set **Settings → Account → Connection → API address** to `http://localhost:3001` while the local API is running. Its test email code is in the local mock-mail log; that is development setup, not a real email-delivery pass. Use the packaged release in the separate release section. Do not rebuild `app/dist` while either test app is open.

## Eight-step recipe for every native tool / creation choice

1. Create from the named choice in a clean test profile. Read its description, Tool Info and prerequisites; ensure it is the intended editor.
2. Perform the row’s concrete manual exercise **without a collaborator**. Try its primary controls and visible empty/error state.
3. Where agent operations are exposed, ask a **real** collaborator to inspect the current project, change one thing and preserve your manual edit. Inspect the actual native result. Record unavailable operations rather than assuming universal editor control.
4. Continue manually. Use native Undo/Redo where supported and save again; do not expect Garden to invent native undo for apps that lack it.
5. Mark a version (History → Mark version), make a second version, inspect/restore the earlier one in the disposable project.
6. Quit/reopen and check the **editable native document**, not just a screenshot or exported render.
7. Export the complete `.crux` with runtimes included, import into a **different clean profile**, reopen offline where supported and edit again. A restart in the same profile does not prove portability. For external-app connections, verify kept artifacts/link metadata; they do not bundle the entire external service/document.
8. Produce an output the tool actually supports and open it independently. If website sharing is supported, open the visitor edition too. Distinguish native editability, `.crux` archive, native export, public viewer and whole-editor distribution. A disabled/unsupported output is a documented limit, not a made-up pass.

## Suggested sessions

- **First-use and core loop:** sections 01–09, 11, 15 and one Undertaking.
- **Work management:** Tasks, Gardens, Store, Functions, Tending, schedules and the Garden's Collaboration.
- **Personalization and connection:** Settings, Moods, Flow, backgrounds, persona, sound and outside agents.
- **Tool sweep:** section 35, a few related tools per session; apply the full recipe to each.
- **Cloud/recovery/release:** Sync, Share, public pages, domains, recovery and installed builds.
- **Polish/retest:** the Everywhere pass and final signoff. Export your results each time.

## Contents

- [01 · Gateway and first garden](#start)
- [02 · Home Garden](#home)
- [03 · Add Crux and file entry](#create)
- [04 · Undertakings](#und)
- [05 · Gardens, outputs and Walkthrough](#space)
- [06 · Workspace frame and navigation](#shell)
- [07 · Collaboration](#chat)
- [08 · Artifacts and the Project Folder](#art)
- [09 · Workshop: editing, preview and capture](#work)
- [10 · Tasks and merge review](#task)
- [11 · History and Whole Crux Growth](#grow)
- [12 · Metadata](#meta)
- [13 · Crux Store](#store)
- [14 · Find media](#media)
- [15 · Export](#export)
- [16 · Sync pane and account recovery](#sync)
- [17 · Share and public address](#share)
- [18 · Functions, rules and secrets](#func)
- [19 · Tending and alerts](#tend)
- [20 · Schedules, timers, sun and weather](#sched)
- [21 · Garden Collaboration (the Keeper)](#keep)
- [22 · Settings: Account and Names](#setac)
- [23 · Settings: AI, Memory and metrics](#setai)
- [24 · Settings: Agents and outside control](#mcp)
- [25 · Settings: Sync, Plan, Usage, Garden and Desktop](#setdata)
- [26 · Mood: Moods and Theme (the Mood panel)](#mood)
- [27 · Mood: Flow](#flow)
- [28 · Mood: Background, assets and Persona](#bg)
- [29 · Mood: Sound and cues](#sound)
- [30 · Explore and installing tools/Moods](#explore)
- [31 · Public garden, public Crux and website](#public)
- [32 · Custom domains and release-only checks](#domain)
- [33 · Recently deleted, restoration and failure recovery](#recover)
- [34 · Everywhere: accessibility, polish and a real session](#feel)
- [35 · Every creation choice: the native-tool sweep](#tools)
- [36 · Final pass and issue handoff](#signoff)

<a id="start"></a>

## 01 · Gateway and first garden

**Where:** Launch the desktop app → Gateway

Begin without an account or model key. Use a separate test profile; see the setup instructions at the start of the guide.

- [ ] **START-01** — Launch into an empty profile, resize the window, and enter the garden.

  **Expected:** The welcome/first-garden path is usable without signing in; no blank page or repeated welcome loop.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **START-02** — Choose a Mood, then plant the garden. Leave and relaunch.

  **Expected:** Your choice and created garden survive; returning does not create another garden.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **START-03** — Inspect the desktop Gateway and drag/reposition its banner; reset the layout and relaunch.

  **Expected:** Position/reset behave consistently. Desktop Gateway has no soundtrack player controls; the website is checked separately.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **START-04** — Open Explore undertakings, inspect all six choices, then cancel and create just a Blank Crux.

  **Expected:** Both paths are easy to find; cancel leaves no partial Garden.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **START-05** — Resize to a narrow window and use the keyboard through the welcome actions.

  **Expected:** Text, buttons and focus stay visible; no essential action requires hovering.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **START-06** — Try entering a returning profile containing several open Cruxes and one unsent message.

  **Expected:** Entering lands on Garden Home (not the last Crux); opening a Crux from its card restores its arrangement and the unsent draft.

  **Needs:** Local. **Result / notes:** ____________________

<a id="home"></a>

## 02 · Home Garden

**Where:** Enter → Home Garden

Keep a Blank Crux called V1 Scratch, another called V1 Other, and one Crux with a long title.

- [ ] **HOME-01** — Create, open, rename and return from a Crux; repeat with an empty title attempt, Unicode and a long title.

  **Expected:** Valid names persist and invalid input has a clear result; long names do not hide controls.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **HOME-02** — Use every Sort by option; search for a full title, partial title and something absent; clear the search.

  **Expected:** Ordering and matches make sense; the empty state explains there are no matches and clearing restores the list.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **HOME-03** — Edit a Crux, return home, and inspect its card thumbnail, title and latest activity.

  **Expected:** The card reflects that Crux rather than another open workspace.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **HOME-04** — Open multiple Cruxes, switch among them and close/reopen one.

  **Expected:** Each preserves its files, pane layout, conversation and selected Task.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **HOME-05** — Delete only V1 Scratch, cancel once, then confirm; open Recently deleted.

  **Expected:** Cancel keeps it; confirm removes it from the normal grid and makes recovery discoverable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **HOME-06** — Open Public Garden (the globe) when connected, then return.

  **Expected:** It opens your public page at `@username`: a flat list of shared Cruxes only. No private Garden name, brief or structure appears; nothing local is published by opening it.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **HOME-07** — Inspect home while work runs in another Crux and while the account is offline.

  **Expected:** Local work stays accessible and activity/errors do not block navigation.

  **Needs:** Local. **Result / notes:** ____________________

<a id="create"></a>

## 03 · Add Crux and file entry

**Where:** Home → Add Crux

The catalog sweep later contains every current creation choice; this section tests the creation dialog itself.

- [ ] **CREATE-01** — Open Add Crux, search/browse choices, select one, change the proposed title and create it.

  **Expected:** Description and availability are accurate; one click creates one correctly named Crux.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CREATE-02** — Cancel with its close button and with Escape. Reopen it.

  **Expected:** No phantom project remains; selection/input state is understandable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CREATE-03** — Choose a tool labeled not installed and follow Install from Explore; return to the picker afterward.

  **Expected:** The tool becomes available after installation, with a useful progress/error state.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **CREATE-04** — Use Install from .crux with an exported tool package. Also choose a non-tool archive.

  **Expected:** A recognized tool installs; other content is handled or rejected clearly rather than silently becoming a broken tool.

  **Needs:** Tool archive. **Result / notes:** ____________________

- [ ] **CREATE-05** — Start from an image, audio clip, CSV, PDF, Markdown file and a small source folder using the offered file/drop routes.

  **Expected:** Suggested creation types fit the input; files arrive in the intended Crux with intact content.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CREATE-06** — Drop several files together, then drop a name that already exists. Cancel and then test Replace.

  **Expected:** Counts and chosen destination are correct; cancellation preserves the earlier file.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CREATE-07** — Attempt a malformed archive and interrupt one large creation by normal navigation.

  **Expected:** The app gives a recoverable result; it does not claim a successful empty project.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CREATE-08** — Inspect v1 choices and navigation.

  **Expected:** Shared Garden/member/SSO features and choosing a Crux as a public garden homepage are absent; these are deferred, not missing v1 controls.

  **Needs:** Local. **Result / notes:** ____________________

<a id="und"></a>

## 04 · Undertakings

**Where:** First-garden prompt or Add Crux → Undertakings

Each undertaking starts a **new Garden** inside the one you are in, and opens it. Run every row twice: start fresh (the worked example grows **inside** your new Garden as its own child Garden), then use the example as your starting point. Use no key for the manual pass; use a real collaborator for the second pass.

- [ ] **UND-01** — Make a home page: open Home page → Edit content → Site settings; change the name/tagline and inspect the page.

  **Expected:** A real personal page updates; the planning notebook and example remain distinct.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-02** — Make a small game: open Pocket game → Artifacts → game.json, change just the title and save; play a complete round in Workshop → Clean.

  **Expected:** The title changes, each catch counts, the win state and Start again work.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-03** — Write a short book: open Manuscript → Use app, edit The first page, choose the public notes and save an EPUB.

  **Expected:** Editing persists; the EPUB opens in a reader and contains the selected chapters.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-04** — Launch a small business: change its name/description in Site settings, inspect the home and FAQ pages.

  **Expected:** Your offer appears and FAQ sections are visible; publishing does not fail Astro checks.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-05** — Explore a question: edit one numeric height in observations.csv and inspect the chart and mean.

  **Expected:** The figure/statistic actually change; the synthetic-data and limitations text remains.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-06** — Tell a family history: change a sample post title/body in Family journal → Edit content.

  **Expected:** The edited story appears on its route; unrelated sample content is not silently replaced.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-07** — For each of the six, read the brief and first task; use the suggested collaborator prompt and make a follow-up correction.

  **Expected:** The collaborator works in the correct member, understands the brief and preserves your manual changes.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **UND-08** — For each example, open its worked-example Garden → **History** (footer of Garden Home) and play every Walkthrough step, then Back to now.

  **Expected:** Milestones show actual earlier work read-only; returning restores the present files.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-09** — For each customized undertaking, **Export Garden** from its Garden Home footer, quit/reopen, then **Import Garden** (beside New Garden) in a second clean profile.

  **Expected:** Names, membership, brief, conversations, Growth and edited files survive; example and personal copies have independent identities.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **UND-10** — For each finish line, publish only the intended deliverable to a test account, open it in a separate browser and use it.

  **Expected:** The real page/game/book/chart works without your local project folder.

  **Needs:** Publishing. **Result / notes:** ____________________

<a id="space"></a>

## 05 · Gardens, outputs and Walkthrough

**Where:** Garden Home (a Garden's own page) — Navigator → a Garden, or the Garden name in the top bar

Cruxspaces are now Gardens: a collection *is* a Garden, with its name, a brief under the name, and its Cruxes. A Crux lives in exactly one Garden; gathering it elsewhere moves it.

- [ ] **SPACE-01** — New Garden; click **Add a brief** under its name and write one; create two Cruxes inside it; use **Add existing Crux** to bring in one from another Garden; then **Remove from Garden** on a card.

  **Expected:** The brief persists across restart; Add existing Crux moves (never duplicates) the Crux; removing does not delete it.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-02** — Nest a Garden inside another, move a Crux between them, then delete the inner Garden.

  **Expected:** The Navigator tree follows each move; deleting a Garden does not silently lose Cruxes you did not delete.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-03** — Save an output in one Crux (for example “Save … to Cruxspace” in an image tool — the tools still use the old word), return to Garden Home: it appears under **Outputs** by itself. In another Crux open **Workshop → Garden outputs** and use it.

  **Expected:** The receiving file has the correct type/content and origin; no refresh button is needed.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-04** — Change the original output after using it elsewhere.

  **Expected:** The receiving copy stays the version you chose; there is no silent live synchronization.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-05** — Repeat an output transfer with an image, audio file and an offered structured/document format; transfer into a Task if offered.

  **Expected:** Destination and type remain correct, and an unsupported transfer gives a useful explanation.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-06** — Garden Home → **History**: inspect the story across its Cruxes' checkpoints and transfers; step backward/forward in the Walkthrough.

  **Expected:** Lanes and ordering are coherent; historical views cannot edit the current files.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-07** — In History, try the whole-Garden revert on disposable Cruxes: cancel, then confirm a chosen moment.

  **Expected:** Cancel changes nothing; confirmed revert is recoverable through Before revert checkpoints and reports any busy Crux.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SPACE-08** — **Export Garden**, then **Import Garden** (or drop the `.cruxspace` file on Home) twice, and once with an incomplete archive.

  **Expected:** Each import grows a new Garden with its brief, Cruxes and its own Collaboration; missing files/tools are reported, not disguised as a complete restoration.

  **Needs:** Local. **Result / notes:** ____________________

<a id="shell"></a>

## 06 · Workspace frame and navigation

**Where:** Open any Crux → top bar and pane headers

Use normal and narrow windows and at least two open Cruxes.

- [ ] **SHELL-01** — Open every panel from the Panels picker: Tasks, Collaboration, Artifacts, Workshop, Metadata, History, Export, Sync, Share, Store, Find media, and the Garden-wide ones (Navigator, Garden Collaboration, Tending, Mood, Crux Synth, WWW, Settings, Explore).

  **Expected:** Every one is a resizable, movable panel in the workspace (no pop-up windows or side columns); its top-bar square is pressed while open; the picker lists it once.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-02** — Drag pane headers, resize splitters, close/reopen panes and use any maximize/reset controls offered. Restart.

  **Expected:** Layout remains usable and persists; content/drafts are not destroyed by moving a pane.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-03** — Open the Switch Crux workspace control, change Crux and Task repeatedly, then return home.

  **Expected:** Selected files and previews never show another Crux’s content.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-04** — Open the Panels picker, the Crux switcher and a confirmation dialog; press Escape once at a time, and tab forward/backward.

  **Expected:** Only the top layer closes; focus returns to its opener. Escape on Garden Home opens the Garden's Collaboration panel (when the collaborator is on); it never closes a panel.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-05** — Use a long document and conversation while resizing and zooming the app.

  **Expected:** Text is readable; controls remain reachable and scroll positions are sensible.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-06** — Open a large tool while a soundtrack is playing.

  **Expected:** The workspace loads without freezing the player, dropping its state or stuttering the entire app.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SHELL-07** — Quit/close with unsaved source, native-editor changes or running work; test Cancel, save/leave choices offered.

  **Expected:** The app explains what is pending and honors the chosen action without silently losing edits.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-08** — Open the Panels picker. Pin a closed panel (e.g. Artifacts), close it, open another Crux, then unpin it.

  **Expected:** A pinned panel keeps an unpressed square in the bar while closed, in every Crux; clicking it opens the panel. Unpinning an open panel leaves it open. Pins survive a restart and never change the Crux.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-09** — Open many panels in one Crux (six or more).

  **Expected:** New panels take room from the largest tile; the Tasks rail stays a full-height rail until the workspace is crowded.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SHELL-10** — Navigator → view: switch between Tree, Neighborhood and Graph; in Graph, click a Garden and a Crux.

  **Expected:** Graph draws every Garden and Crux on this device with the current one lit; clicking opens it and the breadcrumb follows. The choice is remembered per Garden.

  **Needs:** Local. **Result / notes:** ____________________

<a id="chat"></a>

## 07 · Collaboration

**Where:** Workspace → Collaboration

Run once with no configured model, then with each provider you intend to ship. Mock-model results do not count for these rows.

- [ ] **CHAT-01** — Open an empty conversation without a key, then configure/select a model.

  **Expected:** Setup is understandable and does not prevent manual editing; the chosen model is shown.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CHAT-02** — Send a short prompt, a multi-line prompt and a longer one; test Enter, Shift+Enter and the Send button.

  **Expected:** Sending/newlines follow the current behavior, and there is no obsolete shortcut-hint sentence in the pane.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **CHAT-03** — Ask for a tiny HTML page with two files; expand the tool calls, inspect artifacts and preview.

  **Expected:** Claimed edits exist on disk, in Artifacts and in the rendered result.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-04** — Make a manual edit, then ask the collaborator to continue without removing it.

  **Expected:** It sees current contents and preserves the edit or explains a real conflict.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-05** — Attach an image and an offered document/file; remove one attachment before sending.

  **Expected:** The sent message contains only the intended files; unsupported input is explained.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-06** — While a response runs, queue a follow-up, switch Crux, close Collaboration and return.

  **Expected:** Work continues in its owner; queued prompts and unsent drafts do not jump between Cruxes.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-07** — Stop a long response, then send a new request.

  **Expected:** Generation stops promptly, pending state clears and saved work remains usable.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-08** — Cause a safe tool error with a missing file; try an invalid key or disconnected provider and recover.

  **Expected:** The error says what failed; no fake success or endless spinner, and Retry/new requests can work.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-09** — Ask to delete a disposable file; decline, then request it again and approve.

  **Expected:** The file is untouched until approval; a declined request is not quietly retried.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-10** — Use offered message copy/edit/retry controls, inspect long code blocks and scroll away from the bottom while streaming.

  **Expected:** Clipboard text is correct; new output does not make reading older work impossible.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-11** — Enable Check when done, ask for a deliberately small runnable change and inspect Check it results.

  **Expected:** Verification describes the actual preview/build, distinguishes failure from success and does not claim a visual check it could not do.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **CHAT-12** — Restart after a conversation containing tool calls, attachments and checkpoints.

  **Expected:** Messages and associations survive; it does not resend your last prompt automatically.

  **Needs:** Local. **Result / notes:** ____________________

<a id="art"></a>

## 08 · Artifacts and the Project Folder

**Where:** Workspace → Artifacts; reveal/open Project Folder when offered

Use only the disposable project for overwrites and deletions.

- [ ] **ART-01** — Create a file and nested folder, rename/move them, and reopen the files.

  **Expected:** Tree paths, editor tabs and real disk paths agree; stale tabs do not overwrite the renamed file.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-02** — Upload using Add files, the file chooser and OS drag-and-drop; test a batch and a duplicate name.

  **Expected:** Progress/Replace choices are clear and every accepted file has intact bytes.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-03** — Open text, Markdown, JSON, image, audio, video and a binary/native document.

  **Expected:** Each uses an appropriate view/editor; binary data is not corrupted by text editing.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-04** — Edit a file in the app and immediately edit the same file externally.

  **Expected:** The external change appears and is recorded; the watcher does not mistake it for an app echo.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-05** — Add, rename and delete files through Finder/an external editor, including a nested path and empty file.

  **Expected:** Artifacts updates without a reload or duplicated entries.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-06** — Try a name containing spaces/Unicode, a conflicting name and a path that would leave the project.

  **Expected:** Valid names work; invalid/conflicting paths give a clear result and cannot overwrite outside files.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-07** — Delete a file after marking a version, then restore its earlier version (from Growth, or from the Edit history recovery point the delete made).

  **Expected:** The file disappears from disk/tree and can be recovered from the intended checkpoint.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **ART-08** — Open two projects containing the same filename and edit both.

  **Expected:** Each change stays in its own Project Folder, preview and history.

  **Needs:** Local. **Result / notes:** ____________________

<a id="work"></a>

## 09 · Workshop: editing, preview and capture

**Where:** Workspace → Workshop

Clean is the main preview/use view; Advanced exposes source/artifact work. Source/Form/Preview can appear within the selected editor.

- [ ] **WORK-01** — Switch Clean/Advanced, browse an artifact and change Source/Form/Preview where offered.

  **Expected:** The selected file and current unsaved work remain coherent; modes do not show an unrelated file.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-02** — Edit HTML/CSS/JS and Markdown, save, undo/redo and reopen the file.

  **Expected:** Edits survive and the preview uses saved/current content as advertised.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-03** — For an Astro starter, wait for first dependency install and dev preview; edit a page and open a nested route.

  **Expected:** Progress is visible; routes/assets work, and later edits update the preview without rebuilding the whole project manually.

  **Needs:** Dependencies. **Result / notes:** ____________________

- [ ] **WORK-04** — Introduce a small syntax error in a disposable project, inspect the error/build log, fix it and retry.

  **Expected:** The error names the problem and the preview/build recovers.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-05** — Use content forms: text, number, color, image, select and repeated entries wherever the selected template offers them.

  **Expected:** Form and source agree; added/reordered/deleted entries persist and validation is understandable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-06** — Add/edit a content collection entry through Edit content, including a title with punctuation; follow its route.

  **Expected:** Filename/slug/front matter and rendered page agree, including image paths.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-07** — Open the preview in a browser, use links, reload and return. Try two Crux previews at once.

  **Expected:** Relative/root links stay in the correct site, and previews do not share another project’s server.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-08** — Save a screenshot and Export video from a suitable animated preview, then open the outputs.

  **Expected:** The output files exist and depict the preview; video is playable and progress/cancel/error state is truthful.

  **Needs:** Media binaries. **Result / notes:** ____________________

- [ ] **WORK-09** — Use Check it on a valid preview and an intentionally broken one.

  **Expected:** Results distinguish a passing check, a real failure and an unavailable check.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **WORK-10** — Inspect Tool Info, the upstream link, version/provenance and license notices; export/import and inspect again.

  **Expected:** Credits belong to this Crux and survive the archive, including support/paid-upstream links.

  **Needs:** Local. **Result / notes:** ____________________

<a id="task"></a>

## 10 · Tasks and merge review

**Where:** Workspace → Tasks

Use Main plus Redesign and Experiment Tasks; put a different sentence in each copy.

- [ ] **TASK-01** — Create a Task, review its proposed name/notes and start it; edit details after creation.

  **Expected:** A separate Working Copy opens with its own files, conversation and identity.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-02** — Run two Tasks concurrently and leave Main untouched.

  **Expected:** Drafts, previews, stop buttons and approvals stay scoped to their Task.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **TASK-03** — Edit Main and a Task differently; open Review changes and inspect added/changed/deleted files.

  **Expected:** The review compares against the correct Main and explains overlapping changes.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-04** — Use Check combined result, acknowledge the reviewed result and Merge into Main.

  **Expected:** Only the reviewed changes reach Main; the Task’s native document and app preview remain usable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-05** — Change source after a successful combined check, then try merging.

  **Expected:** The check cannot remain falsely valid for a different result; required rechecking is clear.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-06** — Create a genuine overlapping edit in two Tasks and exercise the offered conflict choices.

  **Expected:** Neither version is silently lost; final files match your explicit choice.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-07** — Try merging, reverting or deleting a Task while it is running or has a pending decision.

  **Expected:** The app explains the blocking state; canceling leaves it intact.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TASK-08** — Publish from a Task, or follow the offered path back to Main.

  **Expected:** Publication belongs to Main; an unmerged Task cannot silently replace the public site.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **TASK-09** — Export a Crux containing Main and multiple Tasks, import into a clean profile and restart.

  **Expected:** Task graph, branches, files and conversations remain independent and navigable.

  **Needs:** Local. **Result / notes:** ____________________

<a id="grow"></a>

## 11 · History and Whole Crux Growth

**Where:** Workspace → History

Create checkpoints before/after an edit and before a deletion.

- [ ] **GROW-01** — Mark versions with labels (History → Mark version); after collaborator work and saves, open the Edit history tab and inspect its recovery points; reopen both.

  **Expected:** Growth holds only what you marked; routine edits appear as recovery points in Edit history, not as Growth snapshots. Labels/times/order reflect real changes and the captured files match that moment.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-02** — Browse a previous moment, try editing, then return to the present.

  **Expected:** Historical views are read-only and leave current files unchanged.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-03** — Restore an earlier version, first canceling and then confirming; then look in Edit history.

  **Expected:** Only the intended copy is restored; what was there before is kept as a "Safety copy" in Edit history, so later work remains recoverable. The banner's "Back to current" returns to the present.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-04** — Compare branches/Task history and follow a merge back to its inputs.

  **Expected:** Main and independent Tasks are not collapsed into one misleading line.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-05** — Open Whole Crux Growth; try 2D/3D, selection, navigation/zoom and its close controls.

  **Expected:** Selection details correspond to real checkpoints; opening the graph never changes files.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-06** — Open Growth for a completely empty Crux and a Crux with many checkpoints.

  **Expected:** Both have usable empty/loading states and controls without freezing.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **GROW-07** — Export/import and inspect checkpoint labels, branches, attachments and a restored deleted file.

  **Expected:** History remains usable offline rather than merely showing a list of missing versions.

  **Needs:** Local. **Result / notes:** ____________________

<a id="meta"></a>

## 12 · Metadata

**Where:** Workspace → Metadata

Use a test Crux rather than changing your real publication identity.

- [ ] **META-01** — Edit title, description and slug; test blur, Enter, Escape, blank input and duplicate/invalid slugs.

  **Expected:** Accepted values persist; canceled/invalid changes are handled visibly.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **META-02** — Add/remove tags, test an existing tag and a new tag, then reopen.

  **Expected:** Tags are not duplicated unexpectedly and search/public metadata reflect saved tags where applicable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **META-03** — Inspect author, collaborators, created/updated time, type/kind and purpose/stage/stack when present.

  **Expected:** Values describe the current Crux, and read-only facts are clearly different from editable fields.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **META-04** — Change visibility on a disposable published item and inspect Share and its public listing.

  **Expected:** The UI accurately distinguishes visibility/discoverability from whether a page is published.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **META-05** — Change a supported metadata field through a collaborator, then compare UI, export and public metadata.

  **Expected:** All paths show the same saved value.

  **Needs:** Real model. **Result / notes:** ____________________

<a id="store"></a>

## 13 · Crux Store

**Where:** Workspace → Store

Local and Live are different stores. Use test keys such as v1:message.

- [ ] **STORE-01** — Add a string, number, Boolean, object and array through the offered value editor; read and edit each.

  **Expected:** Types and values round-trip accurately rather than turning everything into text.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **STORE-02** — Try malformed JSON, a duplicate key and an empty value.

  **Expected:** Validation/replacement behavior is explicit; existing data is not silently corrupted.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **STORE-03** — Export the Store, delete a key, then import the copy.

  **Expected:** The exported data is usable and the import’s replacement/merge behavior is stated.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **STORE-04** — Use Clear: cancel, export-before-clear, and clear without a copy only on test data.

  **Expected:** Cancel keeps data; export completes before clearing; clearing affects only the selected source.

  **Needs:** Disposable data. **Result / notes:** ____________________

- [ ] **STORE-05** — Publish a small form/Order Desk, submit a visitor value, then switch Local/Live and refresh.

  **Expected:** The live visitor data is visible only in the correct live store; local test values do not leak across.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **STORE-06** — Inspect per-visitor keys, delete one and trigger a Store hook/rule.

  **Expected:** The correct row changes and hook failures are reported without partial success.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **STORE-07** — Go offline on Live, then switch back to Local.

  **Expected:** Live errors are recoverable and do not disable the local Store.

  **Needs:** Local. **Result / notes:** ____________________

<a id="media"></a>

## 14 · Find media

**Where:** Workspace → Find media

Search services require a connection; do not count a downloaded thumbnail as the original asset.

- [ ] **MEDIA-01** — Search Images, Sounds and Video; change the query and page through results.

  **Expected:** Results, attribution/license information and loading/empty states fit the selected category.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **MEDIA-02** — Preview a result before using it; pause/stop audio and video.

  **Expected:** Preview controls respond and media does not keep playing after it is closed.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **MEDIA-03** — Use a result in a Crux, open the saved artifact and inspect attribution/origin.

  **Expected:** Real usable bytes are saved in the right Crux, with provenance where supplied.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **MEDIA-04** — Try a failed download, cancel where offered, and repeat in a second Crux with the same filename.

  **Expected:** Failure is explained; partial/cross-Crux files do not masquerade as success.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **MEDIA-05** — Export/import a Crux with imported media and reopen it offline.

  **Expected:** Kept assets remain available without revisiting the search provider.

  **Needs:** Local. **Result / notes:** ____________________

<a id="export"></a>

## 15 · Export

**Where:** Workspace → Export

Use Include runtimes for the first self-contained backup.

- [ ] **EXPORT-01** — Export a complete .crux containing files, conversation, media, Growth and Tasks; import it into a second clean profile.

  **Expected:** It opens and remains editable with the same history and content.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **EXPORT-02** — Export with runtimes included versus by reference; compare the size and import both.

  **Expected:** The choice is remembered and explained; reference imports identify required exact runtimes rather than silently dropping them.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **EXPORT-03** — Import a reference archive while offline with the matching tool installed, then without it.

  **Expected:** The installed package can supply bytes; unavailable exact runtime requirements are named before a false success.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **EXPORT-04** — Try the offered copy/replace behavior with an existing Crux and a conflicting Task graph.

  **Expected:** Copies get independent identities; replacement is explicit and leaves a recoverable result.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **EXPORT-05** — Cancel export/import and try a corrupt/truncated archive.

  **Expected:** Existing work remains intact and errors explain what could not be restored.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **EXPORT-06** — Inspect any native/source/content export separately from .crux export.

  **Expected:** The UI makes clear which format preserves editability/history and which is only a finished output.

  **Needs:** Local. **Result / notes:** ____________________

<a id="sync"></a>

## 16 · Sync pane and account recovery

**Where:** Workspace → Sync; Home → In your account, not on this machine

Use two separate test profiles signed into the same test account. They must not share the same local files.

- [ ] **SYNC-01** — Back up a new Crux, edit it and back it up again; inspect status/timestamps.

  **Expected:** The panel distinguishes local-only, backed up, changed and unavailable states.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SYNC-02** — Recover the backed-up Crux on the second profile through the account recovery list.

  **Expected:** Content, history and Tasks arrive, with real Project Folders and a usable preview.

  **Needs:** Account + second profile. **Result / notes:** ____________________

- [ ] **SYNC-03** — Edit on both profiles, then try Pull on the profile containing newer unbacked work.

  **Expected:** The app explains the conflict/newer-work risk and follows your explicit choice.

  **Needs:** Account + second profile. **Result / notes:** ____________________

- [ ] **SYNC-04** — Leave an unsent draft in Crux B while pulling Crux A.

  **Expected:** B’s draft, selection and open workspace survive; no full-window reload clears them.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SYNC-05** — Pull a Crux with multiple Tasks and edit its files externally immediately afterward.

  **Expected:** Restored folders are watched correctly and Main/Task data is still separate.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SYNC-06** — Enable automatic backup, edit, wait for the indicated trigger and restart.

  **Expected:** Backups occur according to the setting; failure/offline status is truthful and recoverable.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SYNC-07** — Sign into a different test account while local work exists.

  **Expected:** The account-switch consequences are explained; old and new ownership are not silently mixed.

  **Needs:** Two test accounts. **Result / notes:** ____________________

<a id="share"></a>

## 17 · Share and public address

**Where:** Workspace → Share

Use a test account and non-sensitive content. Local API success is not proof of the production CDN, domains or billing.

- [ ] **SHARE-01** — Share while signed out, connect an account from the offered prompt and continue.

  **Expected:** Connecting returns to the requested action rather than losing work.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SHARE-02** — On first share, test cancel/decline and Back up and share.

  **Expected:** Publication and backup are distinguished; the selected backup preference is honored.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-03** — Publish, open the resulting address in another browser, edit, then Update.

  **Expected:** Version/status changes are truthful and visitors see the updated assets and routes.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-04** — Share an Astro site with a nested page, image and font; introduce a build error and attempt Update.

  **Expected:** Successful publishing ships built output; failed builds leave the previous live edition intact.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-05** — Toggle Discoverable and inspect Explore while also opening the direct URL.

  **Expected:** Listing visibility is distinct from direct-link access and matches the stated setting.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-06** — Share selected Notes pages, a public Form and a Map. Inspect the visitor result, not just the editor.

  **Expected:** Only selected public content is served; visitor forms/maps work without the full local editor.

  **Needs:** Publishing + tools. **Result / notes:** ____________________

- [ ] **SHARE-07** — Use any guestbook/public conversation controls offered and inspect moderation/deletion/refresh.

  **Expected:** Visitor actions belong to the correct Crux and private collaboration is not inadvertently exposed.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-08** — Unshare: cancel once, then confirm after reading the Store/data consequences. Open the old link.

  **Expected:** Cancel keeps it live; confirmed unshare goes offline and the app clears stale status.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-09** — Disconnect during upload and retry after reconnecting.

  **Expected:** The panel reports failure/progress accurately and a retry does not leave an unusable published edition.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **SHARE-10** — Check usage and custom-domain sections after publishing.

  **Expected:** Counts, plan limitations and actionable errors agree with the account state.

  **Needs:** Account. **Result / notes:** ____________________

<a id="func"></a>

## 18 · Functions, rules and secrets

**Where:** Share → Functions; use Order Desk as the worked example

Start with the UI rule builder. Advanced handler tests can use a collaborator or the existing Order Desk files; do not invent production secrets.

- [ ] **FUNC-01** — Create a When → event rule that writes a Store key from event data; emit a small JSON payload and inspect the result.

  **Expected:** The event payload, Store value and reported outcome agree.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-02** — Create the other Then choices: emit another event and log it; edit/delete the rules.

  **Expected:** The intended action happens once; removed rules stop running.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-03** — Create a scheduled rule with a short interval, inspect next/last run and remove it afterward.

  **Expected:** Valid schedules run as stated; invalid schedule text fails clearly.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-04** — Use Run/Emit with valid and malformed JSON; cause a handler error.

  **Expected:** Input validation and returned errors are visible and do not report a failed run as success.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-05** — Exercise an HTTP handler with query/body data and string, JSON and non-200 responses. Compare preview and a local-API publication.

  **Expected:** Encoding, method/status and request data behave consistently.

  **Needs:** Local API. **Result / notes:** ____________________

- [ ] **FUNC-06** — Add a Store hook that rejects one disposable write, then try an accepted write.

  **Expected:** The rejected value is not committed; the accepted value is stored once.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-07** — Add a dummy secret, list names, use it through a handler, then remove it.

  **Expected:** Names are visible but saved values are not displayed/exported as ordinary source; removed secrets stop resolving.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FUNC-08** — Test an allowed external endpoint and a denied endpoint through the handler’s egress configuration.

  **Expected:** Allowed requests work and denied requests fail clearly; preview and server enforce the intended policy.

  **Needs:** Test endpoint. **Result / notes:** ____________________

- [ ] **FUNC-09** — Publish Order Desk and use its visitor flow; inspect live Store, event functions and a schedule.

  **Expected:** The deployed functionality works outside the app, not only in preview.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **FUNC-10** — Run the same function/rule operations via a built-in collaborator and an outside MCP agent, then inspect the UI.

  **Expected:** Both use the same current Crux and outcome model; errors are not hidden.

  **Needs:** Real model + MCP. **Result / notes:** ____________________

<a id="tend"></a>

## 19 · Tending and alerts

**Where:** Top bar → Tending (opens as a resizable panel in the workspace in front); bell → Alerts

Use two Cruxes, two Tasks and at least one approval waiting in a hidden pane.

- [ ] **TEND-01** — Open Tending while idle and while multiple Tasks run; inspect counts and grouping.

  **Expected:** Running/waiting/idle labels and Crux/Task groups match actual work.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TEND-02** — Search Tending and change its task/status filters; open a result.

  **Expected:** Filters clear properly and the result opens the correct Crux and Task.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TEND-03** — Stop one running Task from Tending and queue a follow-up in another.

  **Expected:** Only the selected Task stops; work/drafts elsewhere remain intact.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **TEND-04** — Trigger an approval while its Collaboration pane is hidden; follow Answer/Review from Tending and from the bell.

  **Expected:** The right request appears; answering resolves its alert.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **TEND-05** — Resolve a request, then click an old notification for it.

  **Expected:** It does not approve a newer request or revive a finished action.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TEND-06** — Test alert read/dismiss/open behavior, including several alerts from different Cruxes.

  **Expected:** Counts and destinations remain correct after refresh/restart.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **TEND-07** — Deny OS notification permission, then grant it if desired.

  **Expected:** In-app alerts still work; lack of OS permission is not silent loss of the task.

  **Needs:** OS permission. **Result / notes:** ____________________

- [ ] **TEND-08** — Open Tending from Garden Home, from inside a Crux, from the Timer chip and from an alert.

  **Expected:** It opens as a panel beside your work (no separate page); moving, resizing and closing it behave like any panel. It lists your Cruxes and Tasks, never Gardens or Moods.

  **Needs:** Local. **Result / notes:** ____________________

<a id="sched"></a>

## 20 · Schedules, timers, sun and weather

**Where:** Tending panel → Schedules (the Garden in front's own); active timer chip in the top bar

Set short test intervals and remove them when finished. Scheduler work requires the desktop process to be running; quitting is not the same as closing to the menu bar.

- [ ] **SCHED-G1** — Make a schedule in a child Garden, then look at Tending in its parent. Export that Garden (Home → Export Garden) and import it into another installation.

  **Expected:** Each Garden shows only its own schedules; the imported Garden brings its schedules with it. A scheduled "wear a Mood" dresses the Garden that owns the schedule.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-01** — Create At a time (once), Every N minutes and On a cron line schedules; disable, enable and remove them.

  **Expected:** Titles, next run, actual run and enabled state agree; removed schedules stop firing.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-02** — Test malformed cron, a past one-time date, zero/negative interval and editing an existing schedule.

  **Expected:** Invalid values are explained; the final saved schedule is the one executed.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-03** — Create a timer with work/break phases, several rounds, and manual Start. Try pause/resume/reset/stop controls offered.

  **Expected:** Phase names, countdown and round transitions are correct; stopping silences pending actions.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-04** — Try a garden-event trigger and a Crux untouched trigger on a test Crux.

  **Expected:** Only the matching event/idle target fires; editing that Crux resets its untouched timing.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-05** — Try each action type offered: alert note, sound cue, Mood change, collaborator prompt, Function and tool call.

  **Expected:** Actions execute in the chosen destination with real outcomes and useful errors.

  **Needs:** Model/tools where required. **Result / notes:** ____________________

- [ ] **SCHED-06** — Chain multiple actions and choose a timer start event.

  **Expected:** Ordering/targeting are understandable and one trigger does not create an uncontrolled loop.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-07** — Enter a place name and coordinates for dawn/sunrise/sunset/dusk; inspect the calculated next run.

  **Expected:** Times fit the selected place and timezone and update when you edit it.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-08** — Configure your own weather endpoint, test one condition and an unreachable/invalid endpoint.

  **Expected:** The source is the configured endpoint, errors are visible and stale data does not trigger false certainty.

  **Needs:** Weather endpoint. **Result / notes:** ____________________

- [ ] **SCHED-09** — Wear a Mood with schedules; toggle Let the Mood schedule and keep an inherited schedule in the garden.

  **Expected:** Inherited versus garden-owned schedules are clear and obey your opt-in.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SCHED-10** — Close to the menu bar, wake from sleep and restart around a due time; inspect last/next run.

  **Expected:** The actual behavior and any missed-run policy are understandable, with no surprising duplicate burst.

  **Needs:** Desktop. **Result / notes:** ____________________

<a id="keep"></a>

## 21 · Garden Collaboration (the Keeper)

**Where:** Top bar → the Keeper's avatar, or Escape on Garden Home → the "<Garden> · Collaboration" panel

Each Garden has its own Collaboration (conversations, model), kept on the Garden. It opens as a panel in whatever workspace you are in. Use ordinary language and watch what the app actually changes.

- [ ] **KEEP-01** — Ask what is open and what is in the garden; ask it to show a particular Crux, file, pane and Home.

  **Expected:** Answers match the garden and navigation makes the requested work visible.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-02** — Ask it to grow a named Garden and plant a small project with a brief, then open it.

  **Expected:** Membership, initial content and brief exist, not just a verbal completion claim.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-03** — Ask it to create an Undertaking from its template with example-beside and example-as-start choices.

  **Expected:** Results match the corresponding UI choices.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-04** — Ask it to run the collaborator in another Crux while you keep working in the current one.

  **Expected:** The correct Crux owns the turn and your current draft remains intact.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-05** — Ask for a small Mood/name change, a checkpoint and an export; inspect each result.

  **Expected:** The same features available in the UI perform the work and produce usable output.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-06** — Switch among conversations, inspect outside-agent action entries, stop a turn (from the top-bar activity chip while the panel is closed) and reopen after restart.

  **Expected:** Histories and attribution remain distinct; a running turn is not duplicated; a child Garden's Collaboration is not the parent's.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **KEEP-07** — Give an ambiguous target name or a nonexistent Crux.

  **Expected:** It identifies the ambiguity/error instead of editing an arbitrary project.

  **Needs:** Real model. **Result / notes:** ____________________

<a id="setac"></a>

## 22 · Settings: Account and Names

**Where:** Settings → Account, Connection and Names (the Garden title field renames the Garden in front; pane names are per Mood)

Settings is a workspace panel containing sections (Cmd/Ctrl+, toggles it; the account menu opens it). Test with the default pane names first.

- [ ] **SETAC-01** — Open/close Settings from the account menu, the keyboard shortcut and its panel close; expand/collapse sections and reopen; move and resize it.

  **Expected:** It behaves like any panel; focus/scroll are sensible; closing does not also trigger another app action.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETAC-02** — Send an email code, try a wrong/expired code, resend, connect and disconnect.

  **Expected:** Errors are understandable; connection state is accurate and local work remains usable.

  **Needs:** Test account. **Result / notes:** ____________________

- [ ] **SETAC-03** — Edit the available profile fields and username; test a collision and invalid value.

  **Expected:** Accepted values persist and public identity updates only as advertised.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SETAC-04** — Inspect Connection/API address, set the local API in a test profile, try an unreachable address and restore it.

  **Expected:** The active target is clear; a launch-pinned address is read-only and failures do not look like empty account data.

  **Needs:** Local API. **Result / notes:** ____________________

- [ ] **SETAC-05** — Change the Garden title and every pane’s display name; inspect Home, tooltips, workspace and restart.

  **Expected:** Names appear consistently without changing underlying functions.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETAC-06** — Reset names to defaults and try long/empty names.

  **Expected:** Reset restores known labels and validation prevents unreadable/ambiguous empty controls.

  **Needs:** Local. **Result / notes:** ____________________

<a id="setai"></a>

## 23 · Settings: AI, Memory and metrics

**Where:** Settings → AI and Memory

Use real providers here. Record which providers passed rather than treating one as proof of all.

- [ ] **SETAI-01** — Toggle Enable AI Tools off/on. Create and manually edit while off.

  **Expected:** Manual workflows remain usable and the AI controls accurately reflect the setting.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETAI-02** — Add, replace and remove a test API key for each provider you use; reopen Settings.

  **Expected:** Saved hints/status are correct; full secrets are not exposed in ordinary UI or exports.

  **Needs:** Provider accounts. **Result / notes:** ____________________

- [ ] **SETAI-03** — Test Anthropic, OpenAI and Google Gemini with one text turn and one supported file/tool operation each.

  **Expected:** The selected provider performs the request and failures/unsupported inputs are explicit.

  **Needs:** Provider accounts. **Result / notes:** ____________________

- [ ] **SETAI-04** — Test Ollama and LM Studio with a real local model; stop the local service and retry.

  **Expected:** Model discovery, connection errors and recovery behave honestly.

  **Needs:** Local model. **Result / notes:** ____________________

- [ ] **SETAI-05** — Test Claude Code and Codex connection/setup state, one real turn, a permission request and reconnect/restart.

  **Expected:** The actual external process/session works, with visible scoped permissions and no wrong-directory edits.

  **Needs:** Installed agents. **Result / notes:** ____________________

- [ ] **SETAI-06** — Test the included collaborator while signed out, eligible, and at a limit/unavailable state.

  **Expected:** Eligibility and remaining allowance are clear; fallback/setup options do not lose the conversation.

  **Needs:** Included service. **Result / notes:** ____________________

- [ ] **SETAI-07** — Ask a collaborator to remember a harmless preference; inspect Memory, edit it and forget it. Start a new Crux.

  **Expected:** Current memory is reflected in subsequent work; forgotten text does not remain as an active instruction.

  **Needs:** Real model. **Result / notes:** ____________________

- [ ] **SETAI-08** — Clear memory in the test profile, cancel first, and restart.

  **Expected:** Cancel preserves it; confirmed clear persists and does not delete projects.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETAI-09** — Enable Record agent metrics, run a successful and failed tool call, inspect and save a report.

  **Expected:** Counts/failure categories update; the chosen relative report path works without storing private conversation content.

  **Needs:** Real model. **Result / notes:** ____________________

<a id="mcp"></a>

## 24 · Settings: Agents and outside control

**Where:** Settings → Agents

Use the connection snippets generated by this running profile. Do not paste its token into a bug report. A different app’s MCP client should do these tests.

- [ ] **MCP-01** — Enable access for one Crux, copy its offered connection snippet and connect from an outside client.

  **Expected:** It can discover/read that Crux’s tools and the app shows a running server.

  **Needs:** MCP client. **Result / notes:** ____________________

- [ ] **MCP-02** — From the per-Crux connection, read/write/rename a test file and request a checkpoint; try accessing another Crux.

  **Expected:** Allowed work appears in its Collaboration/Growth; another Crux is outside this connection’s scope.

  **Needs:** MCP client. **Result / notes:** ____________________

- [ ] **MCP-03** — Request deletion and publication; decline once and approve once through the visible app prompt.

  **Expected:** The outside call waits; decline changes nothing and approval affects only the requested target.

  **Needs:** MCP + publishing. **Result / notes:** ____________________

- [ ] **MCP-04** — Enable Whole garden access, connect, list the garden, create/open Cruxes and a child Garden, then use a creative tool.

  **Expected:** Actions work across selected Cruxes and are attributed to the outside agent.

  **Needs:** MCP client. **Result / notes:** ____________________

- [ ] **MCP-05** — Use whole-garden access to create an Undertaking, run a collaborator, change a Mood, export and inspect a checkpoint.

  **Expected:** Results match the UI paths and stay visible/reviewable.

  **Needs:** MCP + model. **Result / notes:** ____________________

- [ ] **MCP-06** — Run built-in and outside collaborators on separate Tasks, then attempt conflicting edits in one Task.

  **Expected:** Separate copies stay isolated; conflicts/guards are clear rather than silently losing a human edit.

  **Needs:** MCP + model. **Result / notes:** ____________________

- [ ] **MCP-07** — Regenerate the token, try the old connection, then reconnect with the new snippet; switch access off.

  **Expected:** Old credentials/access stop working; the new credentials work only while enabled.

  **Needs:** MCP client. **Result / notes:** ____________________

- [ ] **MCP-08** — Restart, inspect server state and reconnect as the UI instructs; export and inspect a project archive for connection credentials.

  **Expected:** Connection state is truthful and host tokens/API keys are not shipped with the creative project.

  **Needs:** MCP client. **Result / notes:** ____________________

<a id="setdata"></a>

## 25 · Settings: Sync, Plan, Usage, Garden and Desktop

**Where:** Settings → corresponding sections

Use disposable data for wipe, migration and account-switch checks. Run paid flows only in the intended test-billing environment.

- [ ] **SETDATA-01** — Inspect account-wide sync/backup preferences and their per-Crux listings; back up several test projects.

  **Expected:** Global and per-Crux status agree, and exclusions/preferences are honored.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SETDATA-02** — Open Plan, compare available tiers, start a test upgrade, cancel checkout and complete test checkout.

  **Expected:** Correct plan/price/environment and return states appear; cancel is not treated as purchase.

  **Needs:** Test billing. **Result / notes:** ____________________

- [ ] **SETDATA-03** — Open billing management and test the available change/cancel flow; return via success, canceled and invalid billing URLs.

  **Expected:** Account state refreshes correctly and errors offer a clear return path.

  **Needs:** Test billing. **Result / notes:** ____________________

- [ ] **SETDATA-04** — Inspect Usage totals and per-Crux storage/bandwidth/Store meters after known test activity.

  **Expected:** Values are plausible, loading/errors are distinguished from zero, and limits are explained.

  **Needs:** Account. **Result / notes:** ____________________

- [ ] **SETDATA-05** — Export the entire Garden and import it into a separate clean profile.

  **Expected:** Cruxes, Tasks, collections, files, conversations, history and eligible settings survive; credentials are not leaked.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETDATA-06** — Change Garden location and create another Crux. Reopen an older one.

  **Expected:** New projects use the new location; existing projects stay where they were and still work.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SETDATA-07** — Inspect Installed tools, remove an optional tool and reopen an already-created project from it; reinstall afterward.

  **Expected:** Creation availability changes while existing creative projects retain their work.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **SETDATA-08** — Use the wipe confirmation in the disposable profile: wrong phrase, Cancel, then Export, then wipe. Restore from the export.

  **Expected:** Guards work; export precedes wipe and restoration is complete. Never use your real profile here.

  **Needs:** Disposable profile. **Result / notes:** ____________________

- [ ] **SETDATA-09** — Inspect Desktop version, update checks, no-update/error states and automatic-check preference.

  **Expected:** The running version and updater availability are honest; development builds do not pretend to install a release.

  **Needs:** Packaged app for update. **Result / notes:** ____________________

- [ ] **SETDATA-10** — Toggle Keep running in the menu bar when the window closes; close, reopen and explicitly Quit.

  **Expected:** Close versus Quit behave differently as stated; timers/work do not continue after a real quit.

  **Needs:** Desktop. **Result / notes:** ____________________

<a id="mood"></a>

## 26 · Mood: Moods and Theme (the Mood panel)

**Where:** Top bar → Mood (the Mood panel is the one Mood editor: Moods · Theme · Background · Sound · Persona; the Mood Bar's sound button opens it on Sound)

Try Plasma and a Soft Mood, in both light and dark. The current role fonts are Outfit titles, Garamond wordmark, Inter body and JetBrains Mono code.

- [ ] **MOOD-G1** — In a child Garden, change the theme (e.g. pick Ivory). Leave to its parent and come back; then change it again and press "Keep for <Garden>".

  **Expected:** The panel says the look was changed here. Without keeping, the parent paints its own Mood and returning repaints the child's; after keeping, the child wears "<Mood> · <Garden>" and it returns with that Garden only.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-01** — Wear several built-in Moods from the browser; change material/light-dark mode and reopen the same workspace.

  **Expected:** Text, controls and panes remain readable; selection and state persist.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-02** — Change a setting on one Mood tab, then inspect the others and the Mood Bar.

  **Expected:** They edit the same active Mood and do not overwrite unrelated settings; there is no separate Builder page.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-03** — Change colors, scale/density, surfaces, borders, corners and pane-specific theme values offered. Reset one and use Undo where offered.

  **Expected:** The corresponding surface changes; reset/Undo restores only the intended state.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-04** — Search token names, switch token groups and use color/number/select/asset inputs. Try boundaries and invalid values.

  **Expected:** Search/filter and input validation work; a bad value cannot make recovery controls inaccessible.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-05** — Save current as a named Mood/preset, wear another, return, rename/delete the saved item as offered.

  **Expected:** Your saved appearance is independent, persistent and removable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-06** — Export a Mood package, import into a clean profile and wear it offline.

  **Expected:** Appearance, included assets, sound/persona settings and applicable schedules survive.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-07** — Inspect titles, body text, code, Collaboration and the Garden's Collaboration panel across Moods.

  **Expected:** Font roles stay consistent; Garamond is the wordmark, and title styling does not spill into ordinary content.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-08** — Open panels/dialogs, move the pointer over their edges and drag/resize them in Plasma.

  **Expected:** Panels appear without the old pop-in/jiggle/stretch; iridescent lighting still works.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-09** — Test transparency/material effects against a bright image background and a dark one.

  **Expected:** Text contrast, focus, selected rows, warnings and disabled controls remain distinguishable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-10** — Each Garden wears its own Mood. In a child Garden wear a built-in Mood; go to its parent and back (Navigator or Back).

  **Expected:** The Moods tab opens with “<Garden> wears <Mood>”; the child keeps its look, the parent keeps its own, and the app repaints as you move between them.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-11** — In the child, use **Follow <parent>**, then **Use the Default Mood**; wear a Mood in the parent while the child follows it; restart.

  **Expected:** The line says where the look comes from (“from My Garden”, “chosen here”); the choices survive restart.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **MOOD-12** — Save the current look as a Mood, tweak a token in the Builder, move to another Crux in the same Garden and back; then try to delete the Mood you are wearing.

  **Expected:** The tweak survives navigation within the same Mood; the worn Mood's delete control is unavailable until you wear another. Saved Moods never appear as project cards on Home.

  **Needs:** Local. **Result / notes:** ____________________

<a id="flow"></a>

## 27 · Mood: Flow

**Where:** Mood → Flow and Sensitivity

Use real creative work, including inside embedded editors. These are feel checks as well as functional checks; make notes about the ramp.

- [ ] **FLOW-01** — In a fresh profile, wear Plasma; then wear a non-Plasma Mood with no custom Flow preference.

  **Expected:** Plasma defaults on with middle sensitivity; other Moods default off.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-02** — At middle sensitivity, work for a minute: type, move panes, open files, create Cruxes and have a conversation.

  **Expected:** Color/light gradually grow and iridescence becomes the visible Flow indicator, without abrupt per-click pulses.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-03** — Stop interacting and watch for at least a minute; continue until it settles.

  **Expected:** Decay is noticeable and gradual, returning toward baseline rather than switching off instantly.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-04** — Try minimum sensitivity with a few actions, then sustained heavy activity.

  **Expected:** A few actions barely register; sustained activity can still build Flow.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-05** — Try maximum sensitivity with individual actions.

  **Expected:** Most actions contribute promptly, but the visual transition still feels organic.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-06** — Work inside Notes/drawing/game editors before saving, then let a built-in or outside collaborator work.

  **Expected:** Embedded creative input and collaborator activity contribute, not just clicks in the host.

  **Needs:** Model/MCP for agent half. **Result / notes:** ____________________

- [ ] **FLOW-07** — Turn Flow off during a glow, change Moods, restart and inspect the preference.

  **Expected:** The app returns to its normal Mood baseline; the chosen setting/sensitivity persists and no residual glow is stuck.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FLOW-08** — Use reduced motion and a lower-powered/small-window setup while Flow is active.

  **Expected:** Effects respect the available motion controls and do not make the app hard to use; record stutter or excessive dimming.

  **Needs:** Local. **Result / notes:** ____________________

<a id="bg"></a>

## 28 · Mood: Background, assets and Persona

**Where:** Mood → Background, Theme → Assets, Persona

Bring a small image, GIF/video if supported, an SVG and an audio file.

- [ ] **BG-01** — Try Bloom, Drift, Waves and Blank, plus the uploaded-backdrop options offered. Switch light/dark.

  **Expected:** Available choices behave as described, respect mode restrictions and do not obscure controls.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **BG-02** — Upload/change/remove a backdrop; edit its description and adjustment controls.

  **Expected:** The chosen asset appears, persists and can be removed without breaking the Mood.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **BG-03** — Add assets, assign one to an offered pane/role, change that assignment and remove it.

  **Expected:** The right surface uses it; removed assets do not leave broken-image placeholders.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **BG-04** — Import invalid/oversized media and duplicate asset names.

  **Expected:** Limits/errors are understandable and the earlier working backdrop remains recoverable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **BG-05** — Change Persona name, greeting and avatar, then create a new Crux and reopen an old conversation.

  **Expected:** New interactions use the selected persona; historical attribution is not misleadingly rewritten.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **BG-06** — Export/import the Mood and inspect its assets/avatar offline.

  **Expected:** The package carries the actual selected assets rather than references to your machine.

  **Needs:** Local. **Result / notes:** ____________________

<a id="sound"></a>

## 29 · Mood: Sound and cues

**Where:** Mood → Sound; workspace player; Craft cue

Listen during these tests. A meter moving or a screenshot cannot prove audio.

- [ ] **SOUND-01** — Toggle Sound on/off, play/pause, select tracks, seek where offered and change volume including zero.

  **Expected:** Audible output and UI agree; mute/pause does not leave ghost playback.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SOUND-02** — Import several audio files, choose tracks, remove a playing track and restart.

  **Expected:** Playback and saved selection recover sensibly without overlapping players.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SOUND-03** — Assign and preview a cue for every event listed in Sound. Trigger representative real events.

  **Expected:** Correct cues play at an appropriate level; disabled/unassigned cues stay silent.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SOUND-04** — Craft a cue: choose a preset, change its parameters, preview, save, reuse and remove it.

  **Expected:** Saved sound matches the preview and remains available after restart/export.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SOUND-05** — Start a large tool and run collaborator work while listening. Navigate home and between workspaces.

  **Expected:** Soundtrack state remains coherent and loading does not freeze or duplicate audio.

  **Needs:** Audio + model. **Result / notes:** ____________________

- [ ] **SOUND-06** — Cancel pending sampler playback while samples load, and switch Crux immediately.

  **Expected:** Canceled sound does not start later or escape into another project.

  **Needs:** Audio. **Result / notes:** ____________________

- [ ] **SOUND-07** — Test a schedule cue/timer completion, close to menu bar and reopen.

  **Expected:** Audio follows the actual schedule and sound preference; there is no unexpected burst after reopening.

  **Needs:** Audio. **Result / notes:** ____________________

<a id="explore"></a>

## 30 · Explore and installing tools/Moods

**Where:** Home or public site → Explore

The production catalog still needs rollout. If testing the packaged tool install now, use the populated local API in your disposable profile.

- [ ] **EXPLORE-01** — Search, switch each kind/filter, use tags/author links and paginate; try a query with no matches.

  **Expected:** URL/filter state and results agree; clear/back restores a useful view.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **EXPLORE-02** — Open a result and return to the previous search.

  **Expected:** The correct author/Crux appears and search context is preserved.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **EXPLORE-03** — Install Sketch (p5) and GDevelop from a build that does not include them; cancel/fail one download before retrying.

  **Expected:** Progress/errors are clear and installation succeeds without thousands of per-file downloads.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **EXPLORE-04** — Create from each installed tool, make a native edit, save, restart and reopen.

  **Expected:** An editable local project exists and needs no fresh download for every new Crux.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **EXPLORE-05** — Inspect size, upstream/license information and Tool Info before/after install.

  **Expected:** Identity and provenance remain correct; nothing calls a downloaded editor your own original app.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **EXPLORE-06** — Install a Mood, wear it, export/import it and inspect assets/sound.

  **Expected:** The result is the advertised Mood and works from local assets after installation.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **EXPLORE-07** — Reinstall/replace an installed tool with the same valid package; try a broken or wrong-identity package.

  **Expected:** Successful replacement is explicit; failure preserves the previous working installation.

  **Needs:** Tool archives. **Result / notes:** ____________________

- [ ] **EXPLORE-08** — Go offline after successful installation and create another project.

  **Expected:** Locally installed assets remain usable; network-only capabilities explain their limits.

  **Needs:** Local. **Result / notes:** ____________________

<a id="public"></a>

## 31 · Public garden, public Crux and website

**Where:** Open your public profile and shared Crux in a separate browser

Run after publishing to the environment you are actually testing. Mark production work Blocked until deployed, not Passed based on the local API.

- [ ] **PUBLIC-01** — Open /username and a Crux detail URL, click cards/tags/author links, then navigate back.

  **Expected:** Correct public content and identity appear; private/local-only Cruxes are absent.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **PUBLIC-02** — Open a published page and its nested routes directly; refresh and open assets in a private browser window.

  **Expected:** The site works without desktop login, local folders or an app preview server.

  **Needs:** Production CDN. **Result / notes:** ____________________

- [ ] **PUBLIC-03** — Open How was this made? and inspect the public creation record where offered.

  **Expected:** The intended provenance is readable without exposing secret/local host credentials.

  **Needs:** Publishing. **Result / notes:** ____________________

- [ ] **PUBLIC-04** — Test any offered remix/download/clone action, then edit the resulting local copy.

  **Expected:** Your copy is independent and attribution/lineage are preserved.

  **Needs:** Published remixable item. **Result / notes:** ____________________

- [ ] **PUBLIC-05** — Open a nonexistent/deleted/unshared Crux, unknown route and malformed public address.

  **Expected:** A clear not-found/unavailable page offers recovery rather than a blank screen.

  **Needs:** Network. **Result / notes:** ____________________

- [ ] **PUBLIC-06** — Visit the website landing page, try its player, navigation, email signup and subscribed return page.

  **Expected:** Website-only controls stay on the website; success/error is honest and the desktop editor is not exposed as the public builder.

  **Needs:** Website + test signup. **Result / notes:** ____________________

- [ ] **PUBLIC-07** — Check Plans and billing return routes from the website at narrow and wide sizes.

  **Expected:** Prices, links, return states and app handoff match the tested billing environment.

  **Needs:** Website/test billing. **Result / notes:** ____________________

- [ ] **PUBLIC-08** — After release content rollout, open each of the six public example links and the tool catalog from the landing/Explore path.

  **Expected:** Every link reaches the intended usable published example/tool; no local-only URL escaped into production.

  **Needs:** Release content. **Result / notes:** ____________________

<a id="domain"></a>

## 32 · Custom domains and release-only checks

**Where:** Share → custom domain; Settings → Desktop; installed release build

These need real infrastructure or a packaged build. A missing deployment is a blocker to this pass, not an undiscovered UI feature.

- [ ] **DOMAIN-01** — Add a test subdomain, inspect/copy the DNS records, verify and open it over HTTPS.

  **Expected:** Records match the response, pending states are explicit and the verified domain serves the correct Crux.

  **Needs:** Test DNS + plan. **Result / notes:** ____________________

- [ ] **DOMAIN-02** — Try an apex domain, incorrect records, duplicate ownership and removing the domain.

  **Expected:** Instructions distinguish apex/subdomain and removal/ownership behavior is clear.

  **Needs:** Test DNS + plan. **Result / notes:** ____________________

- [ ] **DOMAIN-03** — Install the signed macOS release into a clean test environment and launch/quit/reopen it.

  **Expected:** Normal install succeeds, OS signing behaves as intended and local data persists.

  **Needs:** Packaged macOS build. **Result / notes:** ____________________

- [ ] **DOMAIN-04** — Install the signed Windows release and test the same first-garden/edit/export path.

  **Expected:** Installer identity/OS prompts and app behavior are acceptable; this cannot be signed off on macOS.

  **Needs:** Windows + signed build. **Result / notes:** ____________________

- [ ] **DOMAIN-05** — Test the distributed Linux format if shipping it and a release update from an older version.

  **Expected:** Install/update preserves the garden and settings; rejected/unavailable updates are explained.

  **Needs:** Target OS/release feed. **Result / notes:** ____________________

- [ ] **DOMAIN-06** — Exercise included collaboration, live billing eligibility, migrations, real email and production publication on the launch environment.

  **Expected:** Actual hosted services work; local/mock test success is not substituted for these checks.

  **Needs:** Launch infrastructure. **Result / notes:** ____________________

<a id="recover"></a>

## 33 · Recently deleted, restoration and failure recovery

**Where:** Home → Recently deleted; Settings → Garden; Sync

Use only the disposable profile for permanent deletion or a process crash.

- [ ] **RECOVER-01** — Restore a deleted Crux with files, Growth and Tasks; create another with the same name before restoring.

  **Expected:** The whole original is restored alongside the new one without overwriting it.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **RECOVER-02** — Delete forever: cancel first, then confirm on an exported disposable Crux; restart.

  **Expected:** Cancellation is harmless; permanent deletion stays deleted and the UI states the consequence.

  **Needs:** Disposable data. **Result / notes:** ____________________

- [ ] **RECOVER-03** — Recover from .crux, .cruxspace and .garden archives into clean profiles, with the network disconnected.

  **Expected:** Self-contained archives genuinely restore work rather than relying on the authoring profile.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **RECOVER-04** — Close a native editor or quit during a pending save using the offered confirmation paths.

  **Expected:** Unsaved work is acknowledged and normal Save/Cancel behaves consistently.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **RECOVER-05** — In the disposable profile, terminate/relaunch once after saving and once while a small edit is pending.

  **Expected:** Previously saved data remains readable; recovery behavior for the pending edit is clear. Record the precise loss window.

  **Needs:** Disposable profile. **Result / notes:** ____________________

- [ ] **RECOVER-06** — Try opening a moved/missing Project Folder, then restore its location or choose the offered recovery.

  **Expected:** The error names the missing resource and does not silently create a replacement empty project.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **RECOVER-07** — Test low disk/unwritable-folder behavior in an isolated environment if available.

  **Expected:** Save/export failure is visible and the app does not falsely report a durable save.

  **Needs:** Isolated filesystem test. **Result / notes:** ____________________

<a id="feel"></a>

## 34 · Everywhere: accessibility, polish and a real session

Note (2026-09-26): the public garden is one flat page per account at `@username` listing shared Cruxes; it never shows your private Gardens. Other people's work is reached through Explore only.

**Where:** Repeat on Home, Settings, Mood, every pane and representative tools

This pass deliberately catches awkwardness that functional checks miss.

- [ ] **FEEL-01** — Use only keyboard navigation for a create/edit/save/dialog/return path; inspect visible focus and Escape.

  **Expected:** No focus trap outside a modal or unreachable primary control.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-02** — At narrow width and increased text zoom, inspect every section and open menu.

  **Expected:** No clipped actions, off-screen dialogs or required horizontal scrolling through ordinary forms.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-03** — Compare Plasma/Soft, light/dark, busy/empty/error/disabled states on the same pages.

  **Expected:** Contrast and hierarchy remain readable; typography follows the role choices.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-04** — Test loading, empty, error and successful states for every remote panel you use.

  **Expected:** A spinner has an outcome, empty is not disguised failure and errors include a next step.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-05** — Spend a sustained session creating across three tools while using Tasks, soundtrack, Flow and a collaborator.

  **Expected:** Switching remains responsive; no stale preview, duplicate audio, lost draft or growing input lag.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-06** — For every visible button, switch, menu item and editable field not already exercised, try it and add a note here.

  **Expected:** No untested visible control is silently assumed to work; add its page, action and result to the report.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **FEEL-07** — Retest every failed item after a fix, then repeat a short create → edit → checkpoint → publish → export/import path.

  **Expected:** The original failure is fixed and adjacent core behavior still works.

  **Needs:** Local. **Result / notes:** ____________________

<a id="tools"></a>

## 35 · Every creation choice: the native-tool sweep

**Where:** Add Crux → the named choice → Workshop

There are 67 current v1 creation choices in this source snapshot (25 app-owned starters/connections and 42 manifest tools, including 34 optional tools). This is broader than older roadmap counts. Each row is its own acceptance record. Apply the eight-step tool recipe below to EVERY row; the row supplies the specific creative exercise. Missing required tools/services are Blocked, not a pass. V2 Garden is excluded.

- [ ] **TOOL-blank** — Blank [Starter] — Create index.html, a stylesheet and a tiny script; edit text/color and click a button in preview.

  **Expected:** The page loads, interaction works, and source files remain editable. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-notes** — Notes [Starter] — In Tigrana, create/rename notes and a folder, format text, insert an image, link notes, choose public pages and make a book output.

  **Expected:** Native notebook edits survive; the public edition contains only selected notes and the EPUB opens. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-blender** — Blender [Starter] — Connect a disposable Blender scene, add a mesh/material, make a native edit, save the scene and render/export through the offered controls.

  **Expected:** The real Blender scene changes and a usable scene/render reaches the Crux; disconnected status is explicit. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-figma** — Figma [Starter] — Connect a test Figma document, select a frame, inspect it, change one design element in Figma and bring an offered export into the Crux.

  **Expected:** The selected document/frame and saved export match; Garden does not imply it owns the external document. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-moqira** — Mockups [Starter] — Create two mockup screens, add/move/edit components, duplicate a screen and select the public edition.

  **Expected:** Native layout survives and only the selected screens appear in the published viewer. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-tool-excalidraw** — Whiteboard [Starter] — Draw shapes/text, connect them, import an image and save PNG/SVG outputs; use the shared view-mode page.

  **Expected:** Editable drawing and exports agree; visitors get the intended drawing rather than an empty editor. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-tool-univer** — Spreadsheet [Starter] — Enter text/numbers/formulas, format cells, add a sheet and edit the same cell again after reopening.

  **Expected:** Formulas calculate and sheet/cell formatting and values survive. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-tool-tables** — Tables [Starter] — Create columns/rows, edit several cell types, sort/filter and import/export a small dataset.

  **Expected:** Rows and types stay correct and exported data matches the current table. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-tool-smplr** — Sample sequencer [Starter] — Program sample steps, change kit/tempo, start/stop while loading samples and save/reopen.

  **Expected:** Pattern and audible timing survive; canceled playback never starts later. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-tool-playcanvas** — 3D Workshop [Starter] — Create a small 3D object/scene, adjust camera/material controls and save the scene/output offered.

  **Expected:** The visible scene remains editable and is distinct from the full PlayCanvas Editor project type. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-cardinal-drone** — Cardinal Drone [Starter] — Adjust the supplied patch, listen, save it, reload and compare; change one patch setting with a collaborator.

  **Expected:** The patch and audible result agree, with usable stop/mute and no duplicate sound. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-order-desk** — Order Desk [Starter] — Submit two test orders, inspect Store records and function responses, change a rule and test it locally and after publication.

  **Expected:** Requests produce the intended records/results and rejected input does not create an order. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-onebigsky** — One Big Sky [Starter] — Play the scene, exercise its visible controls, change one exposed source/config value and reload.

  **Expected:** The changed game/scene remains playable and the edit survives. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-empty** — Empty (Astro) [Starter] — Add a home page, a nested route and an asset; run preview, break/fix syntax, then publish.

  **Expected:** The plain Astro project builds and both routes work outside the local preview. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-homepage** — Astro Home Page [Starter] — Use Site settings, edit About, add a Work and a Blog entry, attach an image and navigate each route.

  **Expected:** Content forms and source stay in agreement and the resulting home page is coherent. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-blog** — Astro Blog [Starter] — Create/edit a post, tags, date, pinned/draft state and image; inspect blog, post and search/navigation.

  **Expected:** Post visibility, ordering and links match the saved metadata. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-recipes** — Recipe Book [Starter] — Add a recipe with ingredients, steps and an image; change its title/slug and inspect the recipe route.

  **Expected:** Ingredients/steps preserve order and the renamed page/link remains usable. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-storefront** — Storefront [Starter] — Add/edit a product, price, image and destination link; inspect listing and product route.

  **Expected:** The displayed product/price/link is correct; do not assume the starter implements payment processing. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-digital-garden** — Digital Garden [Starter] — Add linked notes/pages, change navigation or page metadata and follow internal links.

  **Expected:** The content graph/navigation reaches the correct pages and publishes as a usable site. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-business-page** — Business Page [Starter] — Change business settings, offer, FAQ, pricing and a news entry; preview every top-level navigation item and publish.

  **Expected:** The Astro build passes; FAQ categories and all nonanimated sections are visible. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-resume** — Resume [Starter] — Change profile/contact information, experience, dates and links through the offered content controls.

  **Expected:** The resume reflects your data without broken ordering, overflow or placeholder links you thought you replaced. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-photo-gallery** — Photo Gallery [Starter] — Add several images with captions, reorder/filter as offered, open a full image and test narrow layout.

  **Expected:** Correct originals/captions are used, images load and gallery controls remain usable. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-feed** — Astro Feed [Starter] — Add a feed entry with text and media, change date/order and open its own route.

  **Expected:** The feed and detail page agree, with working media and links. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-astro-media** — Astro Media [Starter] — Add an audio and video entry, edit metadata and use the player while switching entries.

  **Expected:** The right media plays and stops, with correct labels and no overlapping old player. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-5ws** — 5Ws [Starter] — Edit a sample question/answer, start and finish a round, test question/time limits and start another.

  **Expected:** The game uses your content, enforces its displayed rules and does not leak the answer prematurely. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-abc-app** — Notation [Optional tool — install first] — Change an ABC melody, tempo and instrument options offered; listen and save the offered score/audio output.

  **Expected:** Notation and playback reflect the score and the saved output opens. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-am-1-app** — AM-1 [Optional tool — install first] — Change all three arpeggio parts, a scale/tempo control and patch settings; play/stop and save.

  **Expected:** The audible parts and saved patch match the controls and playback stops cleanly. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-audiomass-app** — AudioMass [Optional tool — install first] — Load a short clip, select/trim, apply an effect, undo/redo and combine tracks if offered; export audio.

  **Expected:** Selection/effects are audible and the exported duration/content match the edit. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-beepbox-app** — BeepBox [Optional tool — install first] — Write notes in two patterns, change instrument/tempo, arrange them, play and save an offered output.

  **Expected:** The song structure and sound survive reopening. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-bentopdf-app** — BentoPDF [Optional tool — install first] — Merge two small PDFs, reorder/remove a page, split a result and use one editing/conversion operation.

  **Expected:** Output PDFs have the intended pages and open in an independent viewer. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-bitsy-app** — Bitsy [Bundled tool] — Edit a room, sprite and dialog, place an exit, play through it and save/export using native controls.

  **Expected:** Room transitions and dialog work and the editable world survives. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-blockbench-app** — Blockbench [Optional tool — install first] — Create a model, change geometry, paint a texture, add an animation if offered and export a native/finished format.

  **Expected:** Geometry, texture and animation remain editable and the export opens appropriately. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-eventcalendar-app** — Calendar [Bundled tool] — Create, edit, move and delete timed/all-day events; switch calendar views and cross a day/week boundary.

  **Expected:** Dates/durations and timezone presentation stay correct after reopening. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-fmg-app** — Fantasy Map [Optional tool — install first] — Generate a small world, rename a place, adjust a region/label and save native plus image output.

  **Expected:** The edited world survives and rendered maps show the intended changes. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-formjs-app** — Form [Optional tool — install first] — Create text/number/choice fields with validation, edit labels, preview and publish a form; submit good/bad answers.

  **Expected:** Validation behaves correctly and valid visitor answers reach the intended Store. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-gdevelop-app** — GDevelop [Optional tool — install first] — Create a small scene, add an object/instance and event, preview/play and save; reopen the native project.

  **Expected:** Objects/events remain editable, gameplay reflects changes and the project survives a full restart. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-gephi-app** — Gephi Lite [Optional tool — install first] — Load a small graph, inspect nodes/edges, change labels/layout/filter and save an offered graph/image output.

  **Expected:** The displayed network and exported data preserve the intended nodes and edges. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-glsl-app** — Shader [Optional tool — install first] — Change a fragment shader, trigger/fix a compile error and save a frame; open its public shader page.

  **Expected:** Live rendering responds, errors recover and the frame/public rendering matches. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-glyphr-app** — Font [Optional tool — install first] — Draw/edit a glyph, copy one, change advance/metrics and build an offered font format.

  **Expected:** The glyphs remain editable and an independent font preview shows the intended shapes/spacing. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-hextris-app** — Hextris [Bundled tool] — Play using the shown controls, pause/restart, then change a small source/config setting and reload.

  **Expected:** Gameplay remains playable and the source change is preserved. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-jscad-app** — Model [Optional tool — install first] — Create a parameterized shape, change its dimensions, trigger/fix a code error and export STL or another offered format.

  **Expected:** Viewer dimensions change and an independent model viewer opens the output. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-jupyterlite-app** — JupyterLite [Optional tool — install first] — Create a notebook, run Python cells, import a CSV, calculate a result and draw a plot; interrupt/restart the kernel.

  **Expected:** Saved cells and outputs make sense, rerunning reproduces the calculation and kernel state is explicit. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-kan-app** — Kan [Optional tool — install first] — Create a board/list/card, edit details, move cards between lists, reorder and delete a disposable card.

  **Expected:** Card contents and ordering survive and native drag/drop still works after agent edits. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-ketcher-app** — Ketcher [Optional tool — install first] — Draw a molecule/reaction, edit bonds/atoms, import a small supported structure and export it.

  **Expected:** The native structure survives and reimport has the same connectivity. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-link-app** — Link [Bundled tool] — Choose a disposable existing folder, inspect its scripts, explicitly permit the offered run and stop it; try a missing folder.

  **Expected:** The selected project/script is the one run; the app explains access and missing-folder failures. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-maps-app** — Map [Optional tool — install first] — Add a place, route and area, change labels/styles and choose the public map; pan/zoom and reopen.

  **Expected:** Saved geometry and public selection agree; unavailable map tiles are distinguished from lost geometry. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-media-app** — Media Tools [Bundled tool] — Inspect available binary/tool status; resize an image, trim/convert a short clip and convert one supported document.

  **Expected:** Every offered available operation produces a real output Artifact; unavailable binaries are identified. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-mermaid-app** — Mermaid Live Editor [Optional tool — install first] — Write a flowchart and sequence diagram, trigger/fix syntax errors, change theme and save an offered output.

  **Expected:** Diagrams update from source and saved images/documents render correctly. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-minipaint-app** — miniPaint [Optional tool — install first] — Import a photo, add paint/text layers, transform/crop, undo/redo and save editable plus flat outputs.

  **Expected:** Layer structure survives and the flattened image matches the composition. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-opencut-app** — OpenCut [Optional tool — install first] — Import clips, trim and arrange a short sequence, add audio/title where offered and save/export.

  **Expected:** The timeline survives; preview and any supported rendered output match. Record unsupported export honestly. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-openmosh-app** — OpenMosh [Optional tool — install first] — Create an image/video/slideshow project, change assets/effects/order and save/reopen; use a supported export.

  **Expected:** The actual project model survives and exports match supported output behavior. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-p5-app** — Sketch [Optional tool — install first] — Change shape/color/motion in the sketch, introduce/fix a script error and save a frame; publish the live page.

  **Expected:** Canvas behavior reflects code, error recovery works and exported/live output is usable. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-pdfme-app** — Layout [Optional tool — install first] — Lay out text/image fields on a page, align/resize, duplicate a page or field and export PDF/PNG as offered.

  **Expected:** Editable layout and printed output agree without missing assets. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-piskel-app** — Piskel [Optional tool — install first] — Draw two frames on multiple layers, change timing, preview animation and export an offered sprite/animation format.

  **Expected:** Pixels/layers/frame timing survive and the exported animation/sheet matches. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-playcanvas-editor-app** — PlayCanvas Editor [Optional tool — install first] — Create a scene/entity, edit transforms/materials, attach a small classic script and run the scene.

  **Expected:** The real editor saves the scene and the script runs without reaching another Crux. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-pptist-app** — PPTist [Optional tool — install first] — Create slides with text/shapes/images, change theme/order, present, undo/redo and export a supported format.

  **Expected:** Editable slides, presentation and exported output remain consistent. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-rawgraphs-app** — RAWGraphs [Optional tool — install first] — Load a small CSV, map fields to a chart, change labels/colors and save a figure.

  **Expected:** Changing the data/mapping changes the plotted marks and exported figure. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-recorder-app** — Record [Optional tool — install first] — Choose the offered screen/camera sources, test permission denial, record a short clip and stop; use the clip elsewhere.

  **Expected:** The actual recording is playable, tracks stop on Stop and no camera/microphone remains active unexpectedly. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-runner-app** — Runner [Bundled tool] — Make a Garden containing Stack and Link Cruxes, refresh Runner and switch a service between stack/source; start/stop it.

  **Expected:** Configuration, ports, dependencies and running states correspond to the selected provider. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-signal-app** — Song [Optional tool — install first] — Add tracks/notes, arrange measures, change tempo/instruments and save MIDI/WAV as offered.

  **Expected:** The sequencer and audible/exported song preserve your arrangement. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-stack-app** — Stack [Bundled tool] — Use a harmless test Compose stack, inspect/configure/start/stop services and inspect ports/logs; try an unsafe outside path.

  **Expected:** Only the selected stack runs and unsupported/outside access is refused clearly. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Tool-specific setup. **Result / notes:** ____________________

- [ ] **TOOL-svgedit-app** — SVG-Edit [Optional tool — install first] — Draw vectors/text, add an image, use layers/groups, transform/style objects and export SVG/raster as offered.

  **Expected:** The editable vector structure and rendered output stay consistent. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-timeline-app** — Timeline [Optional tool — install first] — Create dated events with groups/eras/media, change dates/order and view the public timeline.

  **Expected:** Events, media and chronological navigation reflect the saved data. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-twine-app** — Twine [Optional tool — install first] — Create linked passages, variables/choices as supported, play each branch and save/export the story.

  **Expected:** Links/state work and the editable story reopens with its passage structure. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-underrun-app** — Underrun [Bundled tool] — Play the shooter, test movement/action/restart and change one small source setting before reloading.

  **Expected:** The game remains functional and changes persist in its own source files. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Local / dependencies. **Result / notes:** ____________________

- [ ] **TOOL-web-synth-app** — web-synth [Optional tool — install first] — Connect modules, alter a sequence/patch, play/stop and save/reopen the composition.

  **Expected:** Routing and audible behavior survive, with no stuck playback. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

- [ ] **TOOL-wick-editor-app** — Wick Editor [Optional tool — install first] — Draw an object, animate frames and add an interactive action if offered; save/reopen and preview/export.

  **Expected:** The native Wick project retains artwork/timing and supported output remains usable. Complete the tool recipe: manual edit, agent continuation where exposed, native undo where supported, restart, clean archive import and usable output; record any unsupported capability.

  **Needs:** Catalog. **Result / notes:** ____________________

<a id="signoff"></a>

## 36 · Final pass and issue handoff

**Where:** This guide and your result export

Passing this list is your manual evidence, not a claim that every command inside every upstream application has been exhaustively tested.

- [ ] **SIGNOFF-01** — Review all Untested, Failed and Blocked items, including every tool row; record a reason for every Not applicable.

  **Expected:** Nothing disappears from coverage merely because its prerequisite was unavailable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SIGNOFF-02** — For every failed item, record build/OS/Mood, exact steps, expected/actual, affected Crux/Task, screenshot/log and whether restart changes it.

  **Expected:** Each issue is reproducible and distinguishes data loss, broken behavior and design friction.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SIGNOFF-03** — For every native tool you intend to feature at launch, open each visible top-level menu/panel and test at least one action; list any controls left untried.

  **Expected:** The host integration pass does not conceal untested upstream functionality.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SIGNOFF-04** — Export tracker results after each session and before moving or clearing browser data. Reimport a copy and compare counts/notes.

  **Expected:** Your manual evidence is portable and recoverable.

  **Needs:** Local. **Result / notes:** ____________________

- [ ] **SIGNOFF-05** — After fixes, retest the original failures and repeat the core loop on the packaged build and actual production services.

  **Expected:** Source/local checks are distinguished from the release you will distribute.

  **Needs:** Local. **Result / notes:** ____________________

## Bug report to send back

```text
Check ID:
Build / OS / Mood / API environment:
Crux / Task / tool:
Steps to reproduce:
Expected:
Actual:
Frequency (always / sometimes / once):
Data lost or changed?:
Restart effect:
Screenshot / relevant log (no tokens or keys):
Impact (blocks work / workaround exists / design friction):
```

## Scope and source map

This checklist is grounded in the current router, creation catalog, pane configuration, Settings/Mood components and desktop journeys. It aims to cover every host surface and creation choice. It does not claim exhaustive coverage of every third-party editor command, all hardware combinations or every possible input. Use the tool menu sweep and untried-controls notes to extend those areas.

| Surface | Implementation reference | Guide section |
| --- | --- | --- |
| Gateway and website landing/subscribed | `app/src/App.tsx`, `app/src/pages/Gateway.tsx`, `Landing.tsx` | 01, 31 |
| Home, creation, collections, recovery | `app/src/pages/HomeGarden.tsx`, `app/src/components/garden/` | 02–05, 33 |
| All workspace panels | `app/src/components/workspace/paneConfig.ts` | 06–18 |
| Tending, alerts, schedules (Tending is a panel) | `app/src/components/workspace/TendingPane.tsx`, `app/src/pages/Tending.tsx`, `app/src/components/tending/`, `app/src/services/garden-schedules.ts` | 19–20 |
| Garden Collaboration (the Keeper), a panel | `app/src/components/workspace/ConsolePane.tsx`, `app/src/components/keeper/Console.tsx`, `app/src/ai/garden-tools.ts` | 21 |
| All Settings sections, a panel | `app/src/components/workspace/SettingsPane.tsx`, `app/src/components/settings/` | 22–25 |
| Five Mood tabs, the Mood panel | `app/src/components/workspace/MoodPane.tsx`, `app/src/components/mood/Mood.tsx`, `app/src/services/garden-mood.ts` | 26–29 |
| Workspace panels, pins, Navigator views | `app/src/stores/uiStore.ts`, `app/src/stores/pins.ts`, `app/src/components/layout/Navigation*.tsx` | 06 |
| The eleven v1 journeys | `app/electron/e2e/journeys/` | Throughout |
| Explore, public garden/Crux, plans, billing, not-found | `app/src/App.tsx`, corresponding `app/src/pages/` | 25, 30–32 |
| Every v1 creation choice | `NewCruxModal.tsx` OWN_TEMPLATES plus all 42 `*-crux/crux-tool.json` files | 35 |
| Behavior examples and regression history | `app/electron/e2e/*.spec.ts`, `app/docs/templates/`, `app/docs/tool-distribution/` | Throughout |

V2 (Daniel, 2026-09-26): shared/private Gardens of other people, a customizable public front page, timed appearance rules and Garden-level Tasks are excluded. The live production catalog, example publication/landing links, account activation, real billing/email, signing and release infrastructure remain explicit prerequisite/release checks. None of them are marked complete merely because the local desktop implementation exists.
