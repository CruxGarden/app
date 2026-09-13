/**
 * Garden bridge for web-synth (Crux Garden). Nothing here replaces upstream UI:
 * the composition web-synth already keeps in `localStorage` (src/persistance.ts)
 * is the document. Before the engine boots, the saved composition hydrates
 * `localStorage`; afterwards every state write marks the project dirty and a
 * confirmed save writes the whole composition back to `data/project.json`
 * through the host. Saves reuse upstream's own unload path (persist every view
 * context, then `save_all`) so what is saved is exactly what a page close would.
 */
import { validateProject } from './document.js';

type Engine = typeof import('src/engine');
const embedded = typeof parent !== 'undefined' && parent !== window;
let origin: string | undefined;
let expected: string | null = null;
let revision = 0;
let saved = 0;
let hydrating = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let tail: Promise<unknown> = Promise.resolve();
let commandTail: Promise<unknown> = Promise.resolve();
let engine: Engine | null = null;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let status: HTMLElement | null = null;
/** Preferences web-synth keeps in localStorage that are not part of a composition. */
const PREFERENCES = new Set(['latencyHint', 'globalVolume']);

const show = (text: string) => {
  if (status) status.textContent = text;
};
const send = (value: Record<string, unknown>) =>
  parent.postMessage(
    { type: 'crux:app', id: crypto.randomUUID(), ...value },
    origin && origin !== 'null' ? origin : '*'
  );
const call = (value: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your draft is still open.'));
    }, 60000);
    pending.set(id, {
      resolve: result => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: error => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    send({ ...value, id });
  });

function dirty() {
  if (hydrating) return;
  revision++;
  send({ op: 'dirty', dirty: true });
  show('Unsaved changes');
  clearTimeout(timer);
  timer = setTimeout(() => save().catch(() => {}), 1500);
}

/** The composition as web-synth defines it: every non-preference localStorage entry. */
function composition(): Record<string, string> {
  const state: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!PREFERENCES.has(key)) state[key] = localStorage.getItem(key)!;
  }
  return state;
}

/** Upstream's own unload persistence, so the saved composition equals a page close. */
async function persistAll() {
  if (!engine) return;
  const { getState } = await import('src/redux');
  const { commitForeignConnectables } = await import('src/redux/modules/vcmUtils');
  commitForeignConnectables(
    engine,
    getState().viewContextManager.patchNetwork.connectables.filter(({ node }) => !!node)
  );
  for (const vc of getState().viewContextManager.activeViewContexts) {
    try {
      engine.persist_vc_state(vc.uuid);
    } catch (err) {
      console.error(`Error persisting state for vcId=${vc.uuid}:`, err);
    }
  }
  engine.save_all();
}

function save(): Promise<void> {
  const operation = tail.then(async () => {
    clearTimeout(timer);
    if (hydrating) throw new Error('Wait for the saved composition to finish opening.');
    if (revision === saved) return;
    const saving = revision;
    try {
      show('Saving composition…');
      const wasHydrating = hydrating;
      hydrating = true; // persistAll writes localStorage; those writes are ours
      try {
        await persistAll();
      } finally {
        hydrating = wasHydrating;
      }
      const doc = {
        version: 1,
        app: 'web-synth',
        project: { state: composition(), saved: new Date().toISOString() },
      };
      validateProject(doc);
      const result = await call({
        op: 'write',
        path: 'project.json',
        expected,
        content: JSON.stringify(doc),
      });
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

async function inspect() {
  const { getState } = await import('src/redux');
  const { getGlobalBpm } = await import('src/globalMenu/globalTempo');
  const vcm = getState().viewContextManager;
  return {
    bpm: getGlobalBpm(),
    activeViewContextId: vcm.activeViewContextId,
    viewContexts: vcm.activeViewContexts.map((vc: any) => ({
      id: vc.uuid,
      name: vc.name,
      title: vc.title ?? null,
    })),
    connections: vcm.patchNetwork.connections.map(([from, to]: any) => ({
      from: { vcId: from.vcId, name: from.name },
      to: { vcId: to.vcId, name: to.name },
    })),
  };
}

async function command(value: any) {
  if (hydrating) throw new Error('Wait for the composition to open.');
  if (!engine) throw new Error('The synth engine is not running.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'set-tempo') {
    const bpm = Number(value.bpm);
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) throw new Error('Choose a tempo from 20 to 400 BPM.');
    const { setGlobalBpm } = await import('src/globalMenu/globalTempo');
    setGlobalBpm(bpm);
    dirty();
    await save();
    return inspect();
  }
  if (value.op === 'add-module') {
    const kind = String(value.kind ?? '');
    if (!/^[a-z_]{2,40}$/.test(kind)) throw new Error('Choose a module kind.');
    const title = value.title === undefined ? undefined : String(value.title);
    if (title !== undefined && (!title.trim() || title.length > 120)) throw new Error('Use a title up to 120 characters.');
    engine.create_view_context(kind, title ?? kind);
    dirty();
    await save();
    return inspect();
  }
  if (value.op === 'rename-module') {
    const id = String(value.id ?? '');
    const title = String(value.title ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id) || !title.trim() || title.length > 120)
      throw new Error('Inspect the composition and choose a module id and title.');
    engine.set_vc_title(id, title);
    dirty();
    await save();
    return inspect();
  }
  throw new Error('Unsupported web-synth operation.');
}

/** Before the engine boots: the saved composition becomes localStorage. */
export async function gardenHydrate(): Promise<void> {
  if (!embedded) return;
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}body{padding-bottom:34px}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  window.addEventListener('message', event => {
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
        error => send({ op: 'flushed', flushId: message.id, error: error.message })
      );
    } else if (message.type === 'crux:app:command') {
      const operation = commandTail.then(() => command(message.command));
      commandTail = operation.catch(() => {});
      operation.then(
        result => send({ op: 'tool-result', commandId: message.id, result }),
        error => send({ op: 'tool-result', commandId: message.id, error: error.message })
      );
    }
  });
  const buttons = bar.querySelectorAll('button');
  buttons[0].onclick = () => save().catch(() => {});
  buttons[1].onclick = () => {
    if (revision === saved || confirm('Discard the unsaved draft and reload the saved composition?'))
      location.reload();
  };
  const loaded = await call({ op: 'read', path: 'project.json' });
  expected = loaded.fingerprint;
  const doc = JSON.parse(loaded.content);
  validateProject(doc);
  // A fresh runtime profile carries nothing; a saved composition replaces whatever is there.
  const keep = new Map<string, string>();
  for (const key of PREFERENCES) {
    const value = localStorage.getItem(key);
    if (value !== null) keep.set(key, value);
  }
  localStorage.clear();
  for (const [key, value] of keep) localStorage.setItem(key, value);
  if (doc.project) for (const [key, value] of Object.entries(doc.project.state)) localStorage.setItem(key, value as string);
  (window as any).__gardenHasComposition = !!doc.project;
}

/** After the engine booted: state writes mark the project dirty; the first composition is saved. */
export function gardenAttach(booted: Engine): void {
  if (!embedded) return;
  engine = booted;
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === localStorage && !PREFERENCES.has(key)) dirty();
  };
  Storage.prototype.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === localStorage && !PREFERENCES.has(key)) dirty();
  };
  hydrating = false;
  show('Saved to Garden');
  if (!(window as any).__gardenHasComposition) dirty();
}
