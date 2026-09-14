import { layoutHistory } from '../garden/history';
import { validateLayoutEdit } from '../garden/commands';
// The layout tool around pdfme: the actual Designer for laying out a page,
// the Viewer for a preview, the generator for PDF and the converter for PNG.
// The Crux keeps a name and the pdfme template as plain data; inside a Crux
// the Garden bridge saves it, standalone the browser does.
import { Designer, Viewer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { pdf2img } from '@pdfme/converter';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { text, multiVariableText, image, table, line, rectangle, ellipse, barcodes } from '@pdfme/schemas';
import { attach } from './garden/bridge';

export const plugins = { text, multiVariableText, image, table, line, rectangle, ellipse, qrcode: barcodes.qrcode };
export const PAGES: Record<string, { width: number; height: number }> = {
  'a4-portrait': { width: 210, height: 297 },
  'a4-landscape': { width: 297, height: 210 },
  'letter-portrait': { width: 215.9, height: 279.4 },
  'letter-landscape': { width: 279.4, height: 215.9 },
  'a5-portrait': { width: 148, height: 210 },
  square: { width: 210, height: 210 },
};
export interface LayoutState {
  name: string;
  page: string;
  template: Template;
}
const blank = (page: string): Template => ({
  basePdf: { ...PAGES[page]!, padding: [10, 10, 10, 10] },
  schemas: [[]],
});
const state: LayoutState = { name: 'Layout', page: 'a4-portrait', template: blank('a4-portrait') };
let designer: Designer | null = null;
let viewer: Viewer | null = null;
let hydrating = false;
const listeners: (() => void)[] = [];
let history = layoutHistory(state);
const emit = () => { syncHistoryButtons(); listeners.forEach((fn) => fn()); };
const notify = () => { history.record(state); emit(); };
function syncHistoryButtons() {
  (document.getElementById('layout-undo') as HTMLButtonElement).disabled = !history.canUndo;
  (document.getElementById('layout-redo') as HTMLButtonElement).disabled = !history.canRedo;
}
function travel(direction: 'undo' | 'redo') {
  const next = history[direction]();
  if (!next) return;
  Object.assign(state, next);
  nameInput.value = state.name;
  pageSelect.value = state.page;
  hydrating = true;
  designer?.updateTemplate(state.template);
  hydrating = false;
  if (!viewerEl.hidden) showPreview(true);
  emit();
}
const nameInput = document.getElementById('layout-name') as HTMLInputElement;
const pageSelect = document.getElementById('layout-page') as HTMLSelectElement;
const tabDesign = document.getElementById('tab-design')!;
const tabPreview = document.getElementById('tab-preview')!;
const designerEl = document.getElementById('designer')!;
const viewerEl = document.getElementById('viewer')!;

function mount() {
  if (designer) designer.destroy();
  lastWidth = designerEl.clientWidth;
  hydrating = true;
  designer = new Designer({
    domContainer: designerEl,
    template: state.template,
    plugins,
    options: { lang: 'en', zoomLevel: 0.9, sidebarOpen: true },
  });
  designer.onChangeTemplate((template) => {
    if (hydrating) return;
    state.template = template;
    notify();
  });
  hydrating = false;
}
function showPreview(on: boolean) {
  tabDesign.setAttribute('aria-selected', String(!on));
  tabPreview.setAttribute('aria-selected', String(on));
  designerEl.hidden = on;
  viewerEl.hidden = !on;
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  if (!on) return;
  viewer = new Viewer({
    domContainer: viewerEl,
    template: state.template,
    inputs: getInputFromTemplate(state.template),
    plugins,
    options: { lang: 'en' },
  });
}
// pdfme's Designer measures its container once; the Workshop pane settles after the app is
// up and can be resized, so a changed width remounts the Designer with the current template.
let lastWidth = 0;
new ResizeObserver(() => {
  const width = designerEl.clientWidth;
  if (!designer || designerEl.hidden || Math.abs(width - lastWidth) < 40) return;
  lastWidth = width;
  clearTimeout(remount);
  remount = setTimeout(() => mount(), 250);
}).observe(designerEl);
let remount: ReturnType<typeof setTimeout> | undefined;
nameInput.addEventListener('input', () => {
  state.name = nameInput.value;
  notify();
});
pageSelect.addEventListener('change', () => {
  state.page = pageSelect.value;
  state.template = { ...state.template, basePdf: { ...PAGES[state.page]!, padding: [10, 10, 10, 10] } };
  mount();
  notify();
});
tabDesign.onclick = () => showPreview(false);
tabPreview.onclick = () => showPreview(true);
document.getElementById('layout-undo')!.onclick = () => travel('undo');
document.getElementById('layout-redo')!.onclick = () => travel('redo');
document.getElementById('layout-add-page')!.onclick = () => layout.addPage();
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    e.preventDefault(); e.stopImmediatePropagation();
    travel(e.shiftKey || e.key.toLowerCase() === 'y' ? 'redo' : 'undo');
  }
}, true);

