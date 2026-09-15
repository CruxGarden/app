/**
 * Garden side of Moqira (Crux Garden). The native app has a narrow tool hook; it
 * believes it runs inside Tauri because src/garden/tauri-*.ts stand in for the
 * Tauri modules (see vite.config.ts). This file is what those stand-ins talk
 * to: the Crux's one project file (mockups/project.json) read before the app
 * starts and written on the app's own Save, the publication choices
 * (mockups/publish.json), the save state the app shows in its title bar
 * mirrored to the host, the host's flush, the Mood appearance protocol, and a
 * bottom bar with Save, the public-edition choices and the appearance choice.
 * In a public edition (the published build) there is no host: the app opens
 * the edition's project read-only and starts in interactive mode.
 */
import type { MockupProject } from '../types';
import { emit } from './tauri-event';
import { createCommandSession } from './shared/command-session.js';
import { loadProjectImage } from './shared/project-image.js';
import { createMoqiraCommands } from './commands';
import { readNativeMoqira, nativeStateToken, actNative, settleNative } from './native-tools';

type Publication = { title: string; wireframes: string[] };
declare global {
  interface Window {
    __MOQIRA_EDITION__?: MockupProject;
    __TAURI_INTERNALS__?: unknown;
  }
}
export const edition: MockupProject | null = window.__MOQIRA_EDITION__ ?? null;
export const embedded = !edition && window.parent !== window;
const PROJECT_PATH = 'mockups/project.json';

let origin: string | undefined;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let project: MockupProject | null = edition;
let projectFingerprint: string | null = null;
let publication: Publication = { title: '', wireframes: [] };
let publicationFingerprint: string | null = null;
let conflict = '';
let saving: Promise<void> | null = null;
let dirtyShown = false;
let bar: HTMLElement | null = null;
let status: HTMLElement | null = null;
let alertBox: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let publicationTimer: ReturnType<typeof setTimeout> | undefined;
let publicationTail: Promise<unknown> = Promise.resolve();

const send = (value: Record<string, unknown>) =>
  window.parent.postMessage(
    { type: 'crux:app', id: crypto.randomUUID(), ...value },
    origin && origin !== 'null' ? origin : '*',
  );
