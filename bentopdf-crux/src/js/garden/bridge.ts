/**
 * Garden bridge for BentoPDF (Crux Garden). The toolkit is untouched: every
 * result a tool would download is saved to the Crux instead, as a binary
 * Artifact under data/assets, and every file a person loads into a tool is
 * kept the same way, so the Crux holds the papers and everything made from
 * them. data/project.json lists them (name, type, size, pages, which tool made
 * them). Loaded on every page through main.ts; outside a Crux it does nothing.
 */
import { PDFDocument, degrees } from 'pdf-lib';
import { validateProject } from '../../../garden/document.js';

type BinaryRef = {
  __cruxBinary: { path: string; kind: 'buffer'; type: string; size: number };
};
type Source = 'upload' | 'tool' | 'agent';
type Entry = {
  id: string;
  name: string;
  type: string;
  size: number;
  pages: number | null;
  source: Source;
  tool: string;
  created: string;
  file: BinaryRef;
};
type Project = { name: string; documents: Entry[] };
type Doc = { version: 1; app: 'bentopdf'; project: Project };

const embedded = typeof window !== 'undefined' && window.parent !== window;
let origin: string | undefined;
let expected: string | null = null;
let doc: Doc | null = null;
let status: HTMLElement | null = null;
let tail: Promise<unknown> = Promise.resolve();
let commandTail: Promise<unknown> = Promise.resolve();
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
const MAX_BYTES = 256_000_000;

const page = () =>
  (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '') ||
  'index';
const show = (text: string) => {
  if (status) status.textContent = text;
};
const send = (value: Record<string, unknown>) =>
  window.parent.postMessage(
    { type: 'crux:app', id: crypto.randomUUID(), ...value },
    origin && origin !== 'null' ? origin : '*'
  );