async function pdf(): Promise<Uint8Array> {
  return generate({ template: state.template, inputs: getInputFromTemplate(state.template), plugins });
}
export const layout = {
  pages: Object.keys(PAGES),
  load(saved: Partial<LayoutState> | null) {
    state.name = saved?.name || 'Layout';
    state.page = saved?.page && PAGES[saved.page] ? saved.page : 'a4-portrait';
    state.template = saved?.template ?? blank(state.page);
    nameInput.value = state.name;
    pageSelect.value = state.page;
    mount();
    history = layoutHistory(state);
    syncHistoryButtons();
  },
  snapshot: (): LayoutState => JSON.parse(JSON.stringify(state)),
  onChange(fn: () => void) {
    listeners.push(fn);
  },
  setName(name: string) {
    state.name = name;
    nameInput.value = name;
    notify();
  },
  setPage(page: string) {
    if (!PAGES[page]) throw new Error('Choose a page: ' + Object.keys(PAGES).join(', ') + '.');
    pageSelect.value = page;
    pageSelect.dispatchEvent(new Event('change'));
  },
  /** Append a text block to the first page (millimetres from the top-left). */
  addText(field: { name?: string; text: string; x: number; y: number; width: number; height: number; fontSize?: number; align?: string; pageIndex?: number }) {
    validateLayoutEdit({ ...field, op: 'add-text' });
    const pageIndex = field.pageIndex ?? 0;
    const page = state.template.schemas[pageIndex];
    if (!page) throw Error('Inspect the layout for an existing page index.');
    if (page.length >= 500) throw Error('This page already has 500 blocks.');
    const all = state.template.schemas.flat();
    let suffix = all.length + 1;
    while (all.some(s => s.name === `text_${suffix}`)) suffix++;
    const name = field.name || `text_${suffix}`;
    if (all.some((s) => s.name === name)) throw new Error(`A block named ${name} exists already.`);
    const block = {
      name,
      type: 'text',
      content: field.text,
      position: { x: field.x, y: field.y },
      width: field.width,
      height: field.height,
      fontSize: field.fontSize ?? 14,
      alignment: field.align ?? 'left',
      verticalAlignment: 'top',
    };
    state.template = { ...state.template, schemas: state.template.schemas.map((p, i) => i === pageIndex ? [...p, block] : p) };
    designer?.updateTemplate(state.template);
    notify();
    return block;
  },
  addPage() {
    if (state.template.schemas.length >= 100) throw Error('This layout already has 100 pages.');
    state.template = { ...state.template, schemas: [...state.template.schemas, []] };
    designer?.updateTemplate(state.template);
    notify();
    return { pageIndex: state.template.schemas.length - 1 };
  },
  updateBlock(edit: Record<string, unknown>) {
    validateLayoutEdit({ ...edit, op: 'update-block' });
    const pageIndex = Number(edit.pageIndex ?? 0);
    const page = state.template.schemas[pageIndex];
    const block = page?.find(b => b.name === edit.name);
    if (!block) throw Error('Inspect this page for an existing named block.');
    if (block.type !== 'text' && ['text', 'fontSize', 'align'].some(k => edit[k] !== undefined)) throw Error('Text, font size and alignment require a text block.');
    const updated: typeof block & Record<string, unknown> = { ...block, position: { x: edit.x === undefined ? block.position.x : Number(edit.x), y: edit.y === undefined ? block.position.y : Number(edit.y) } };
    for (const k of ['width', 'height', 'fontSize']) if (edit[k] !== undefined) updated[k] = edit[k];
    if (edit.text !== undefined) updated.content = String(edit.text);
    if (edit.align !== undefined) updated.alignment = edit.align;
    state.template = { ...state.template, schemas: state.template.schemas.map((p, i) => i === pageIndex ? p.map(b => b === block ? updated : b) : p) };
    designer?.updateTemplate(state.template);
    notify();
  },
  preview: showPreview,
  pdf,
  async png(pageIndex = 0): Promise<ArrayBuffer> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= state.template.schemas.length) throw Error('Choose an existing page index.');
    const [first] = await pdf2img(await pdf(), { range: { start: pageIndex, end: pageIndex + 1 }, scale: 2 });
    if (!first) throw new Error('The layout has no page.');
    return first;
  },
  ready: () => !!designer,
};
(window as unknown as { layout: typeof layout }).layout = layout;

if (parent === window) {
  const KEY = 'pdfme.layout';
  let saved: Partial<LayoutState> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    saved = null;
  }
  layout.load(saved);
  layout.onChange(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: the session still works */
    }
  });
} else attach(layout);
