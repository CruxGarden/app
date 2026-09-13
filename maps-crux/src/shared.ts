// What the editor and the public edition share: the document shape, the
// basemaps (OpenFreeMap: free vector tiles from OpenStreetMap data, no key,
// attribution added by MapLibre) and an offline fallback style so a map still
// draws its own places when the tiles cannot be reached.
import { Map as MapLibreMap, NavigationControl, LngLatBounds, type GeoJSONSource, type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl';

export type PlaceFeature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon, { title?: string; notes?: string; color?: string; mode?: string }>;
export interface MapProject {
  name: string;
  style: string;
  view: { center: [number, number]; zoom: number };
  features: PlaceFeature[];
}
export const STYLES = ['liberty', 'bright', 'positron', 'dark'];
export const styleUrl = (style: string) => `https://tiles.openfreemap.org/styles/${STYLES.includes(style) ? style : 'liberty'}`;
export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ebe6' } }],
};
export const emptyProject = (): MapProject => ({
  name: 'Map',
  style: 'liberty',
  view: { center: [-0.1276, 51.5072], zoom: 11 },
  features: [],
});
export const featureTitle = (f: PlaceFeature, index: number) =>
  f.properties?.title || (f.geometry.type === 'Point' ? `Place ${index + 1}` : f.geometry.type === 'LineString' ? `Route ${index + 1}` : `Area ${index + 1}`);

/** A map with the chosen basemap, falling back to the offline style when the tiles do not load. */
export function createMap(container: HTMLElement, project: MapProject, onReady: (map: MapLibreMap, offline: boolean) => void) {
  const map = new MapLibreMap({
    container,
    style: styleUrl(project.style),
    center: project.view.center,
    zoom: project.view.zoom,
    attributionControl: {},
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.addControl(new NavigationControl(), 'top-left');
  let ready = false;
  let fallback = false;
  const done = (offline: boolean) => {
    if (ready) return;
    ready = true;
    onReady(map, offline);
  };
  map.once('load', () => done(fallback));
  map.on('error', (event) => {
    // The style itself failed (offline, blocked): draw the places on a plain ground instead.
    if (ready || fallback || !/style|Failed to fetch|NetworkError/i.test(String(event.error?.message ?? event.error))) return;
    fallback = true;
    map.setStyle(OFFLINE_STYLE);
    map.once('load', () => done(true));
  });
  setTimeout(() => {
    if (!ready && !fallback) {
      fallback = true;
      map.setStyle(OFFLINE_STYLE);
      map.once('load', () => done(true));
    }
  }, 8000);
  return map;
}

/** The saved features as a plain layer set (the edition, and the editor's preview of colours). */
export function addFeatureLayers(map: MapLibreMap, features: PlaceFeature[]) {
  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
  if (map.getSource('places')) (map.getSource('places') as GeoJSONSource).setData(data);
  else map.addSource('places', { type: 'geojson', data });
  const color: ExpressionSpecification = ['coalesce', ['get', 'color'], '#2f6f4e'];
  if (!map.getLayer('places-fill'))
    map.addLayer({ id: 'places-fill', type: 'fill', source: 'places', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.25 } });
  if (!map.getLayer('places-line'))
    map.addLayer({ id: 'places-line', type: 'line', source: 'places', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': color, 'line-width': 3 } });
  if (!map.getLayer('places-point'))
    map.addLayer({ id: 'places-point', type: 'circle', source: 'places', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
}
export function fitTo(map: MapLibreMap, features: PlaceFeature[]) {
  if (!features.length) return;
  const bounds = new LngLatBounds();
  const extend = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') bounds.extend(coords as [number, number]);
    else if (Array.isArray(coords)) coords.forEach(extend);
  };
  for (const f of features) extend(f.geometry.coordinates);
  map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
}
