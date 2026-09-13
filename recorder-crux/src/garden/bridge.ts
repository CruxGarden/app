// Garden bridge for Record (Crux Garden). Record keeps nothing: a finished
// recording is a blob the modal offers as a download (WebM, or MP4 after a
// conversion). Inside a Crux those downloads become outputs of the Crux
// (exports/, a Cruxspace output) named from the bar's Output name, and the
// document data/project.json lists them with the Crux's name. Nothing in
// Record's own files changes.
export const embedded = parent !== window;
interface Recording {
  id: string;
  label: string;
  path: string;
  mimeType: string;
  size: number;
  created: string;
}
interface Project {
  name: string;
  recordings: Recording[];
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc: unknown) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'recorder' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid recorder project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'recordings', 'saved'].includes(k))) throw Error('Invalid recorder record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid recorder name.');
  if (!Array.isArray(p.recordings) || p.recordings.length > 1000) throw Error('Invalid recording list.');
  for (const r of p.recordings) {
    if (!object(r) || typeof r.id !== 'string' || typeof r.label !== 'string' || r.label.length > 200 || typeof r.path !== 'string' || !/^exports\/[\w.-]+\.(webm|mp4)$/.test(r.path))
      throw Error('Invalid recording.');
    if (!['video/webm', 'video/mp4'].includes(String(r.mimeType)) || typeof r.size !== 'number' || typeof r.created !== 'string') throw Error('Invalid recording.');
  }
}

let origin: string | undefined;
let expected: string | null = null;
let status: HTMLElement | null = null;
let nameInput: HTMLInputElement | null = null;
let outputName: HTMLInputElement | null = null;
let project: Project = { name: 'Recordings', recordings: [] };
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
      reject(new Error('Garden did not confirm the save.'));
    }, 120000);
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
function save() {
  const operation = tail.then(async () => {
    const doc = { version: 1, app: 'recorder', project: { ...project, saved: new Date().toISOString() } };
    validateProject(doc);
    const result = (await call({ op: 'write', path: 'project.json', expected, content: JSON.stringify(doc) })) as { fingerprint: string };
    expected = result.fingerprint;
  });
  tail = operation.catch(() => {});
  return operation;
}
async function keep(blob: Blob, kind: 'webm' | 'mp4') {
  const base = (outputName?.value.trim() || 'Recording') + (project.recordings.length ? ` ${project.recordings.length + 1}` : '');
  const label = kind === 'mp4' ? `${base} (MP4)` : base;
  show(`Saving ${label} to this Crux…`);
  const output = (await call({
    op: 'save-output',
    label,
    bytes: await blob.arrayBuffer(),
    mimeType: kind === 'mp4' ? 'video/mp4' : 'video/webm',
  })) as { id: string; path: string };
  project.recordings.push({ id: output.id, label, path: output.path, mimeType: kind === 'mp4' ? 'video/mp4' : 'video/webm', size: blob.size, created: new Date().toISOString() });
  await save();
  show(`Saved ${label} (${Math.round(blob.size / 1024)} KB) as an output of this Crux.`);
}
/* Record hands a finished recording to the browser as a download link; here the link's bytes go into the Crux instead. */
function captureDownloads() {
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const kind = /\.mp4$/i.test(this.download) ? 'mp4' : /\.webm$/i.test(this.download) ? 'webm' : null;
    if (!kind || !this.href.startsWith('blob:')) return click.call(this);
    fetch(this.href)
      .then((r) => r.blob())
      .then((blob) => keep(blob, kind))
      .catch((error) => show((error as Error).message));
  };
}
function inspect() {
  return { name: project.name, recordings: project.recordings.map((r) => ({ ...r })) };
}
async function command(value: Record<string, unknown>) {
  if (value.op === 'inspect') return inspect();
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200) throw new Error('Use a name up to 200 characters.');
    project.name = name;
    if (nameInput) nameInput.value = name;
    await save();
    show('Saved to Garden');
    return inspect();
  }
  throw new Error('Unsupported recorder operation. Recording starts and stops by hand.');
}
export function attach() {
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
      tail.then(
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
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span>' +
    '<label>Name <input id="recorder-name" maxlength="200" /></label>' +
    '<label>Output name <input id="output-name" maxlength="120" placeholder="Recording" /></label>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#root{padding-bottom:34px;box-sizing:border-box}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  nameInput = bar.querySelector('#recorder-name');
  outputName = bar.querySelector('#output-name');
  nameInput!.oninput = () => {
    project.name = nameInput!.value;
    save().then(() => show('Saved to Garden'), (e) => show((e as Error).message));
  };
  captureDownloads();
  call({ op: 'read', path: 'project.json' })
    .then((loaded) => {
      const { content, fingerprint } = loaded as { content: string; fingerprint: string };
      expected = fingerprint;
      const doc = JSON.parse(content);
      validateProject(doc);
      if (doc.project) project = { name: doc.project.name, recordings: doc.project.recordings };
      nameInput!.value = project.name;
      show('Saved to Garden');
      if (!doc.project) return save().then(() => show('Saved to Garden'));
    })
    .catch((error) => show((error as Error).message));
}
