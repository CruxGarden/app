# Whole-interface interpretations — visual studies

Question: can Crux Garden express a place, a cinematic studio, and a notebook
through different structures and materials, beyond recoloring one island?

Three throwaway desktop studies live on the existing public homepage in development:
`/?variant=warehouse`, `/?variant=sunset`, `/?variant=notebook`.
Run the existing public preview command in app:
`VITE_PUBLIC_SITE=1 npm run dev`.

A shared arrow switcher changes the variant in the URL; keyboard arrows work
outside text inputs. The notebook Read/Source toggle changes only sample content.
All projects, counts, graph nodes and states are illustrative. There are no real
mutations or model calls. Notes is a concept here, not a newly delivered Crux Type.
Production builds exclude the prototype import and its artwork.

- Warehouse: spatial markers, project register, industrial wayfinding, fluorescent
  light, concrete and transparent work surfaces.
- Sunset: cinematic horizon, warm typography, media covers and a Collaboration
  invitation in a separate lower workspace.
- Notebook: file tree, document tabs, linked prose, local graph and backlinks.

Awaiting Daniel's feedback. These studies represent possible members of a
10–15-interpretation collection, not competing candidates for one fixed theme.
Absorb approved design decisions into a properly implemented system, then remove
this throwaway module and switcher.

## Artwork provenance

Warehouse background: `prototype-warehouse.png` alongside this document, created
with the built-in image generation tool. Original:
`/Users/daniel/.codex/generated_images/01a08829-8cc5-7d43-bc0b-0aa2f22dfc4f/exec-16db8a31-5f62-46ef-b7b5-7876dea465f4.png`.
Sunset landscape, project covers and notebook graph are code-native CSS/SVG.
Screenshots are rendered browser captures, not generated UI mockups.

Exact image prompt:

> Create one widescreen 16:9 photorealistic architectural background image for an avant-garde creative software interface called Crux Garden. NO TEXT, NO UI, NO WATERMARK. An immense liminal empty industrial warehouse at night, raw gray concrete floor with soft reflections, very high ceiling with repeating exposed dark steel trusses and thin fluorescent tube lights receding deep into the distance, a few huge concrete columns, distant rectangular doorways glowing pale chartreuse. Very cinematic, uncanny but inviting, high-end architectural photography on 35mm film with subtle grain. Palette charcoal, muted olive gray, pale sickly lime fluorescent light. Wide angle straight level view into the cavernous space. Foreground lower half mostly empty dark concrete floor for UI overlays; left third dark uncluttered negative space for giant white typography. Main architectural light and vanishing point in the upper right center. No furniture, no plants, no people, no floating island, no cartoon or low-poly rendering. It should feel like discovering a vast abandoned installation space waiting for your ideas.

Captures: `/private/tmp/crux-interpretation-warehouse.png`,
`/private/tmp/crux-interpretation-sunset.png`,
`/private/tmp/crux-interpretation-notebook.png`.
