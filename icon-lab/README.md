# The mark, in plasma

A creative-coding pass at the Crux Garden icon — the ring and cross from
`public/favicon.svg` — rendered as the same material the landing page panels
are made of: a green field behind, a dark tint over it, refraction at the
edges, an iridescent rim.

Open `index.html` directly; there is no build step.

    open index.html                 # drifts, fills the window
    open 'index.html?size=1024'     # one square frame, frozen, for export
    open 'index.html?size=512&t=3'  # a different moment of the drift

Press `s` to save a PNG of whatever is on screen, or call `savePng()` from the
console.

## Why it is its own shader

plasma-ui draws rounded boxes. A ring is not one, and neither is a cross with
round caps, so this reimplements the material rather than registering shapes
with the library: the same field, palette and edge treatment, over an SDF that
can express the mark.

The proportions are measured off `electron/build/icon.png`, not taken from
`favicon.svg` — the desktop icon is not drawn to the same ratios, and going
from the SVG gave a ring too large and a plus too small. In units where the
ring's outer radius is 10:

| | |
|---|---|
| ring centreline | 8.99 |
| stroke half-thickness | 1.01 |
| plus half-length | 4.99 |
| mark across the frame | 67.8% |

One stroke weight throughout, which is what makes it read as a single mark.

The field is procedural, so frost supersamples it with a spiral of taps
instead of needing the library's blur chain.

`exports/` holds 1024, 512 and 128px renders. It survives 128 legibly, which
is the size that decides whether an icon works.
