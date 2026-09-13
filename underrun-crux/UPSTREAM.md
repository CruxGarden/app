# Underrun in Crux Garden

Upstream: https://github.com/phoboslab/underrun (Dominic Szablewski, js13kGames 2018)
Revision: f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62 (master, 2018-10-12).
License: MIT; see LICENSE.md.
This independent adaptation is not an official Underrun product or endorsement.

This is the actual Underrun: a WebGL twin-stick shooter with music synthesized by Sonant-X. The Crux runs it from source: index.html is upstream's index-debug.html, which loads the files under source/ directly, so edits to the game are live on reload with no build. The size-optimized build (build.sh, shrinkit.js, uglify-es in package.json) is included for anyone who wants the 13 KB version. Crux Garden adds nothing to the page: the game keeps no saved state, so there is no bridge; the Crux's value is the playable game and its editable source, with Growth keeping the history.

Click the canvas to start (the game asks for a click to unlock audio), WASD moves, the mouse aims and shoots.
