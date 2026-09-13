/**
 * Garden side of Tigrana (Crux Garden). The app is upstream's, unchanged; it
 * runs in its browser mode, and its NotebookStorage is the Garden one
 * (src/garden/notebook-storage.ts), which talks to the host here through the
 * scoped crux:notebook protocol: the Crux's notebook/ folder is the workspace.
 * This file also mounts a bottom bar (save state, Import notebook folder…,
 * Public edition… choices, Appearance) and answers the host's flush.
 */
declare global {
  interface Window {
    __CRUX_GARDEN__?: boolean;
  }
}
export const embedded = typeof window !== "undefined" && window.parent !== window;

let origin: string | undefined;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let inFlight = 0;
let dirtyShown = false;
let conflict = '';
let idle: Promise<void> = Promise.resolve();
let resolveIdle: (() => void) | null = null;
let status: HTMLElement | null = null;
let alertBox: HTMLElement | null = null;
let bar: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let publication: { title: string; pages: string[]; layout?: string } = { title: '', pages: [] };
let publicationFingerprint: string | null = null;
let publicationTail: Promise<unknown> = Promise.resolve();
let listNotes: (() => Promise<{ path: string; title: string }[]>) | null = null;

const send = (value: Record<string, unknown>) =>
  window.parent.postMessage(
    { type: 'crux:notebook', id: crypto.randomUUID(), ...value },
    origin && origin !== 'null' ? origin : '*',
  );
export function call(value: Record<string, unknown>): Promise<unknown> {
  if (!embedded) return Promise.reject(new Error('Open this notebook inside Crux Garden.'));
  return new Promise((resolve, reject) => {
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
}

function show(text: string) {
  if (!status) return;
  if (conflict) {
    status.textContent = '';
    if (alertBox) {
      alertBox.textContent = conflict;
      alertBox.hidden = false;
    }
    bar?.querySelector<HTMLButtonElement>('[data-reload]')?.removeAttribute('hidden');
    return;
  }
  if (alertBox) alertBox.hidden = true;
  bar?.querySelector<HTMLButtonElement>('[data-reload]')?.setAttribute('hidden', '');
  status.textContent = text;
}
function setDirty(dirty: boolean) {
  if (dirty === dirtyShown) return;
  dirtyShown = dirty;
  if (embedded) send({ op: 'dirty', dirty });
}

/** What the storage tells the bar: writes in flight, and writes the host refused. */
export const garden = {
  call,
  mutating(delta: number) {
    inFlight += delta;
    if (inFlight > 0) {
      if (!resolveIdle) idle = new Promise((r) => (resolveIdle = r));
      setDirty(true);
      show('Saving…');
    } else {
      resolveIdle?.();
      resolveIdle = null;
      setDirty(false);
      if (!conflict) show('Saved');
    }
  },
  failed(message: string) {
    conflict = message;
    show(message);
  },
  notesProvider(fn: () => Promise<{ path: string; title: string }[]>) {
    listNotes = fn;
  },
};

/** The host asks before a view switch or close: let Tigrana's autosave (650 ms) fire, then drain. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 900));
  await idle;
  if (conflict) throw new Error(conflict);
}

async function loadPublication() {
  try {
    const result = (await call({ op: 'read', path: 'publish.json' })) as {
      content: string;
      fingerprint: string;
    };
    publicationFingerprint = result.fingerprint;
    const parsed = JSON.parse(result.content);
    publication = {
      title: typeof parsed?.title === 'string' ? parsed.title : '',
      pages: Array.isArray(parsed?.pages)
        ? parsed.pages.filter((p: unknown) => typeof p === 'string')
        : [],
      ...(typeof parsed?.layout === 'string' ? { layout: parsed.layout } : {}),
    };
  } catch {
    publication = { title: '', pages: [] };
    publicationFingerprint = null;
  }
}
function savePublication() {
  const operation = publicationTail.then(async () => {
    // Settings may have changed the layout meanwhile: keep theirs, write our selection.
    try {
      const latest = (await call({ op: 'read', path: 'publish.json' })) as {
        content: string;
        fingerprint: string;
      };
      const parsed = JSON.parse(latest.content);
      publicationFingerprint = latest.fingerprint;
      if (typeof parsed?.layout === 'string') publication.layout = parsed.layout;
      else delete publication.layout;
    } catch {
      /* first write */
    }
    try {
      const result = (await call({
        op: 'write',
        path: 'publish.json',
        expected: publicationFingerprint,
        content: JSON.stringify(publication, null, 2),
      })) as { fingerprint: string };
      publicationFingerprint = result.fingerprint;
      if (!conflict && inFlight === 0) show('Saved');
    } catch (error) {
      garden.failed((error as Error).message);
    }
  });
  publicationTail = operation.catch(() => {});
}
async function renderPanel() {
  if (!panel) return;
  const notes = listNotes ? await listNotes() : [];
  const chosen = new Set(publication.pages);
  panel.innerHTML = '';
  const title = document.createElement('label');
  title.textContent = 'Public edition title ';
  const input = document.createElement('input');
  input.value = publication.title;
  input.placeholder = 'My notebook';
  input.maxLength = 200;
  input.oninput = () => {
    publication.title = input.value;
    savePublication();
  };
  title.append(input);
  panel.append(title);
  if (!notes.length) {
    const note = document.createElement('span');
    note.textContent = 'Add a note to choose pages.';
    panel.append(note);
  }
  for (const note of notes) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.has(note.path);
    box.setAttribute('aria-label', 'Include in public edition');
    box.dataset.note = note.path;
    box.onchange = () => {
      // Selection order is page order: the first note chosen is the edition's front page.
      if (box.checked && !publication.pages.includes(note.path)) publication.pages.push(note.path);
      if (!box.checked) publication.pages = publication.pages.filter((p) => p !== note.path);
      savePublication();
    };
    label.append(box, document.createTextNode(' ' + note.path.replace(/\.md$/i, '')));
    panel.append(label);
  }
}

