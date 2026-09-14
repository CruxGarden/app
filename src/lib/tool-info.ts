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
export const TOOL_INFO: Record<string, ToolInfo> = {
  notes: native('Tigrana', 'downcastsystems/tigrana'),
  moqira: native('Moqira', 'downcastsystems/moqira'),
  'minipaint-app': native('miniPaint', 'viliusle/miniPaint'),
  'openmosh-app': native('OpenMosh', 'zivavu/OpenMosh'),
  'audiomass-app': native('AudioMass', 'pkalogiros/AudioMass'),
  'bitsy-app': native('Bitsy', 'le-doux/bitsy'),
  'mermaid-app': native('Mermaid Live Editor', 'mermaid-js/mermaid-live-editor'),
  'piskel-app': native('Piskel', 'piskelapp/piskel'),
  'rawgraphs-app': native('RAWGraphs', 'rawgraphs/rawgraphs-app'),
  'gephi-app': native('Gephi Lite', 'gephi/gephi-lite'),
  'ketcher-app': native('Ketcher', 'epam/ketcher'),
  'twine-app': native('Twine', 'klembot/twinejs'),
  'opencut-app': native('OpenCut Classic', 'opencut-app/opencut-classic'),
  'kan-app': native('Kan', 'kanbn/kan'),
  'web-synth-app': native('web-synth', 'Ameobea/web-synth'),
  'beepbox-app': native('BeepBox', 'johnnesky/beepbox'),
  'hextris-app': native('Hextris', 'Hextris/hextris'),
  'pptist-app': native('PPTist', 'pipipi-pikachu/PPTist'),
  'wick-editor-app': native('Wick Editor', 'Wicklets/wick-editor'),
  'bentopdf-app': native('BentoPDF', 'alam00000/bentopdf'),
  'recorder-app': {
    name: 'Record',
    upstream: 'https://github.com/addyosmani/recorder',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'The actual Record app, unchanged; the Garden bridge keeps its recordings as outputs of the Crux.',
  },
  'maps-app': {
    name: 'MapLibre GL + Terra Draw',
    upstream: 'https://github.com/maplibre/maplibre-gl-js',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A map tool around MapLibre GL and Terra Draw with OpenFreeMap tiles. Rendering and drawing are upstream’s; the page, the places list, the Garden integration and the public map are Crux Garden’s.',
  },
  'p5-app': {
    name: 'p5.js',
    upstream: 'https://github.com/processing/p5.js',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A creative-coding tool around p5.js. The library is upstream’s, unmodified; the page, the starter sketch, the Garden integration and the outputs are Crux Garden’s.',
  },
  'digital-garden': {
    name: 'Veka',
    upstream: 'https://github.com/masmuss/veka',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A digital garden on the Veka theme (MIT) as an Astro Site Crux: the theme’s components and pages are upstream’s; the settings file, offline fonts, the link index, backlinks and the graph are Crux Garden’s.',
  },
  'glsl-app': {
    name: 'glslEditor',
    upstream: 'https://github.com/patriciogonzalezvivo/glslEditor',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A shader tool around glslEditor (The Book of Shaders’ editor, glslCanvas inside). The editor and its canvas are upstream’s, unmodified; the page, the Garden integration and the outputs are Crux Garden’s.',
  },
  'pdfme-app': {
    name: 'pdfme',
    upstream: 'https://github.com/pdfme/pdfme',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A page layout tool around pdfme. The designer, viewer and PDF generator are upstream’s; the page, the Garden integration and the outputs are Crux Garden’s.',
  },
  'formjs-app': {
    name: 'form-js',
    upstream: 'https://github.com/bpmn-io/form-js',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A form builder around form-js (bpmn.io). The builder and viewer are upstream’s; the page, the Garden integration and the public edition with Crux Store answers are Crux Garden’s.',
  },
  'eventcalendar-app': {
    name: 'EventCalendar',
    upstream: 'https://github.com/vkurko/calendar',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'A calendar organizer around the EventCalendar component. The calendar is upstream’s; the event form and Garden integration are Crux Garden’s.',
  },
  'am-1-app': {
    name: 'AM-1',
    upstream: 'https://github.com/zacos-tech',
    detailsPath: 'UPSTREAM.md',
    relationship:
      'Daniel’s AM-1 Arpeggio Machine from the ZACOS line, packaged as written with its source and notes.',
  },
  'underrun-app': native('Underrun', 'phoboslab/underrun'),
  'playcanvas-editor-app': native('PlayCanvas Editor', 'playcanvas/editor'),
  'blockbench-app': native('Blockbench', 'JannisX11/blockbench'),
  'gdevelop-app': native('GDevelop', '4ian/GDevelop'),
  'svgedit-app': native('SVG-Edit', 'SVG-Edit/svgedit'),
  'jupyterlite-app': native('JupyterLite', 'jupyterlite/jupyterlite'),
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
