# OpenMosh source and notices

This fork preserves OpenMosh 0.7.3, upstream commit af2fa8001a97b8326e1e2e655b524f43180d07f4, from https://github.com/zivavu/OpenMosh. Its MIT license is in LICENSE.

The runtime is **not wholly MIT**. It includes Essentia.js 0.1.3 (AGPL-3.0, used for automatic BPM analysis), Mediabunny (MPL-2.0, media decoding and export), Svelte (MIT), Lucide (ISC and Feather MIT), and OFL/Apache-licensed fonts. Package versions and integrity hashes are pinned in package-lock.json. Runtime license texts are included in public/licenses and copied into runtime/licenses at build time. Font family notices are from a pinned Google Fonts revision recorded in public/licenses/font-sources.json; font binaries are unchanged from the pinned OpenMosh source.

Source locations:

- OpenMosh: https://github.com/zivavu/OpenMosh/tree/af2fa8001a97b8326e1e2e655b524f43180d07f4
- Essentia.js: https://github.com/MTG/essentia.js/tree/v0.1.3 (including its build instructions and Essentia submodule)
- Mediabunny: https://github.com/Vanilagy/mediabunny
- Svelte: https://github.com/sveltejs/svelte
- Lucide: https://github.com/lucide-icons/lucide

This integration is for local creation. No hosted edition, Explore runtime or public installer containing this fork has been released. Before distributing a runtime, assemble and verify the corresponding source/build package for the exact Essentia WASM binary and all applicable dependencies; links and license texts alone are not a completed corresponding-source delivery. Also resolve the existing shader-helper provenance review in docs/OPENMOSH-ALGORITHM-REVIEW.md in the Garden repository. The host's MIT license does not override dependencies' terms.

Garden changes are in src/garden, startup hydration, and small native editor flush/command hooks. All those sources accompany each new Crux. The original editor, shader algorithms and native exporters are retained.