const call = (value: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Garden did not answer.'));
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

async function load(): Promise<Doc> {
  const loaded = await call({ op: 'read', path: 'project.json' });
  expected = loaded.fingerprint;
  const parsed = JSON.parse(loaded.content);
  validateProject(parsed);
  return parsed as Doc;
}

async function write(): Promise<void> {
  const d = doc!;
  validateProject(d);
  try {
    const result = await call({
      op: 'write',
      path: 'project.json',
      expected,
      content: JSON.stringify(d),
    });
    expected = result.fingerprint;
  } catch (error) {
    // Another page of the toolkit may have written meanwhile: take its list, keep ours, write once more.
    const latest = await load();
    const known = new Set(
      latest.project.documents.map((e) => e.file.__cruxBinary.path + e.name)
    );
    d.project.documents = [
      ...latest.project.documents,
      ...d.project.documents.filter(
        (e) => !known.has(e.file.__cruxBinary.path + e.name)
      ),
    ];
    if (latest.project.name !== d.project.name && d.project.name === 'PDF work')
      d.project.name = latest.project.name;
    const result = await call({
      op: 'write',
      path: 'project.json',
      expected,
      content: JSON.stringify(d),
    });
    expected = result.fingerprint;
    if (
      error instanceof Error &&
      !/fingerprint|changed|conflict/i.test(error.message)
    )
      throw error;
  }
}

async function pageCount(
  bytes: ArrayBuffer,
  type: string
): Promise<number | null> {
  if (type !== 'application/pdf') return null;
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

const typeOf = (blob: Blob, name: string) => {
  if (blob.type) return blob.type.split(';')[0];
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.zip$/i.test(name)) return 'application/zip';
  return 'application/octet-stream';
};

/** Keep a file (a loaded paper or a tool's result) as a binary Artifact and list it. */
function record(
  blob: Blob,
  name: string,
  source: Source,
  tool = page()
): Promise<Entry | null> {
  const operation = tail.then(async (): Promise<Entry | null> => {
    if (!doc) throw new Error('The Garden project is not open.');
    if (blob.size > MAX_BYTES)
      throw new Error('Files over 256 MB cannot be kept in the Crux.');
    const type = typeOf(blob, name);
    show(
      source === 'upload' ? `Keeping ${name}…` : `Saving ${name} to Garden…`
    );
    const bytes = await blob.arrayBuffer();
    const imported = await call({ op: 'native-import', bytes, mimeType: type });
    const path: string = imported.path;
    const existing = doc.project.documents.find(
      (e) => e.file.__cruxBinary.path === path && e.name === name
    );
    if (existing) {
      show('Saved to Garden');
      return existing;
    }
    const entry: Entry = {
      id: crypto.randomUUID().slice(0, 8),
      name: name.slice(0, 200),
      type,
      size: bytes.byteLength,
      pages: await pageCount(bytes, type),
      source,
      tool,
      created: new Date().toISOString(),
      file: {
        __cruxBinary: { path, kind: 'buffer', type, size: bytes.byteLength },
      },
    };
    doc.project.documents.push(entry);
    await write();
    show(
      source === 'upload' ? 'Saved to Garden' : `Saved ${entry.name} to Garden`
    );
    return entry;
  });
  tail = operation.catch((error) => show((error as Error).message));
  return operation;
}

function inspect() {
  const p = doc!.project;
  return JSON.parse(
    JSON.stringify({
      name: p.name,
      page: page(),
      documents: p.documents.map((e) => ({
        name: e.name,
        type: e.type,
        size: e.size,
        pages: e.pages,
        source: e.source,
        tool: e.tool,
        created: e.created,
      })),
    })
  );
}

function find(name: unknown): Entry {
  const wanted = String(name ?? '').trim();
  const entries = doc!.project.documents.filter((e) => e.name === wanted);
  if (!entries.length)
    throw new Error(`No document named ${wanted} in this Crux.`);
  return entries[entries.length - 1]; // the latest of that name
}
async function bytesOf(entry: Entry): Promise<ArrayBuffer> {
  const asset = await call({
    op: 'native-read',
    path: entry.file.__cruxBinary.path,
  });
  return asset.bytes as ArrayBuffer;
}
const stem = (name: string) => name.replace(/\.pdf$/i, '');

async function command(value: any) {
  if (!doc) throw new Error('The Garden project is not open.');
  if (value.op === 'inspect') return inspect();
  if (value.op === 'set-name') {
    const name = String(value.name ?? '').trim();
    if (!name || name.length > 200)
      throw new Error('Use a name up to 200 characters.');
    doc.project.name = name;
    await (tail = tail.then(() => write()));
  } else if (value.op === 'rotate') {
    const deg = Number(value.degrees);
    if (![90, 180, 270].includes(deg))
      throw new Error('Rotate by 90, 180 or 270 degrees.');
    const entry = find(value.document);
    if (entry.type !== 'application/pdf')
      throw new Error(`${entry.name} is not a PDF.`);
    const pdf = await PDFDocument.load(await bytesOf(entry), {
      ignoreEncryption: true,
    });
    for (const p of pdf.getPages())
      p.setRotation(degrees((p.getRotation().angle + deg) % 360));
    const out = String(
      value.output ?? `${stem(entry.name)}-rotated.pdf`
    ).trim();
    const saved = await pdf.save();
    await record(
      new Blob([saved as BlobPart], { type: 'application/pdf' }),
      out,
      'agent',
      'rotate'
    );
  } else if (value.op === 'merge') {
    const names: unknown[] = Array.isArray(value.documents)
      ? value.documents
      : [];
    if (names.length < 2 || names.length > 50)
      throw new Error('Merge two to fifty documents.');
    const merged = await PDFDocument.create();
    for (const name of names) {
      const entry = find(name);
      if (entry.type !== 'application/pdf')
        throw new Error(`${entry.name} is not a PDF.`);
      const src = await PDFDocument.load(await bytesOf(entry), {
        ignoreEncryption: true,
      });
      for (const p of await merged.copyPages(src, src.getPageIndices()))
        merged.addPage(p);
    }
    const out = String(value.output ?? 'merged.pdf').trim();
    const saved = await merged.save();
    await record(
      new Blob([saved as BlobPart], { type: 'application/pdf' }),
      out,
      'agent',
      'merge'
    );
  } else throw new Error('Unsupported BentoPDF operation.');
  return inspect();
}

function listen() {
  window.addEventListener('message', (event) => {
    if (
      event.source !== window.parent ||
      (origin !== undefined && event.origin !== origin)
    )
      return;
    const message = event.data;
    if (
      !message ||
      typeof message.type !== 'string' ||
      !message.type.startsWith('crux:app:')
    )
      return;
    origin = event.origin;
    if (message.type === 'crux:app:result') {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error));
      else request?.resolve(message.result);
    } else if (message.type === 'crux:app:flush') {
      tail.then(
        () => send({ op: 'flushed', flushId: message.id }),
        (error) =>
          send({
            op: 'flushed',
            flushId: message.id,
            error: (error as Error).message,
          })
      );
    } else if (message.type === 'crux:app:command') {
      const operation = commandTail.then(() => command(message.command));
      commandTail = operation.catch(() => {});
      operation.then(
        (result) => send({ op: 'tool-result', commandId: message.id, result }),
        (error) =>
          send({
            op: 'tool-result',
            commandId: message.id,
            error: (error as Error).message,
          })
      );
    }
  });
  // Files a person loads into a tool (the file input or a drop) are kept with the Crux.
  const keep = (files: FileList | null | undefined) => {
    for (const file of Array.from(files ?? []))
      record(file, file.name, 'upload').catch(() => {});
  };
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.tagName === 'INPUT' && target.type === 'file')
        keep(target.files);
    },
    true
  );
  document.addEventListener(
    'drop',
    (event) => keep(event.dataTransfer?.files),
    true
  );
  // Results a tool would download are saved instead (utils/helpers.ts downloadFile).
  (window as any).gardenDownload = (blob: Blob, filename: string) => {
    record(blob, filename, 'tool').catch(() => {});
    return true;
  };
}

async function boot() {
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML = '<span role="status">Opening Garden project…</span>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:100000;display:flex;align-items:center;padding:0 12px;background:#111827;color:#e5e7eb;font:12px system-ui;border-top:1px solid #374151}body{padding-bottom:32px}';
  document.head.append(style);
  document.body.append(bar);
  status = bar.querySelector('span');
  listen();
  try {
    doc = await load();
    (window as any).gardenBento = {
      documents: (): unknown[] => inspect().documents as unknown[],
      name: (): string => doc!.project.name,
      whenIdle: (): Promise<void> => tail.then((): void => undefined),
    };
    show('Saved to Garden');
  } catch (error) {
    show((error as Error).message);
  }
}

if (embedded) {
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', () => boot());
}
