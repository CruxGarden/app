import { toolInfos } from '@/services/crux-tools/registry';

/** Identity travels in Crux metadata; version/scope/notices are read from its own Artifacts. */
export interface ToolInfo {
  name: string;
  upstream: string;
  relationship: string;
  detailsPath: string;
}
const native = (name: string, repo: string, detailsPath = 'UPSTREAM.md'): ToolInfo => ({
  name,
  upstream: `https://github.com/${repo}`,
  detailsPath,
  relationship: `Built with ${name}. Crux Garden adapts its editor for local projects, Growth and Collaboration.`,
});
const component = (name: string, repo: string, relationship: string): ToolInfo => ({
  name,
  upstream: `https://github.com/${repo}`,
  relationship,
  detailsPath: 'README.md',
});
/** The app's own entries; every Crux Tool's provenance comes from its manifest (ADR 0050). */
export const TOOL_INFO: Record<string, ToolInfo> = {
  notes: native('Tigrana', 'downcastsystems/tigrana'),
  moqira: native('Moqira', 'downcastsystems/moqira'),
  'digital-garden': {
    name: 'Veka',
    upstream: 'https://github.com/masmuss/veka',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A digital garden on the Veka theme (MIT) as an Astro Site Crux: the theme’s components and pages are upstream’s; the settings file, offline fonts, the link index, backlinks and the graph are Crux Garden’s.',
  },
  resume: {
    name: 'astro-resume',
    upstream: 'https://github.com/EmaSuriano/astro-resume',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A one-page resume on Ema Suriano’s astro-resume (MIT) as an Astro Site Crux: the layout, print rules and theme toggle are upstream’s; the Markdown scaffold, and replacing the Playwright-driven PDF build with the browser’s own print, are Crux Garden’s.',
  },
  'business-page': {
    name: 'Foxi',
    upstream: 'https://github.com/oxygenna-themes/foxi-astro-theme',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A business site on the Foxi theme (MIT) by Oxygenna, as an Astro Site Crux: the design, blocks and layouts are upstream’s; the settings file, the content written as a business rather than a fictional product, and the removal of the analytics are Crux Garden’s. Oxygenna sell Foxi Pro, a larger version of this design — see UPSTREAM.md.',
  },
  'photo-gallery': {
    name: 'astro-photo-folio',
    upstream: 'https://github.com/XD-QIN/astro-photo-folio',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A photography gallery on the astro-photo-folio theme (MIT) as an Astro Site Crux: the galleries, lightbox, calendar and their strict-CSP decisions are upstream’s; the settings file, the single journal in place of two blogs, and the relative-until-shared site URL are Crux Garden’s.',
  },
  onebigsky: {
    ...native('One Big Sky', 'downcastsystems/onebigsky'),
    relationship: 'Built with One Big Sky. Garden packages the game and editable source as a Crux.',
  },
  'cardinal-drone': component(
    'Cardinal',
    'DISTRHO/Cardinal',
    'A custom Garden instrument powered by Cardinal. The instrument controls and Garden integration are separate from the upstream modular audio engine.',
  ),
  'tool-excalidraw': component(
    'Excalidraw',
    'excalidraw/excalidraw',
    'Built with the native Excalidraw editor component in a Garden workspace.',
  ),
  'tool-univer': component(
    'Univer',
    'dream-num/univer',
    'Built with the open-source Univer Sheets editor component in a Garden workspace.',
  ),
  'tool-tables': component(
    'Tabulator',
    'olifolkerd/tabulator',
    'A custom Garden table editor built with Tabulator.',
  ),
  'tool-smplr': component(
    'smplr',
    'danigb/smplr',
    'A custom Garden sampler and sequencer built with smplr and credited sample recordings.',
  ),
  'tool-playcanvas': component(
    'PlayCanvas Engine',
    'playcanvas/engine',
    'A custom Garden scene workshop built with PlayCanvas Engine. This is the engine demonstration; the PlayCanvas Editor integration is separate.',
  ),
  'tool-openmosh': component(
    'OpenMosh sampler',
    'zivavu/OpenMosh',
    'An older custom Garden effects sampler inspired by OpenMosh. The native OpenMosh app is a separate Crux template.',
  ),
  ...toolInfos(),
};
export function toolInfo(meta?: Record<string, unknown>): ToolInfo | null {
  const value = meta?.toolInfo as Partial<ToolInfo> | undefined;
  if (
    value &&
    typeof value.name === 'string' &&
    typeof value.relationship === 'string' &&
    typeof value.detailsPath === 'string' &&
    !/(^\/|\\|(^|\/)\.\.(\/|$))/.test(value.detailsPath) &&
    typeof value.upstream === 'string' &&
    /^https:\/\/[^\s]+$/.test(value.upstream)
  )
    return value as ToolInfo;
  return typeof meta?.template === 'string'
    ? Object.hasOwn(TOOL_INFO, meta.template)
      ? (TOOL_INFO[meta.template] ?? null)
      : null
    : null;
}
export function isToolNotice(path: string) {
  return (
    /(^|\/)([^/]*licen[sc]e[^/]*|copying[^/]*|[^/]*notices?[^/]*|copyright[^/]*|credits[^/]*|authors[^/]*|attributions?[^/]*|ofl\.txt)$/i.test(
      path,
    ) &&
    !/\.(js|ts|json|map|png|svg|html|css|wasm)$/i.test(path) &&
    !path.includes('/node_modules/')
  );
}