const call = (value: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not confirm the save. Your draft is still open.'));
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

function validate(value: unknown): MockupProject {
  const p = value as MockupProject;
  if (
    !p ||
    typeof p !== 'object' ||
    p.schemaVersion !== 1 ||
    typeof p.name !== 'string' ||
    !p.appearance ||
    !Array.isArray(p.wireframes) ||
    !p.wireframes.length ||
    p.wireframes.some(
      (f) =>
        !f ||
        typeof f.id !== 'string' ||
        typeof f.name !== 'string' ||
        !Array.isArray(f.nodes) ||
        f.nodes.some((n) => !n || typeof n.id !== 'string' || typeof n.kind !== 'string'),
    )
  )
    throw new Error('Choose a Moqira project (schema version 1).');
  if (new Set(p.wireframes.map((f) => f.id)).size !== p.wireframes.length)
    throw new Error('Wireframe IDs must be unique.');
  return p;
}

/** Read the Crux's project and publication choices; a fresh Crux has neither. */
async function load() {
  const [doc, manifest] = await Promise.all([
    call({ op: 'read', path: 'project.json' }),
    call({ op: 'read', path: 'publish.json' }),
  ]);
  projectFingerprint = doc.fingerprint;
  const parsed = JSON.parse(doc.content);
  project =
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray(parsed.wireframes) &&
    parsed.wireframes.length
      ? validate(parsed)
      : null;
  publicationFingerprint = manifest.fingerprint;
  const config = JSON.parse(manifest.content);
  publication = {
    title: typeof config?.title === 'string' ? config.title : '',
    wireframes: Array.isArray(config?.wireframes)
      ? config.wireframes.filter((id: unknown) => typeof id === 'string')
      : [],
  };
}
export const ready: Promise<void> = embedded ? load() : Promise.resolve();

export const garden = {
  hasProject: () => project !== null,
  project(): MockupProject {
    if (!project) throw new Error('This Crux has no saved project yet.');
    return JSON.parse(JSON.stringify(project));
  },
  /** The app's own Save: the whole project to mockups/project.json, refused when the file changed elsewhere. */
  async save(next: MockupProject): Promise<void> {
    if (edition) return; // a public edition keeps nothing
    if (!embedded) throw new Error('Open this app inside Crux Garden to save.');
    if (saving) await saving;
    const content = JSON.stringify(validate(next), null, 2);
    const operation = (async () => {
      show('Saving…');
      try {
        const result = await call({
          op: 'write',
          path: 'project.json',
          expected: projectFingerprint,
          content,
        });
        projectFingerprint = result.fingerprint;
        project = JSON.parse(content);
        conflict = '';
        renderPanel();
        show('Saved');
      } catch (error) {
        conflict = (error as Error).message;
        show(conflict);
        throw error;
      }
    })();
    saving = operation;
    try {
      await operation;
    } finally {
      if (saving === operation) saving = null;
    }
  },
  publication: () => ({ ...publication, wireframes: [...publication.wireframes] }),
};

function show(text: string) {
  if (!status) return;
  if (conflict) {
    status.textContent = '';
    if (alertBox) {
      alertBox.textContent = text;
      alertBox.hidden = false;
    }
    bar?.querySelector<HTMLButtonElement>('[data-reload]')?.removeAttribute('hidden');
    return;
  }
  if (alertBox) alertBox.hidden = true;
  bar?.querySelector<HTMLButtonElement>('[data-reload]')?.setAttribute('hidden', '');
  status.textContent = text;
}

/** The app shows its save state in its own title bar; mirror it to the host and the bar. */
function watchSaveState() {
  const read = () => {
    const el = document.querySelector<HTMLElement>('.save-state');
    if (!el) return;
    const dirty =
      el.classList.contains('is-dirty') || el.getAttribute('aria-label') === 'Not saved';
    if (dirty !== dirtyShown) {
      dirtyShown = dirty;
      send({ op: 'dirty', dirty });
    }
    const next = dirty ? 'Unsaved changes' : 'Saved';
    if (!saving && !conflict && status?.textContent !== next) show(next);
  };
  // Only the app's own tree: the Garden bar and panel change with every status update.
  new MutationObserver((records) => {
    if (
      records.some((r) => !(r.target as Element).closest?.('#garden-project, #garden-publication'))
    )
      read();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-label'],
  });
  read();
}

/** Use native Save and await the host acknowledgement; newer manual work stays dirty. */
async function flush(): Promise<void> {
  await settleNative();
  if (saving) await saving;
  if (conflict) throw Error(conflict);
  const native = readNativeMoqira();
  if (!native.dirty && JSON.stringify(native.project) === JSON.stringify(project)) return;
  if (!(await native.save())) throw Error('Moqira did not save the project.');
  await settleNative();
  if (readNativeMoqira().dirty)
    throw Error('Moqira changed while saving. Your newer draft remains open; inspect again.');
}

const commands = createMoqiraCommands({
  read: readNativeMoqira,
  stateToken: nativeStateToken,
  act: actNative,
  async loadImage(path) {
    const loaded = await loadProjectImage(path, new URL('../', location.href).href);
    try {
      const blob = await (await fetch(loaded.image.src)).blob();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error('Could not read the image Artifact.'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
      return {
        imageDataUrl,
        imageMimeType: blob.type,
        imageNaturalWidth: loaded.image.naturalWidth,
        imageNaturalHeight: loaded.image.naturalHeight,
      };
    } finally {
      loaded.release();
    }
  },
  saveOutput: (label, bytes) =>
    call({ op: 'save-output', label, mimeType: 'application/x-moqira+json', bytes }),
});
const commandSession = createCommandSession({
  settle: settleNative,
  prepare: commands.prepare,
  save: flush,
});
let toolTail: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = toolTail.then(operation);
  toolTail = next.catch(() => {});
  return next;
}

function savePublication() {
  clearTimeout(publicationTimer);
  publicationTimer = setTimeout(() => {
    const operation = publicationTail.then(async () => {
      const content = JSON.stringify(publication, null, 2);
      try {
        const result = await call({
          op: 'write',
          path: 'publish.json',
          expected: publicationFingerprint,
          content,
        });
        publicationFingerprint = result.fingerprint;
        if (!conflict && !saving) show('Saved');
      } catch (error) {
        conflict = (error as Error).message;
        show(conflict);
      }
    });
    publicationTail = operation.catch(() => {});
  }, 300);
}

function renderPanel() {
  if (!panel) return;
  const frames = project?.wireframes ?? [];
  const chosen = new Set(publication.wireframes);
  panel.innerHTML = '';
  const title = document.createElement('label');
  title.textContent = 'Public edition title ';
  const input = document.createElement('input');
  input.value = publication.title;
  input.placeholder = 'Wireframes';
  input.maxLength = 200;
  input.oninput = () => {
    publication.title = input.value;
    savePublication();
  };
  title.append(input);
  panel.append(title);
  if (!frames.length) {
    const note = document.createElement('span');
    note.textContent = 'Save the project to choose wireframes.';
    panel.append(note);
  }
  for (const frame of frames) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.has(frame.id);
    box.setAttribute('aria-label', 'Include in public edition');
    box.dataset.wireframe = frame.id;
    box.onchange = () => {
      publication.wireframes = frames
        .filter((f) => (f.id === frame.id ? box.checked : chosen.has(f.id)))
        .map((f) => f.id);
      if (box.checked) chosen.add(frame.id);
      else chosen.delete(frame.id);
      savePublication();
    };
    label.append(box, document.createTextNode(' ' + frame.name));
    panel.append(label);
  }
}

