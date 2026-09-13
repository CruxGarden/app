// The map editor: the actual MapLibre GL (rendering, OpenFreeMap tiles) and
// Terra Draw (drawing and editing places, routes and areas) in the smallest
// shell: a name, a basemap, drawing modes, a places list with title, notes and
// colour. The Crux keeps a name, the basemap, the view and the features as
// plain GeoJSON; inside a Crux the Garden bridge saves it, standalone the
// browser does.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { TerraDraw, TerraDrawSelectMode, TerraDrawPointMode, TerraDrawLineStringMode, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { createMap, emptyProject, featureTitle, fitTo, styleUrl, STYLES, type MapProject, type PlaceFeature } from './shared';
import { attach } from './garden/bridge';

const state: MapProject = emptyProject();
const meta = new Map<string, { title?: string; notes?: string; color?: string }>();
let map: MapLibreMap | null = null;
let draw: TerraDraw | null = null;
let selected: string | null = null;
let hydrating = true;
const listeners: (() => void)[] = [];
const notify = () => listeners.forEach((fn) => fn());
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $<HTMLInputElement>('map-name');
const styleSelect = $<HTMLSelectElement>('map-style');
const list = $<HTMLOListElement>('place-list');
const editor = $<HTMLElement>('place-editor');
const titleInput = $<HTMLInputElement>('place-title');
const notesInput = $<HTMLTextAreaElement>('place-notes');
const colorInput = $<HTMLInputElement>('place-color');

const geometryMode = (f: PlaceFeature) => (f.geometry.type === 'Point' ? 'point' : f.geometry.type === 'LineString' ? 'linestring' : 'polygon');
function snapshotFeatures(): PlaceFeature[] {
  if (!draw) return state.features;
  return draw.getSnapshot().map((f) => ({
    type: 'Feature',
    id: String(f.id),
    geometry: f.geometry as PlaceFeature['geometry'],
    properties: { mode: String(f.properties.mode), ...(meta.get(String(f.id)) ?? {}) },
  }));
}
function commit() {
  if (hydrating || !map) return;
  state.features = snapshotFeatures();
  state.view = { center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() };
  renderList();
  notify();
}
function renderList() {
  list.innerHTML = '';
  state.features.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = featureTitle(f, i);
    li.dataset.id = String(f.id);
    if (f.id === selected) li.classList.add('is-selected');
    li.onclick = () => {
      draw?.setMode('select');
      setPressed('select');
      draw?.selectFeature(String(f.id));
      select(String(f.id));
      if (map) fitTo(map, [f]);
    };
    list.append(li);
  });
}
function select(id: string | null) {
  selected = id;
  const f = state.features.find((x) => String(x.id) === id);
  editor.hidden = !f;
  if (f) {
    titleInput.value = f.properties?.title ?? '';
    notesInput.value = f.properties?.notes ?? '';
    colorInput.value = f.properties?.color ?? '#2f6f4e';
  }
  renderList();
}
function setPressed(mode: string) {
  document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}
function updateMeta(patch: { title?: string; notes?: string; color?: string }) {
  if (!selected) return;
  meta.set(selected, { ...(meta.get(selected) ?? {}), ...patch });
  commit();
  const f = state.features.find((x) => String(x.id) === selected);
  if (f && draw && patch.color) {
    // Terra Draw styles read our colour through the mode styles below; a redraw applies it.
    draw.removeFeatures([selected]);
    draw.addFeatures([{ ...f, properties: { mode: geometryMode(f), color: patch.color } } as never]);
    draw.selectFeature(selected);
  }
}
titleInput.oninput = () => updateMeta({ title: titleInput.value });
notesInput.oninput = () => updateMeta({ notes: notesInput.value });
colorInput.oninput = () => updateMeta({ color: colorInput.value });
nameInput.addEventListener('input', () => {
  state.name = nameInput.value;
  notify();
});
styleSelect.addEventListener('change', () => {
  state.style = styleSelect.value;
  map?.setStyle(styleUrl(state.style));
  notify();
});
document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]').forEach((b) => {
  b.onclick = () => {
    draw?.setMode(b.dataset.mode!);
    setPressed(b.dataset.mode!);
    if (b.dataset.mode !== 'select') select(null);
  };
});
$<HTMLButtonElement>('delete-feature').onclick = () => {
  if (!selected || !draw) return;
  draw.removeFeatures([selected]);
  meta.delete(selected);
  select(null);
  commit();
};

