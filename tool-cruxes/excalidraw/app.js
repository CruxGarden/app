// SPDX-License-Identifier: MIT
import {
  React,
  createRoot,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from './vendor/engine.js';
import { $, message, download, openProject } from './shared/session.js';
import { inspectProductivity } from './shared/productivity.js';
$('#app').innerHTML =
  '<div class="tool-actions actions"><button id="export-png">Export PNG</button><button id="export-svg">Export SVG</button><button id="export-project">Export drawing</button><p>Draw, type, or drop a raster image. Your drawing and images save in this Crux.</p></div><div id="editor"></div>';
let api,
  session,
  applying = false;
let lastScene = '';
const storedAssets = new Map();
async function capture() {
  if (!api || applying) return;
  const elements = structuredClone(api.getSceneElementsIncludingDeleted());
  const files = api.getFiles();
  const assets = {};
  for (const e of elements.filter((e) => e.type === 'image' && !e.isDeleted)) {
    const file = files[e.fileId];
    if (!file) throw new Error('An image is still loading. Try saving again.');
    if (!storedAssets.has(file.dataURL)) {
      if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(file.dataURL))
        throw new Error('Use PNG, JPEG, WebP or GIF images.');
      const blob = await (await fetch(file.dataURL)).blob();
      const path = await session.importImage(new File([blob], 'image', { type: blob.type }));
      storedAssets.set(file.dataURL, path);
    }
    assets[e.fileId] = storedAssets.get(file.dataURL);
  }
  const state = api.getAppState();
  const scene = {
    elements,
    assets,
    appState: { viewBackgroundColor: state.viewBackgroundColor, gridSize: state.gridSize },
  };
  lastScene = JSON.stringify(scene);
  if (lastScene !== JSON.stringify(session.doc.scene))
    await session.update(
      (d) => {
        d.scene = scene;
      },
      { render: false, autosave: false },
    );
}
async function render(doc, { reload = false } = {}) {
  if (!reload && lastScene === JSON.stringify(doc.scene)) return;
  applying = true;
  try {
    const files = [];
    for (const [id, path] of Object.entries(doc.scene.assets)) {
      const response = await fetch('data/' + path);
      if (!response.ok) throw new Error('A saved image is missing: ' + path);
      const dataURL = await response.blob().then(
        (blob) =>
          new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
          }),
      );
      storedAssets.set(dataURL, path);
      files.push({ id, dataURL, mimeType: dataURL.slice(5, dataURL.indexOf(';')), created: 1 });
    }
    if (!api) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('The drawing did not finish opening. Reload the app.')),
          15000,
        );
        let initialized = false;
        createRoot($('#editor')).render(
          React.createElement(Excalidraw, {
            initialData: {
              elements: doc.scene.elements,
              appState: doc.scene.appState,
              files: Object.fromEntries(files.map((f) => [f.id, f])),
              scrollToContent: true,
            },
            excalidrawAPI: (value) => {
              api = value;
            },
            UIOptions: {
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                saveAsImage: false,
              },
            },
            onChange: (elements, state) => {
              if (!initialized) {
                if (doc.scene.elements.every((e) => elements.some((v) => v.id === e.id))) {
                  initialized = true;
                  clearTimeout(timeout);
                  resolve();
                }
                return;
              }
              if (!session || applying) return;
              const previous = session.doc.scene;
              if (
                JSON.stringify(elements) !== JSON.stringify(previous.elements) ||
                state.viewBackgroundColor !== previous.appState.viewBackgroundColor ||
                state.gridSize !== previous.appState.gridSize
              )
                session.changed();
            },
          }),
        );
      });
    } else {
      api.addFiles(files);
      api.updateScene({ elements: doc.scene.elements, appState: doc.scene.appState });
    }
    lastScene = JSON.stringify(doc.scene);
    $('#editor').dataset.ready = 'true';
  } finally {
    applying = false;
  }
}
try {
  session = await openProject('excalidraw', render, () => {}, {
    capture,
    inspect: inspectProductivity,
  });
} catch (e) {
  message(e);
}
for (const kind of ['png', 'svg', 'project'])
  $(`#export-${kind}`).onclick = async () => {
    try {
      await session.save();
      const options = {
        elements: api.getSceneElements(),
        appState: { ...api.getAppState(), exportBackground: true },
        files: api.getFiles(),
      };
      if (kind === 'png')
        download(await exportToBlob({ ...options, mimeType: 'image/png' }), 'drawing.png');
      else if (kind === 'svg')
        download(
          new Blob([(await exportToSvg(options)).outerHTML], { type: 'image/svg+xml' }),
          'drawing.svg',
        );
      else
        download(
          new Blob([serializeAsJSON(options.elements, options.appState, options.files, 'local')], {
            type: 'application/json',
          }),
          'drawing.excalidraw',
        );
    } catch (e) {
      message(e);
    }
  };
