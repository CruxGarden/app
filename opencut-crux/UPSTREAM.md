# OpenCut Classic in Crux Garden

Upstream: https://github.com/opencut-app/opencut-classic
Revision: cf5e79e919144200294fb9fed22a222592a0aeea.
Web package version: 0.1.0; native opencut-wasm package: 0.2.10, pinned in package-lock.json.
Upstream is archived and unmaintained while a rewrite proceeds in OpenCut-app/OpenCut.
This is an independent Garden adaptation, not an official product or endorsement.

Original editor license: MIT (LICENSE). Runtime dependency licenses/notices are in
runtime/THIRD_PARTY_NOTICES.txt. The native compositor and editing model are retained.
The included Rust source is reference source; npm builds use the pinned published
opencut-wasm package. Rebuilding a modified Rust engine needs its separate toolchain.

The actual asset, timeline, properties, preview, project-library and export interfaces
remain. A browser entry replaces Next routing/server setup. Native project records,
original media and preferences are captured through Garden's confirmed-save bridge;
IndexedDB/OPFS adapters and local preferences are isolated runtime state. Original
file bytes have separate fingerprinted Artifacts. Complete Crux archives carry
source, runtime, documents and original media; browser cache is not their home.
Native Undo and live playback are session state. App Tools inspect the active project,
name it, and update an existing text element using native undoable commands.

Local scope: import images/audio/video, native timeline edits, text using installed
system fonts, local effects and canvas settings, preview and native WebM/MP4 export
where browser codecs are available. Originals are limited to 128 MB each by Garden's
current native-asset boundary. Fonts can differ between devices when relying on
installed fonts. Automatic transcription/model downloads, online sound/sticker
catalogues, hosted feedback, cloud accounts and whole-editor website publication
are excluded. Future font embedding, large-media handling and online services need
explicit implementation and tests. Export does not imply shared watch sessions.

Build: Node 22.22+, npm ci --ignore-scripts && npm run build.
The source lockfile and .npmrc retain the reviewed native dependency resolution.
Debug maps are omitted from Template Crux payloads; rebuilding regenerates them.

Verification sources: garden/model.test.mjs and garden/save-manager.test.mjs check
record validation and save failure/concurrency. garden/local-provider.test.mjs in
the integration repository exercises native editing, library navigation, scoped
agent operations, original-byte reuse, conflicts and draft retention. The desktop
Playwright journey exercises native video download, restart and independent
complete Crux import; FFmpeg decodes the output to check clips, titles and audio.
Current acceptance evidence and supported limitations are recorded in the root
OPENCUT-INTEGRATION-ASSESSMENT.md and WORK-CHECKLIST.md.
