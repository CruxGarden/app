// Garden bridge for the map tool (Crux Garden): data/project.json holds the
// name, the basemap, the view and the features as GeoJSON; every change marks
// the project dirty and a confirmed save writes it; the map's picture can go
// to the Crux's outputs; App Tools drive the same operations.
import type { mapTool as MapTool } from '../main';
type MapTool = typeof MapTool;
import { validateProject } from '../../garden/document.js';

let origin: string | undefined;
let expected: string | null = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let status: HTMLElement | null = null;
let tail: Promise<unknown> = Promise.resolve();
let commandTail: Promise<unknown> = Promise.resolve();
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const show = (text: string) => {
  if (status) status.textContent = text;
};
const send = (value: Record<string, unknown>) =>
  parent.postMessage({ type: 'crux:app', id: crypto.randomUUID(), ...value }, origin && origin !== 'null' ? origin : '*');
const call = (value: Record<string, unknown>) =>
  new Promise<unknown>((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your map is still open.'));
    }, 60000);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(timeout);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timeout);
        reject(e);
      },
    });
    send({ ...value, id });
  });

export function attach(tool: MapTool) {
  function dirty() {
    if (hydrating) return;
    revision++;
    send({ op: 'dirty', dirty: true });
    show('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), 1200);
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      if (hydrating) throw new Error('Wait for the saved map to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving map…');
        const doc = { version: 1, app: 'maps', project: { ...tool.snapshot(), saved: new Date().toISOString() } };
        validateProject(doc);
        const result = (await call({ op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) })) as { fingerprint: string };
        expected = result.fingerprint;
        saved = saving;
        send({ op: 'dirty', dirty: revision !== saved });
        show(revision === saved ? 'Saved to Garden' : 'Unsaved changes');
      } catch (error) {
        show((error as Error).message);
        throw error;
      }
    });
    tail = operation.catch(() => {});
    return operation;
  }
  function inspect() {
    const s = tool.snapshot();
    return {
      name: s.name,
      style: s.style,
      styles: tool.styles,
      view: s.view,
      places: s.features.map((f, i) => ({
        id: String(f.id),
        kind: f.geometry.type === 'Point' ? 'place' : f.geometry.type === 'LineString' ? 'route' : 'area',
        title: f.properties?.title || null,
        notes: f.properties?.notes || '',
        color: f.properties?.color || '#2f6f4e',
        coordinates: f.geometry.type === 'Point' ? f.geometry.coordinates : undefined,
        points: f.geometry.type === 'Point' ? 1 : f.geometry.type === 'LineString' ? f.geometry.coordinates.length : f.geometry.coordinates[0]?.length,
        index: i,
      })),
    };
  }
  async function saveImage(label: string) {
    const name = label.trim() || tool.snapshot().name;
    if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
    await save();
    show('Rendering map…');
    const output = (await call({ op: 'save-output', label: name, content: await tool.image() })) as Record<string, unknown>;
    show(`Saved ${name} as an image output.`);
    setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
    return output;
  }
  async function command(value: Record<string, unknown>) {
    if (hydrating) throw new Error('Wait for the map to open.');
    if (value.op === 'inspect') return inspect();
    if (value.op === 'save-image') return saveImage(String(value.label ?? ''));
    if (value.op === 'set-name') {
      const name = String(value.name ?? '').trim();
      if (!name || name.length > 200) throw new Error('Use a map name up to 200 characters.');
      tool.setName(name);
    } else if (value.op === 'set-style') tool.setStyle(String(value.style ?? ''));
    else if (value.op === 'add-place') {
      const title = String(value.title ?? '').trim();
      if (!title || title.length > 200) throw new Error('Use a place title up to 200 characters.');
      const lng = Number(value.lng), lat = Number(value.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new Error('Give lng (-180..180) and lat (-90..90).');
      const notes = value.notes === undefined ? '' : String(value.notes);
      if (notes.length > 2000) throw new Error('Use notes up to 2000 characters.');
      const color = value.color === undefined ? undefined : String(value.color);
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Use a colour like #2f6f4e.');
      tool.addPlace({ title, lng, lat, notes, color });
    } else if (value.op === 'remove-place') {
      if (!tool.removePlace(String(value.id ?? ''))) throw new Error('No place with that id.');
    } else if (value.op === 'fit') tool.fit();
    else throw new Error('Unsupported map operation.');
    await save();
    return inspect();
  }
  window.addEventListener('message', (event) => {
    if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:')) return;
    origin = event.origin;
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error));
      else request?.resolve(message.result);
    } else if (message.type === 'crux:app:flush') {
      (async () => {
        do {
          await save();
        } while (revision !== saved);
      })().then(
        () => send({ op: 'flushed', flushId: message.id }),
        (error) => send({ op: 'flushed', flushId: message.id, error: (error as Error).message }),
      );
    } else if (message.type === 'crux:app:command') {
      const operation = commandTail.then(() => command(message.command));
      commandTail = operation.catch(() => {});
      operation.then(
        (result) => send({ op: 'tool-result', commandId: message.id, result }),
        (error) => send({ op: 'tool-result', commandId: message.id, error: (error as Error).message }),
      );
    }
  });
  async function boot() {
    const bar = document.createElement('div');
    bar.id = 'garden-project';
    bar.innerHTML =
      '<span role="status">Opening Garden project…</span>' +
      '<label>Output name <input id="output-name" maxlength="120" placeholder="Map" /></label>' +
      '<button type="button" id="save-image">Save image to Cruxspace</button>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}body{padding-bottom:34px;box-sizing:border-box}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    (bar.querySelector('#save-image') as HTMLButtonElement).onclick = () =>
      saveImage((bar.querySelector('#output-name') as HTMLInputElement).value).catch((e) => show((e as Error).message));
    try {
      const loaded = (await call({ op: 'read', path: 'project.json' })) as { content: string; fingerprint: string };
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      tool.load(doc.project);
      tool.onChange(() => dirty());
      const wait = () =>
        tool.ready()
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const t = setInterval(() => {
                if (tool.ready()) {
                  clearInterval(t);
                  resolve();
                }
              }, 100);
            });
      await wait();
      hydrating = false;
      show('Saved to Garden');
      if (!doc.project) {
        revision++;
        save().catch(() => {});
      }
    } catch (error) {
      show((error as Error).message);
      throw error;
    }
  }
  void boot();
}
