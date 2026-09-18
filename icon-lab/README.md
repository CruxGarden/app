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

The proportions come from the favicon: a 24 box, a circle at r=10, bars 8
long, and `stroke-width: 1.5` — which is a half-thickness of 0.75, the thing
that made the first attempt's ring twice as heavy as it should have been.

The field is procedural, so frost supersamples it with a spiral of taps
instead of needing the library's blur chain.

`exports/` holds 1024, 512 and 128px renders. It survives 128 legibly, which
is the size that decides whether an icon works.