/* Mood appearance (ADR 0029): the host offers its resolved tokens and font bytes; Moqira's chrome
   takes the surfaces, text and borders. Accent and typography stay the design's own: upstream shares
   those variables between its chrome and the canvas, so a Mood must not touch them. */
const APPEARANCE: Record<string, string[]> = {
  bg: ['--bg'],
  panel: ['--surface', '--surface-muted'],
  surface: ['--surface'],
  text: ['--text'],
  muted: ['--muted'],
  border: ['--border', '--surface-strong'],
  shadow: ['--shadow'],
};
function appearance(select: HTMLSelectElement) {
  const root = document.documentElement;
  const original = new Map<string, string>();
  for (const names of Object.values(APPEARANCE))
    for (const name of names) original.set(name, root.style.getPropertyValue(name));
  const theme = root.dataset.theme;
  const scheme = root.style.colorScheme;
  const fonts = new Map<string, FontFace>();
  const restore = () => {
    for (const [name, value] of original)
      value ? root.style.setProperty(name, value) : root.style.removeProperty(name);
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    root.style.colorScheme = scheme;
    delete root.dataset.gardenMood;
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== 'crux:appearance:update') return;
    const value = event.data.appearance;
    if (!value || !['garden', 'app'].includes(value.choice)) return;
    select.value = value.choice;
    if (value.choice === 'app') {
      restore();
      return;
    }
    root.dataset.gardenMood = 'true';
    root.dataset.theme = value.mode;
    root.style.colorScheme = value.mode;
    for (const [token, names] of Object.entries(APPEARANCE)) {
      const v = value.tokens?.[token];
      if (typeof v === 'string' && v) for (const name of names) root.style.setProperty(name, v);
    }
    for (const font of value.fonts ?? []) {
      if (typeof font.family !== 'string' || !(font.data instanceof ArrayBuffer)) continue;
      const face = new FontFace(font.family, font.data);
      face
        .load()
        .then((loaded) => {
          const previous = fonts.get(font.family);
          if (previous) document.fonts.delete(previous);
          fonts.set(font.family, loaded);
          document.fonts.add(loaded);
        })
        .catch(() => {});
    }
  });
  select.onchange = () =>
    window.parent.postMessage({ type: 'crux:appearance', op: 'set', choice: select.value }, '*');
  window.parent.postMessage({ type: 'crux:appearance', op: 'get' }, '*');
}

