# Hextris in Crux Garden

Upstream: https://github.com/Hextris/hextris
Revision: 3f4847dc8fd7dab3d1c87e6324b9159d92fbd396 (master, 2022-02-08).
License: GPL-3.0; see LICENSE.md. Bundled vendor libraries keep their own headers (jQuery, Hammer.js, js-cookie, JSONfn, keypress, SweetAlert, RRSSB, Font Awesome in style/fa).
This independent adaptation is not an official Hextris product or endorsement.

This is the actual Hextris game, running from its source files with no build step (index.html is the entry). Crux Garden adds only `garden/bridge.js`, which loads Hextris's own scripts in their original order and, inside a Crux, restores the game's saved state and high scores (the two localStorage strings Hextris writes) from data/project.json and saves them back whenever the game writes them, and before the workspace closes. App Tools inspect the game (state, score, high scores, saved game) and reset progress.

Removed from index.html: the Google AdSense and Google Analytics scripts, the Google Fonts link (Exo 2; the stylesheet's fallback fonts apply), the CNAME and the analytics stub `a.js`. Everything else, including the share buttons, is upstream.

Remix it: the sources under js/, style/ and images/ are ordinary Artifacts; changing them changes the game on the next reload, and Growth keeps the history.
