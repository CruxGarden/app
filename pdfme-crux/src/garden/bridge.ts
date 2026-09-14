import { validateLayoutEdit } from '../../garden/commands';
// Garden bridge for the layout tool (Crux Garden). The layout keeps its state
// as plain data (name, page, pdfme template); inside a Crux the saved layout
// loads before the designer shows, every change marks the project dirty, a
// confirmed save writes data/project.json, and finished pages go to the
// Crux's outputs as PDF or PNG (a Cruxspace can use them). App Tools drive
// the same operations. Outside a Crux main.ts keeps the layout in the browser.
import type { layout as Layout } from '../main';
type Layout = typeof Layout;

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc: unknown) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'pdfme' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid layout project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'page', 'template', 'saved'].includes(k))) throw Error('Invalid layout record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid layout name.');
  if (typeof p.page !== 'string' || !/^[a-z0-9-]{1,40}$/.test(p.page)) throw Error('Invalid page choice.');
  const t = p.template;
  if (!object(t) || !Array.isArray(t.schemas) || t.schemas.length > 100 || !t.schemas.every((page) => Array.isArray(page) && page.length <= 500))
    throw Error('Invalid layout template.');
  if (JSON.stringify(t).length > 24_000_000) throw Error('The layout is too large (24 MB).');
}

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
      reject(new Error('Garden did not confirm the save. Your layout is still open.'));
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

export function attach(layout: Layout) {
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
      if (hydrating) throw new Error('Wait for the saved layout to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving layout…');
        const doc = { version: 1, app: 'pdfme', project: { ...layout.snapshot(), saved: new Date().toISOString() } };
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
  function inspect(pageIndex = 0, offset = 0) {
    const s = layout.snapshot();
    if (!s.template.schemas[pageIndex]) throw Error('Choose an existing page index.');
    return {
      name: s.name,
      page: s.page,
      pages: layout.pages,
      pageCount: s.template.schemas.length,
      pageIndex,
      nextOffset: offset + 20 < s.template.schemas[pageIndex].length ? offset + 20 : null,
      blocks: s.template.schemas[pageIndex].slice(offset, offset + 20).map((b) => ({
        name: b.name,
        type: b.type,
        content: typeof b.content === 'string' ? b.content.slice(0, 120) : undefined,
        position: b.position,
        width: b.width,
        height: b.height,
      })),
    };
  }
  async function saveOutput(kind: 'pdf' | 'png', label: string, pageIndex = 0) {
    const name = label.trim() || layout.snapshot().name;
    if (name.length > 120) throw new Error('Use an output name up to 120 characters.');
    await save();
    show(kind === 'pdf' ? 'Rendering PDF…' : 'Rendering image…');
    const bytes = kind === 'pdf' ? (await layout.pdf()).buffer : await layout.png(pageIndex);
    const output = (await call({
      op: 'save-output',
      label: kind === 'pdf' ? name : `${name} (image)`,
      bytes: bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes as ArrayBufferLike).slice().buffer,
      mimeType: kind === 'pdf' ? 'application/pdf' : 'image/png',
    })) as Record<string, unknown>;
    show(kind === 'pdf' ? `Saved ${name} as a PDF output.` : `Saved ${name} as an image output.`);
    setTimeout(() => show(revision === saved ? 'Saved to Garden' : 'Unsaved changes'), 3000);
    return output;
  }
  async function command(value: Record<string, unknown>) {
    if (hydrating) throw new Error('Wait for the layout to open.');
    if (['inspect', 'add-text', 'add-page', 'update-block'].includes(String(value.op))) validateLayoutEdit(value);
    if (value.op === 'inspect') return inspect(Number(value.pageIndex ?? 0), Number(value.offset ?? 0));
    if (value.op === 'add-page') { const result = layout.addPage(); await save(); return { ...inspect(result.pageIndex), ...result }; }
    if (value.op === 'update-block') { layout.updateBlock(value); await save(); return inspect(Number(value.pageIndex ?? 0)); }
    if (value.op === 'save-pdf') return saveOutput('pdf', String(value.label ?? ''));
    if (value.op === 'save-image') return saveOutput('png', String(value.label ?? ''), Number(value.pageIndex ?? 0));
    if (value.op === 'set-name') {
      const name = String(value.name ?? '').trim();
      if (!name || name.length > 200) throw new Error('Use a layout name up to 200 characters.');
      layout.setName(name);
    } else if (value.op === 'set-page') {
      layout.setPage(String(value.page ?? ''));
    } else if (value.op === 'add-text') {
      const text = String(value.text ?? '');
      if (!text.trim() || text.length > 5000) throw new Error('Give the block text (up to 5,000 characters).');
      const num = (v: unknown, name: string, min: number, max: number) => {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${name} is a number between ${min} and ${max} (millimetres).`);
        return v;
      };
      layout.addText({
        name: typeof value.name === 'string' ? value.name : undefined,
        text,
        pageIndex: Number(value.pageIndex ?? 0),
        x: num(value.x, 'x', 0, 1000),
        y: num(value.y, 'y', 0, 1000),
        width: num(value.width, 'width', 1, 1000),
        height: num(value.height, 'height', 1, 1000),
        fontSize: value.fontSize === undefined ? undefined : num(value.fontSize, 'fontSize', 4, 200),
        align: typeof value.align === 'string' ? value.align : undefined,
      });
    } else throw new Error('Unsupported layout operation.');
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
      '<label>Output name <input id="output-name" maxlength="120" placeholder="Layout" /></label>' +
      '<button type="button" id="save-pdf">Save PDF to Cruxspace</button>' +
      '<label>Image page <input id="image-page" type="number" min="1" max="100" value="1" style="width:42px" /></label><button type="button" id="save-image">Save image to Cruxspace</button>';
    const style = document.createElement('style');
    style.textContent =
      '#garden-project{position:fixed;bottom:0;left:0;right:0;height:34px;z-index:100000;display:flex;gap:10px;align-items:center;padding:0 12px;background:#1f2a24;color:#e6e4dc;font:12px system-ui;border-top:1px solid #3a403c}#garden-project [role=status]{flex:1}#garden-project label{display:flex;gap:6px;align-items:center}#garden-project input{padding:2px 6px;background:#2f3a34;color:#e6e4dc;border:1px solid #556059;border-radius:3px;font:inherit}#garden-project button{padding:3px 8px;color:#e6e4dc;background:#2f3a34;border:1px solid #556059;border-radius:3px;font:inherit}body{padding-bottom:34px;box-sizing:border-box}';
    document.head.append(style);
    document.body.append(bar);
    status = bar.querySelector('span');
    const label = () => (bar.querySelector('#output-name') as HTMLInputElement).value;
    (bar.querySelector('#save-pdf') as HTMLButtonElement).onclick = () => saveOutput('pdf', label()).catch((e) => show((e as Error).message));
    (bar.querySelector('#save-image') as HTMLButtonElement).onclick = () => saveOutput('png', label(), Number((bar.querySelector('#image-page') as HTMLInputElement).value) - 1).catch((e) => show((e as Error).message));
    try {
      const loaded = (await call({ op: 'read', path: 'project.json' })) as { content: string; fingerprint: string };
      expected = loaded.fingerprint;
      const doc = JSON.parse(loaded.content);
      validateProject(doc);
      layout.load(doc.project);
      layout.onChange(() => dirty());
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