/** Import a notebook folder (Markdown, images, Tigrana metadata) into notebook/Imported/<name>, through the host. */
async function importFolder(files: File[]) {
  const image = /\.(png|jpe?g|gif|webp)$/i;
  const supported = (path: string) =>
    !path.split('/').some((p) => p.startsWith('.') && p !== '.assets' && p !== '.tigrana') &&
    (/\.md$/i.test(path) ||
      image.test(path) ||
      /(?:^|\/)\.tigrana\/(metadata|index|folder)\.json$/.test(path));
  const name = files[0]?.webkitRelativePath.split('/')[0] || 'Notebook';
  const payload = [];
  for (const file of files) {
    const path = file.webkitRelativePath.split('/').slice(1).join('/');
    if (!supported(path)) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let content: string;
    if (image.test(path)) {
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const ext = path.split('.').pop()!.toLowerCase();
      content = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${btoa(binary)}`;
    } else content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    payload.push({ path, content });
  }
  if (!payload.length) throw new Error('The folder holds no Markdown notes or images.');
  show(`Importing ${payload.length} files…`);
  const result = (await call({ op: 'import', name, files: payload })) as {
    root: string;
    notes: number;
  };
  show(`Imported ${result.notes} notes into ${result.root}. Reloading…`);
  setTimeout(() => location.reload(), 600);
}

/* Mood appearance (ADR 0029): Tigrana exposes its shell background and shadows as variables; accent and type stay the notebook's own. */
const APPEARANCE: Record<string, string[]> = {
  bg: ['--app-bg'],
  shadow: ['--shadow-modal', '--shadow-popover'],
};
function appearance(select: HTMLSelectElement) {
  const root = document.documentElement;
  const original = new Map<string, string>();
  for (const names of Object.values(APPEARANCE))
    for (const name of names) original.set(name, root.style.getPropertyValue(name));
  const theme = root.dataset.theme;
  const restore = () => {
    for (const [name, value] of original)
      value ? root.style.setProperty(name, value) : root.style.removeProperty(name);
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    delete root.dataset.gardenMood;
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.type !== 'crux:appearance:update') return;
    const value = event.data.appearance;
    if (!value || !['garden', 'app'].includes(value.choice)) return;
    select.value = value.choice;
    if (value.choice === 'app') {
      restore();
      return;
    }
    root.dataset.gardenMood = 'true';
    root.dataset.theme = value.mode;
    for (const [token, names] of Object.entries(APPEARANCE)) {
      const v = value.tokens?.[token];
      if (typeof v === 'string' && v) for (const name of names) root.style.setProperty(name, v);
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
    '#garden-project [hidden]{display:none}#garden-publication{position:fixed;right:10px;bottom:40px;z-index:100000;display:none;flex-direction:column;gap:6px;min-width:280px;max-height:50vh;overflow:auto;padding:12px;background:#1f2a24;color:#e6e4dc;border:1px solid #3a403c;border-radius:6px;font:12px system-ui}' +
    '#garden-publication[data-open]{display:flex}#garden-publication input:not([type=checkbox]){margin-left:6px;padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px}' +
    '#root{height:calc(100vh - 34px)!important;min-height:0!important}';
  document.head.append(style);
  bar.innerHTML =
    '<span role="status">Opening Garden notebook…</span><span role="alert" hidden></span>' +
    '<button type="button" data-reload hidden>Discard draft and reload</button>' +
    '<button type="button" data-import>Import notebook folder…</button>' +
    '<button type="button" data-publication aria-expanded="false">Public edition…</button>' +
    '<label>Appearance <select aria-label="App appearance"><option value="garden">Garden Mood</option><option value="app">App appearance</option></select></label>';
  document.body.append(bar);
  status = bar.querySelector('[role=status]');
  alertBox = bar.querySelector('[role=alert]');
  panel = document.createElement('div');
  panel.id = 'garden-publication';
  document.body.append(panel);
  bar.querySelector<HTMLButtonElement>('[data-reload]')!.onclick = () => {
    if (confirm('Discard the unsaved draft and reload the saved notebook?')) location.reload();
  };
  bar.querySelector<HTMLButtonElement>('[data-import]')!.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('aria-label', 'Import notebook folder');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length)
        importFolder(files).catch((error) => garden.failed((error as Error).message));
    };
    document.body.append(input);
    input.click();
  };
  const toggle = bar.querySelector<HTMLButtonElement>('[data-publication]')!;
  toggle.onclick = () => {
    const open = !panel!.hasAttribute('data-open');
    if (open) {
      panel!.setAttribute('data-open', '');
      void loadPublication().then(renderPanel);
    } else panel!.removeAttribute('data-open');
    toggle.setAttribute('aria-expanded', String(open));
  };
  appearance(bar.querySelector('select')!);
}

function listen() {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:notebook:'))
      return;
    origin = event.origin;
    if (message.type === 'crux:notebook:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error));
      else request?.resolve(message.result);
    } else if (message.type === 'crux:notebook:flush') {
      flush().then(
        () => send({ op: 'flushed', flushId: message.id }),
        (error) => send({ op: 'flushed', flushId: message.id, error: (error as Error).message }),
      );
    } else if (message.type === 'crux:notebook:command') {
      send({
        op: 'tool-result',
        commandId: message.id,
        error: 'Tigrana has no App Tools in this Crux yet.',
      });
    }
  });
}
if (embedded) listen();

/**
 * Note images. Upstream turns a note's relative image path into a file URL only
 * under Tauri; in the Garden the preview server serves the whole Crux folder and
 * the app runs from runtime/, so a note image lives at /notebook/<path> on the
 * same origin. The editor keeps the Markdown path in data-markdown-src, so the
 * displayed src can be replaced without touching what is saved.
 */
function resolveImages() {
  const external = /^(https?:|asset:|blob:|file:|data:|\/)/i;
  const fix = (img: HTMLImageElement) => {
    const current = img.getAttribute('src') || '';
    if (/^(data:|blob:)/i.test(current)) return; // a fresh paste shows its own bytes
    const src = img.getAttribute('data-markdown-src') || current;
    if (!src || external.test(src)) return;
    const resolved = `/notebook/${src.replace(/^\.?\//, '').split('/').map(encodeURIComponent).join('/')}`;
    if (img.getAttribute('src') !== resolved) img.setAttribute('src', resolved);
  };
  const sweep = (root: ParentNode) => root.querySelectorAll('img').forEach(fix);
  sweep(document);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') fix(record.target as HTMLImageElement);
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) fix(node);
        else if (node instanceof Element) sweep(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}

/** Called once the app has rendered (see boot.ts). */
export async function attach() {
  if (!embedded) return;
  mountBar();
  resolveImages();
  await loadPublication();
  show(inFlight ? 'Saving…' : 'Saved');
}
