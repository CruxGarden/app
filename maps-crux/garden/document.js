// The Garden document of a map Crux: name, basemap, view, and the places, routes and areas as GeoJSON.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const STYLES = ['liberty', 'bright', 'positron', 'dark'];
const lngLat = (c) => Array.isArray(c) && c.length >= 2 && c.slice(0, 2).every((n) => typeof n === 'number' && Number.isFinite(n)) && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'maps' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid map project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'style', 'view', 'features', 'saved'].includes(k))) throw Error('Invalid map record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid map name.');
  if (!STYLES.includes(p.style)) throw Error('Invalid basemap.');
  if (!object(p.view) || !lngLat(p.view.center) || typeof p.view.zoom !== 'number' || p.view.zoom < 0 || p.view.zoom > 24) throw Error('Invalid map view.');
  if (!Array.isArray(p.features) || p.features.length > 5000) throw Error('Invalid feature list.');
  for (const f of p.features) {
    if (!object(f) || f.type !== 'Feature' || typeof f.id !== 'string' || !f.id || f.id.length > 64 || !object(f.geometry)) throw Error('Invalid map feature.');
    const g = f.geometry;
    if (g.type === 'Point') {
      if (!lngLat(g.coordinates)) throw Error('Invalid place.');
    } else if (g.type === 'LineString') {
      if (!Array.isArray(g.coordinates) || g.coordinates.length < 2 || g.coordinates.length > 10000 || !g.coordinates.every(lngLat)) throw Error('Invalid route.');
    } else if (g.type === 'Polygon') {
      if (!Array.isArray(g.coordinates) || !g.coordinates.length || !g.coordinates.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.length <= 10000 && ring.every(lngLat))) throw Error('Invalid area.');
    } else throw Error('Invalid map feature.');
    const props = f.properties ?? {};
    if (!object(props)) throw Error('Invalid map feature.');
    if (props.title !== undefined && (typeof props.title !== 'string' || props.title.length > 200)) throw Error('Invalid place title.');
    if (props.notes !== undefined && (typeof props.notes !== 'string' || props.notes.length > 2000)) throw Error('Invalid place notes.');
    if (props.color !== undefined && (typeof props.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(props.color))) throw Error('Invalid place colour.');
  }
  if (JSON.stringify(p.features).length > 8_000_000) throw Error('The map is too large (8 MB).');
}
