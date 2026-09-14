# PPTist in Crux Garden

Upstream: https://github.com/pipipi-pikachu/PPTist
Revision: e4912589ffdbec389fcc1bf25a85852dfe3040a8 (master, 2026-08-16), version 2.0.0.
License: AGPL-3.0; see LICENSE. Dependency notices: runtime/THIRD_PARTY_NOTICES.txt.
This independent adaptation is not an official PPTist product or endorsement.

This is the actual PPTist presentation editor (Vue 3), built with its own Vite configuration into runtime/. Crux Garden adds only what sits behind it:

- `src/garden/bridge.ts`: the presentation PPTist keeps in its Pinia store, in the exact shape of PPTist's own JSON export (title, width, height, theme, slides), is the Garden document (data/project.json). Before the editor shows, the saved presentation goes into the store; every store change marks the project dirty and a confirmed Garden save writes it back. Pictures, video and audio the person inserts (data URLs) become fingerprinted binary Artifacts under data/assets and come back as object URLs, so the document stays small and media is shared by fingerprint.
- `garden/document.js`: validation of that document and its media references.
- App Tools: inspect the presentation (title, slides with their text, size, theme colours), set the title, add a slide with optional text. Tools never start the presentation.
- `src/App.vue`: one call into the bridge on mount; the upstream demo deck still loads when the page runs outside a Crux. `vite.config.ts`: the output folder from the environment and source maps for the notices.

The interface is upstream's, in Chinese (PPTist has no i18n). Online features stay online: AI PPT generation, the image search and the template gallery's remote parts talk to PPTist's hosted server (`https://server.pptist.cn`) and fail clearly offline; the bundled templates under public/mocks are local. Fonts are bundled (42 MB of woff2 under src/assets/fonts). PPTist's undo history lives in a per-session IndexedDB and is not part of the document.

Rebuild: `npm ci --ignore-scripts && npm run build:garden` (Node 22) rebuilds runtime/.

## Tool-depth adaptation, 2026-09-14

- `garden/commands.js` and its declaration: bounded command validation shared with the host; native rich-text replacement retains unrelated markup. `src/garden/bridge.ts` adds element inspection, text creation/revision, arrangement, slide ordering/removal and native PPTX output using the common command lifecycle.
- `garden/shared/command-session.{js,d.ts}` are generated from Crux Garden's `embedded-apps/shared/`, copied before the host's build. They travel with the Crux; standalone builds need no files outside this fork. Do not edit generated copies in the integration repository.
- `src/hooks/useHistorySnapshot.ts`: one native history queue and explicit checkpoint hook, so pending manual edits and agent edits have separate Undo steps. `src/store/snapshot.ts`: identical checkpoints neither add steps nor destroy Redo. `src/App.vue`: await history initialization. On upstream updates verify typing → agent edit → Undo/Redo and rapid native edits; upstream history is still the document's per-session history, not Growth. Title changes remain outside upstream slide history.
- `src/hooks/useExport.ts`: optional Blob output sink on the existing PPTX exporter. The manual download path remains; the Garden output button and tool use the sink. On upstream updates check both download and Garden output, including embedded media and editable text.

These upstream-file hooks increase update maintenance. Keep them explicit and review/test them after each version update. The event-deck workflow is verified in electron/e2e/pptist-depth.spec.ts, alongside the existing media/restart/import journey. It does not certify full command parity.

- `src/views/components/element/ProsemirrorEditor.vue`: registers its debounced input with `src/garden/editor-buffers.ts` and flushes on unmount; Garden capture flushes those buffers before claiming a save. This preserves focus during autosave. `src/views/components/element/TextElement/index.vue`: resolves the text element's owning slide when flushing, so switching slides cannot redirect a delayed edit. Upgrade checks include immediate Save after typing, autosave while focused, slide switching and saving after clean import. The clean-import journey reproduced stale confirmed content before this hook.
