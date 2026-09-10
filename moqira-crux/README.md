# Moqira in Crux Garden

Adapted from https://github.com/downcastsystems/moqira at 0fbe079a9c4d93fd00bd35a7a8a5814afa9d3111 (Moqira 1.0.3). Upstream authors retain their rights; no new license is asserted for their source.

Design wireframes in the Workshop. Autosave writes `mockups/project.json` through the scoped Crux bridge, creating Growth checkpoints. Import a .moq file to replace this project's designs; download a copy for use in Moqira. All source files are editable Artifacts. Use a Task for changing the app without disturbing newer project data on Main.

Choose Garden Mood or App appearance for the editor controls. Canvas colors and typography belong to the design and remain independent.

Only wireframes checked “Include in public edition” enter the production build. Publishing strips private Collaboration and preview thumbnails. The public viewer supports wireframe links and interaction; it cannot save changes back to your project. Links to excluded wireframes are removed. Avoid putting private content in src/ or public/.

`npm run dev`, `npm run check`, `npm test`, `npm run build`.

The adapter retains Moqira's portable single-file format, including embedded images. Each changed project revision stores a new JSON blob; unchanged app source blobs are shared. Saves currently accept up to 8,000,000 characters. This is suitable for wireframes, not a promise of unlimited image-heavy design documents. Large-image extraction and full standalone Moqira synchronization are follow-ons.