function mount() {
  if (draw) {
    draw.stop();
    draw = null;
  }
  if (map) map.remove();
  const container = $<HTMLElement>('map');
  map = createMap(container, state, (m) => {
    const color = (f: { properties: Record<string, unknown> }): `#${string}` =>
      typeof f.properties.color === 'string' && f.properties.color.startsWith('#') ? (f.properties.color as `#${string}`) : '#2f6f4e';
    const editable = { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } };
    draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
      modes: [
        new TerraDrawSelectMode({ flags: { point: { feature: { draggable: true } }, linestring: editable, polygon: editable } }),
        new TerraDrawPointMode({ styles: { pointColor: color, pointOutlineColor: () => '#ffffff', pointOutlineWidth: () => 2, pointWidth: () => 7 } }),
        new TerraDrawLineStringMode({ styles: { lineStringColor: color, lineStringWidth: () => 3 } }),
        new TerraDrawPolygonMode({ styles: { fillColor: color, outlineColor: color, fillOpacity: () => 0.25, outlineWidth: () => 3 } }),
      ],
    });
    draw.start();
    if (state.features.length) {
      state.features.forEach((f) => meta.set(String(f.id), { title: f.properties?.title, notes: f.properties?.notes, color: f.properties?.color }));
      draw.addFeatures(state.features.map((f) => ({ ...f, properties: { mode: geometryMode(f), color: f.properties?.color ?? '#2f6f4e' } })) as never);
    }
    draw.setMode('select');
    draw.on('change', (_ids, type) => {
      if (type === 'create' || type === 'update' || type === 'delete') commit();
    });
    draw.on('select', (id) => select(String(id)));
    draw.on('deselect', () => select(null));
    m.on('moveend', () => commit());
    hydrating = false;
    renderList();
  });
}

export const mapTool = {
  styles: STYLES,
  load(saved: Partial<MapProject> | null) {
    const base = emptyProject();
    state.name = saved?.name || base.name;
    state.style = saved?.style && STYLES.includes(saved.style) ? saved.style : base.style;
    state.view = saved?.view ?? base.view;
    state.features = saved?.features ?? [];
    nameInput.value = state.name;
    styleSelect.value = state.style;
    hydrating = true;
    mount();
  },
  snapshot: (): MapProject => JSON.parse(JSON.stringify({ ...state, features: snapshotFeatures() })),
  onChange(fn: () => void) {
    listeners.push(fn);
  },
  ready: () => !hydrating,
  setName(name: string) {
    state.name = name;
    nameInput.value = name;
    notify();
  },
  setStyle(style: string) {
    if (!STYLES.includes(style)) throw new Error('Choose a basemap: ' + STYLES.join(', ') + '.');
    styleSelect.value = style;
    styleSelect.dispatchEvent(new Event('change'));
  },
  addPlace(place: { title: string; lng: number; lat: number; notes?: string; color?: string }) {
    if (!draw) throw new Error('Wait for the map to open.');
    const id = crypto.randomUUID();
    meta.set(id, { title: place.title, notes: place.notes ?? '', color: place.color ?? '#2f6f4e' });
    draw.addFeatures([{ id, type: 'Feature', geometry: { type: 'Point', coordinates: [place.lng, place.lat] }, properties: { mode: 'point', color: place.color ?? '#2f6f4e' } }] as never);
    commit();
    return id;
  },
  removePlace(id: string) {
    if (!draw || !state.features.some((f) => String(f.id) === id)) return false;
    draw.removeFeatures([id]);
    meta.delete(id);
    if (selected === id) select(null);
    commit();
    return true;
  },
  fit() {
    if (map) fitTo(map, state.features);
    commit();
  },
  async image(): Promise<string> {
    if (!map) throw new Error('Wait for the map to open.');
    // Wait for the map to settle, but not for tiles that may never arrive (offline fallback).
    await new Promise<void>((resolve) => {
      if (map!.loaded()) return resolve();
      const t = setTimeout(resolve, 3000);
      map!.once('idle', () => {
        clearTimeout(t);
        resolve();
      });
    });
    map.triggerRepaint();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return map.getCanvas().toDataURL('image/png');
  },
};
(window as unknown as { mapTool: typeof mapTool }).mapTool = mapTool;

if (parent === window) {
  const KEY = 'maps.project';
  let saved: Partial<MapProject> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    saved = null;
  }
  mapTool.load(saved);
  mapTool.onChange(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(mapTool.snapshot()));
    } catch {
      /* storage unavailable: the session still works */
    }
  });
} else attach(mapTool);
