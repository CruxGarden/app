# MapLibre GL + Terra Draw in Crux Garden

Upstreams: https://github.com/maplibre/maplibre-gl-js (maplibre-gl 6.9.0, BSD-3-Clause), https://github.com/JamesLMilner/terra-draw (terra-draw 1.33.0 and terra-draw-maplibre-gl-adapter 1.4.1, MIT). Tiles and styles from OpenFreeMap (https://openfreemap.org, MIT hosting project; map data © OpenStreetMap contributors, styles © OpenMapTiles; no key, no registration; attribution shown by MapLibre). This independent adaptation is not a product of any of them.

geojson.io was the planned app (V1-GAPS-PLAN.md §2.5) but it is built on Mapbox GL 3 (token, proprietary license) with deck.gl, so the fallback the plan named applies: the EventCalendar rule, the smallest shell around the actual components. `index.html` + `src/main.ts`: a name, a basemap (Liberty, Bright, Positron, Dark), drawing modes (Select, Add place, Draw route, Draw area, Remove) and a places list with title, notes and colour for the selected feature. Terra Draw does the drawing and editing on the MapLibre map; the Crux keeps name, basemap, view and features as GeoJSON in `data/project.json` (`garden/document.js` validates; the host runs the same check). `npm run build:garden` bundles editor and viewer into `runtime/`.

- Offline: when the OpenFreeMap style cannot load (no network, blocked host) the map falls back to a plain ground and still draws its places.
- Outputs: the bar's "Save image to Cruxspace" writes the map's picture (PNG) into `exports/` (App Tool `save_map_image`).
- App Tools: `inspect_map`, `set_map_name`, `set_map_style`, `add_map_place` (title, lng, lat, notes, colour), `remove_map_place`, `fit_map`, `save_map_image`.
- Public edition (`npm run build` → `dist/`, published through Share selected content): the read-only map with its places listed and the saved data baked in; visitors need the same public tiles.

Build: `npm install`, `npm run build:garden`, `npm run build`; `npm run check`; `npm run test:garden`.