function mountBar() {
  bar = document.createElement('div');
  bar.id = 'garden-project';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 10px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}' +
    '#garden-project [role=status]{flex:1}#garden-project [role=alert]{flex:1;color:#ffb4a8}#garden-project button,#garden-project select{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}' +
    '#garden-project [hidden]{display:none}#garden-publication{position:fixed;right:10px;bottom:40px;z-index:100000;display:none;flex-direction:column;gap:6px;min-width:260px;max-height:50vh;overflow:auto;padding:12px;background:#1f2a24;color:#e6e4dc;border:1px solid #3a403c;border-radius:6px;font:12px system-ui}' +
    '#garden-publication[data-open]{display:flex}#garden-publication input[type=text],#garden-publication input:not([type]){margin-left:6px;padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px}' +
    '.app-shell{padding-bottom:34px!important;box-sizing:border-box}';
  document.head.append(style);
  if (edition) {
    bar.dataset.publicEdition = 'true';
    bar.innerHTML = '<span role="status">Public edition</span>';
    document.body.append(bar);
    status = bar.querySelector('span');
    return;
  }
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><span role="alert" hidden></span>' +
    '<button type="button" data-reload hidden>Discard draft and reload</button>' +
    '<button type="button" data-open>Open project file…</button>' +
    '<button type="button" data-publication aria-expanded="false">Public edition…</button>' +
    '<label>Appearance <select aria-label="App appearance"><option value="garden">Garden Mood</option><option value="app">App appearance</option></select></label>';
  document.body.append(bar);
  status = bar.querySelector('[role=status]');
  alertBox = bar.querySelector('[role=alert]');
  panel = document.createElement('div');
  panel.id = 'garden-publication';
  document.body.append(panel);
  bar.querySelector<HTMLButtonElement>('[data-open]')!.onclick = () => emit('menu-open-project');
  bar.querySelector<HTMLButtonElement>('[data-reload]')!.onclick = () => {
    if (confirm('Discard the unsaved draft and reload the saved project?')) location.reload();
  };
  const toggle = bar.querySelector<HTMLButtonElement>('[data-publication]')!;
  toggle.onclick = () => {
    const open = !panel!.hasAttribute('data-open');
    if (open) panel!.setAttribute('data-open', '');
    else panel!.removeAttribute('data-open');
    toggle.setAttribute('aria-expanded', String(open));
  };
  appearance(bar.querySelector('select')!);
}

function listen() {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:'))
      return;
    origin = event.origin;
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error));
      else request?.resolve(message.result);
    } else if (message.type === 'crux:app:flush') {
      enqueue(flush).then(
        () => send({ op: 'flushed', flushId: message.id }),
        (error) => send({ op: 'flushed', flushId: message.id, error: (error as Error).message }),
      );
    } else if (message.type === 'crux:app:command') {
      enqueue(() => commandSession.execute(message.command)).then(
        (result) => send({ op: 'tool-result', commandId: message.id, result }),
        (error) =>
          send({ op: 'tool-result', commandId: message.id, error: (error as Error).message }),
      );
    }
  });
}

/** Called once the app has rendered (see boot.ts). */
export async function attach() {
  mountBar();
  if (edition) {
    // A visitor starts in interactive mode, the way the edition is meant to be walked through.
    const play = document.querySelector<HTMLButtonElement>('[aria-label="Play interactive mode"]');
    play?.click();
    return;
  }
  if (!embedded) return;
  try {
    await ready;
  } catch (error) {
    conflict = (error as Error).message;
    show(conflict);
    return;
  }
  renderPanel();
  watchSaveState();
  // A fresh Crux: the app's default project becomes the saved one, through the app's own Save.
  if (!project) emit('menu-save-project');
}
if (embedded) listen();
