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
const notify = () => listeners.forEach((fn) => fn());
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
  addText(field: { name?: string; text: string; x: number; y: number; width: number; height: number; fontSize?: number; align?: string }) {
    const page = state.template.schemas[0] ?? [];
    const name = field.name || `text_${page.length + 1}`;
    if (page.some((s) => s.name === name)) throw new Error(`A block named ${name} exists already.`);
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
    state.template = { ...state.template, schemas: [[...page, block], ...state.template.schemas.slice(1)] };
    designer?.updateTemplate(state.template);
    notify();
    return block;
  },
  preview: showPreview,
  pdf,
  async png(): Promise<ArrayBuffer> {
    const [first] = await pdf2img(await pdf(), { range: { start: 0, end: 1 }, scale: 2 });
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
