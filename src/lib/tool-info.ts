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
  notes: native('Tigrana', 'downcastsystems/tigrana', 'README.md'),
  moqira: native('Moqira', 'downcastsystems/moqira', 'README.md'),
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
