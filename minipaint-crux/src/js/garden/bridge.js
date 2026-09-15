import { createStateGuard } from '../../../garden/freshness.js';
import { BLEND_MODES, compositionPlan } from '../../../garden/compositing.js';
import {
  brushLayer,
  revisedFilters,
  duplicateLayer,
  cropLayers,
  FILTER_BOUNDS,
} from '../../../garden/editing.js';
import { validateProject } from '../../../garden/model.js';
import { validateCommand, textData, reviseText } from '../../../garden/commands.js';
import { loadProjectImage } from '../../../garden/shared/project-image.js';
import { createCommandSession } from '../../../garden/shared/command-session.js';
import {
  rasterGeometry,
  rasterSelection,
  rasterSeed,
  fillPixels,
  eraseStroke,
} from '../../../garden/raster.js';

export async function startGarden(app) {
  if (parent === window) return;
  let origin;
  let expected = null;
  let revision = 0,
    saved = 0,
    hydrating = true;
  let timer,
    tail = Promise.resolve();
  const pending = new Map();
  const actions = new Set();
  const rasterCache = new Map();
  const rasterPaths = new Map();
  let nativeBusy = false;
  let nativeEpoch = 0;
  const activePointers = new Set();
  const bar = document.createElement('div');
  bar.id = 'garden-project';
  bar.innerHTML =
    '<span role="status">Opening Garden project…</span><button>Save project</button><button>Reload saved project</button><input aria-label="Output name" value="Image"><button>Save image to Cruxspace</button>';
  const style = document.createElement('style');
  style.textContent =
    '#garden-project{position:fixed;bottom:0;left:0;right:0;height:32px;z-index:10000;display:flex;gap:12px;align-items:center;padding:0 10px;background:#24282c;color:#fff;font:12px system-ui}#garden-project span{flex:1}#garden-project button{padding:3px 8px;color:#fff;background:#42494f;border:1px solid #697078;border-radius:3px}#garden-project input{width:120px;padding:3px 6px;color:#fff;background:#151515;border:1px solid #697078;border-radius:3px;font:11px system-ui}.wrapper{bottom:34px!important}';
  document.head.append(style);
  document.body.append(bar);
  const workspace = document.querySelector('.wrapper');
  workspace.inert = true;
  const status = bar.querySelector('span');
  const show = (text) => {
    status.textContent = text;
  };
  const send = (value) =>
    parent.postMessage(
      { type: 'crux:app', id: crypto.randomUUID(), ...value },
      origin && origin !== 'null' ? origin : '*',
    );
  const call = (value) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Garden did not confirm the save. Your draft is still open.'));
      }, 60000);
      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      send({ ...value, id });
    });
  function dirty() {
    if (hydrating) return;
    revision++;
    send({ op: 'dirty', dirty: true });
    show('Unsaved changes');
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), 800);
  }
  // Track asynchronous native actions, including undo/redo and JSON imports.
  for (const name of ['do_action', 'undo_action', 'redo_action']) {
    const original = app.State[name].bind(app.State);
    app.State[name] = (...args) => {
      // Native gestures read the newly inserted layer immediately after do_action.
      // Observe completion without deferring the action's synchronous first steps.
      const operation = Promise.resolve(original(...args));
      actions.add(operation);
      operation.then(
        () => {
          actions.delete(operation);
          nativeEpoch++;
          dirty();
        },
        () => {
          actions.delete(operation);
          nativeEpoch++;
          dirty();
        },
      );
      return operation;
    };
  }
  async function settle() {
    while (actions.size) await Promise.all([...actions]);
  }
  const selectionTool = () => app.GUI.GUI_tools.tools_modules.selection.object;
  const selectedRegion = (id) => {
    if (app.Config.TOOL.name !== 'selection' || app.Config.layer?.id !== id) return null;
    const region = selectionTool().selection;
    return region.width > 0 && region.height > 0 ? { ...region } : null;
  };
  const stateGuard = createStateGuard(() => ({
    config: app.Config,
    history: app.State,
    epoch: nativeEpoch,
    selection: selectedRegion(app.Config.layer?.id),
  }));
  // A native transaction can await image storage/decoding. Prevent the person's
  // input from entering that short transaction; the host Collaboration stays usable.
  for (const event of [
    'pointerdown',
    'pointerup',
    'pointermove',
    'mousedown',
    'mouseup',
    'mousemove',
    'keydown',
    'keyup',
    'wheel',
    'input',
    'change',
  ])
    document.addEventListener(
      event,
      (e) => {
        if (nativeBusy && e.isTrusted) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      { capture: true, passive: false },
    );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (workspace.contains(e.target)) activePointers.add(e.pointerId);
    },
    true,
  );
  const releasePointer = (e) => activePointers.delete(e.pointerId);
  document.addEventListener('pointerup', releasePointer, true);
  document.addEventListener('pointercancel', releasePointer, true);
  async function exclusiveNative(operation) {
    const wasInert = workspace.inert;
    nativeBusy = true;
    workspace.inert = true;
    try {
      return await operation();
    } finally {
      nativeBusy = false;
      workspace.inert = wasInert;
    }
  }
  async function capture() {
    const project = JSON.parse(app.FileSave.export_as_json());
    const used = new Set();
    for (const image of project.data) {
      const data = image.data;
      used.add(data);
      let ref = rasterCache.get(data);
      if (!ref) {
        const blob = await (await fetch(data)).blob();
        const imported = await call({
          op: 'native-import',
          bytes: await blob.arrayBuffer(),
          mimeType: blob.type,
        });
        ref = {
          __cruxBinary: { path: imported.path, kind: 'blob', type: blob.type, size: blob.size },
        };
        rasterCache.set(data, ref);
      }
      image.data = ref;
      rasterPaths.set(image.id, 'data/' + ref.__cruxBinary.path);
    }
    for (const key of rasterCache.keys()) if (!used.has(key)) rasterCache.delete(key);
    const result = { version: 1, app: 'minipaint', project };
    validateProject(result);
    return result;
  }
  function save() {
    const operation = tail.then(async () => {
      clearTimeout(timer);
      await settle();
      app.Layers.render(true);
      if (hydrating) throw new Error('Wait for the saved project to finish opening.');
      if (revision === saved) return;
      const saving = revision;
      try {
        show('Saving project…');
        const doc = await capture();
        const result = await call({
          op: 'write',
          path: 'project.json',
          expected,
          content: JSON.stringify(doc),
        });
        expected = result.fingerprint;
        saved = saving;
        send({ op: 'dirty', dirty: revision !== saved });
        show(revision === saved ? 'Saved to Garden' : 'Unsaved changes');
      } catch (error) {
        show(error.message);
        throw error;
      }
    });
    tail = operation.catch(() => {});
    return operation;
  }
  const inspect = (value = {}) => {
    const offset = value.offset ?? 0;
    const limit = value.limit ?? 20;
    const layers = [...app.Config.layers].sort((a, b) => a.order - b.order);
    return {
      stateToken: stateGuard.current(),
      width: app.Config.WIDTH,
      height: app.Config.HEIGHT,
      selectedLayer: app.Config.layer?.id,
      activeTool: app.Config.TOOL.name,
      selection: selectedRegion(app.Config.layer?.id),
      history: { canUndo: app.State.can_undo(), canRedo: app.State.can_redo() },
      availableFilters: FILTER_BOUNDS,
      availableCompositions: BLEND_MODES,
      totalLayers: layers.length,
      offset,
      nextOffset: offset + limit < layers.length ? offset + limit : null,
      layers: layers.slice(offset, offset + limit).map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        opacity: layer.opacity,
        composition: layer.composition,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotate: layer.rotate,
        order: layer.order,
        filters: (layer.filters ?? []).slice(0, 100).map((filter) => ({
          id: Number(filter.id),
          name: filter.name,
          params: filter.params,
        })),
        ...(layer.type === 'brush'
          ? { strokeCount: layer.data?.length, color: layer.color, brushSize: layer.params?.size }
          : {}),
        ...(layer.type === 'text'
          ? {
              text: layer.data
                ?.map((line) => line.map((span) => span.text).join(''))
                .join('\n')
                .slice(0, 4000),
              style: layer.data?.[0]?.[0]?.meta,
            }
          : {}),
        ...(layer.type === 'image'
          ? {
              imagePath: rasterPaths.get(layer.id),
              originalWidth: layer.width_original,
              originalHeight: layer.height_original,
            }
          : {}),
      })),
    };
  };
  /** Render every visible layer to one PNG and save it as a named output of this Crux. */
  async function saveImage(label) {
    await save();
    const canvas = document.createElement('canvas');
    canvas.width = app.Config.WIDTH;
    canvas.height = app.Config.HEIGHT;
    app.Layers.convert_layers_to_canvas(canvas.getContext('2d'), null, false);
    const output = await call({ op: 'save-output', label, content: canvas.toDataURL('image/png') });
    show('Image saved to Cruxspace');
    return { ...output, width: canvas.width, height: canvas.height };
  }
  const findLayer = (id) => {
    const layer = app.Config.layers.find((item) => item.id === id);
    if (!layer) throw new Error('Layer no longer exists. Inspect miniPaint again.');
    return layer;
  };
  function layerSettings(layer, value) {
    const settings = {};
    for (const key of [
      'name',
      'visible',
      'opacity',
      'composition',
      'x',
      'y',
      'width',
      'height',
      'rotate',
    ])
      if (value[key] !== undefined) settings[key] = value[key];
    const textEdit = ['find', 'fontSize', 'fontFamily'].some((key) => value[key] !== undefined);
    if (textEdit && layer.type !== 'text')
      throw new Error('Text and font edits require a text layer.');
    if (layer.type === 'text' && (textEdit || value.color !== undefined))
      settings.data = reviseText(layer.data, value);
    else if (value.color !== undefined) {
      if (layer.type !== 'rectangle')
        throw new Error('Color edits support text and rectangles; use opacity for images.');
      settings.params = { ...layer.params, fill_color: value.color };
    }
    return settings;
  }
  async function nativeEdit(label, actions) {
    const result = await exclusiveNative(() =>
      app.State.do_action(
        new app.Actions.Bundle_action('garden_edit', label, [
          new app.Actions.Refresh_layers_gui_action('undo'),
          ...actions,
          new app.Actions.Refresh_layers_gui_action('do'),
        ]),
      ),
    );
    if (result.status !== 'completed')
      throw new Error('The native edit could not be completed. Inspect before retrying.');
  }
  const commands = createCommandSession({
    async settle() {
      if (hydrating) throw new Error('Wait for the image editor to finish opening.');
      // miniPaint commits a person's text Undo action when its native input loses focus.
      const input = document.activeElement;
      if (
        input instanceof HTMLElement &&
        !bar.contains(input) &&
        input.matches('input,textarea,select,[contenteditable=true]')
      )
        input.blur();
      await settle();
      app.Layers.render(true);
    },
    async save() {
      do {
        await save();
      } while (revision !== saved || actions.size);
    },
    prepare(raw) {
      const value = validateCommand(raw);
      const preparedState = stateGuard.current();
      const checkDraft = () => {
        if (
          activePointers.size ||
          nativeBusy ||
          app.Config.layers.some((layer) => layer.status === 'draft' || layer.link_canvas) ||
          [...document.querySelectorAll('#popups .popup')].some(
            (popup) => popup.getClientRects().length,
          )
        )
          throw new Error(
            'Finish the current drawing or close the native dialog before using an agent tool.',
          );
      };
      checkDraft();
      if (value.op === 'inspect') return { mutates: false, apply: () => inspect(value) };
      if (value.expectedState !== undefined || app.Config.layers.some((layer) => layer.type))
        stateGuard.require(value.expectedState);
      const checkFresh = () => {
        checkDraft();
        stateGuard.require(preparedState);
      };
      if (value.op === 'save-image')
        return {
          mutates: true,
          apply: () => {
            checkFresh();
            return saveImage(value.label.trim());
          },
          result: (output) => ({ ...output, stateToken: stateGuard.current() }),
        };
      if (value.id !== undefined) {
        const layer = findLayer(value.id);
        if (value.op === 'layer') layerSettings(layer, value);
        if (value.op === 'delete-layer' && app.Config.layers.length <= 1)
          throw new Error('Keep at least one layer.');
        if (value.op === 'reorder-layer') {
          const target =
            value.direction === 'up'
              ? app.Layers.find_next(value.id)
              : app.Layers.find_previous(value.id);
          if (!target) throw new Error('The layer is already at that edge of the stack.');
        }
      }
      const composite = ['rasterize-layer', 'merge-layers'].includes(value.op)
        ? compositionPlan(app.Config, value)
        : null;
      if (value.op === 'edit-filter') revisedFilters(findLayer(value.id), value);
      if (value.op === 'crop-canvas') cropLayers(app.Config, value);
      if (['selection', 'erase', 'fill'].includes(value.op)) {
        const layer = findLayer(value.id);
        rasterGeometry(layer);
        if (value.op === 'selection') {
          if (value.action === 'set') rasterSelection(layer, value);
          else if (!selectedRegion(value.id))
            throw new Error('There is no selection on this layer.');
        } else if (value.mode === 'selection') rasterSelection(layer, selectedRegion(value.id));
        else if (value.op === 'fill') rasterSeed(layer, value);
      }
      if (
        value.op === 'history' &&
        !(value.direction === 'undo' ? app.State.can_undo() : app.State.can_redo())
      )
        throw new Error(`Nothing to ${value.direction}. Native history is session-local.`);
      if (
        (value.op.startsWith('add-') || value.op === 'duplicate-layer') &&
        app.Config.layers.length >= 500
      )
        throw new Error('Use up to 500 layers.');
      return {
        mutates: true,
        async apply() {
          checkFresh();
          if (composite) {
            const canvas = document.createElement('canvas');
            canvas.width = composite.width;
            canvas.height = composite.height;
            const ctx = canvas.getContext('2d');
            const rasterize = value.op === 'rasterize-layer';
            const original = composite.layers[0];
            app.Layers.render_success = true;
            if (rasterize) {
              // render_object bakes geometry/filters, but not layer opacity/composition.
              app.Layers.render_object(ctx, { ...original, visible: true });
            } else if (value.mode === 'visible') {
              app.Layers.convert_layers_to_canvas(ctx, null, false);
            } else {
              for (const layer of composite.layers) {
                ctx.globalAlpha = layer.opacity / 100;
                ctx.globalCompositeOperation = 'source-over';
                app.Layers.render_object(ctx, layer);
              }
            }
            if (!app.Layers.render_success)
              throw new Error('Native layer rendering failed. No layers were replaced.');
            const link = new Image();
            link.src = canvas.toDataURL('image/png');
            await link.decode();
            checkFresh();
            await nativeEdit(rasterize ? 'Rasterize Layer' : 'Merge Layers', [
              new app.Actions.Insert_layer_action(
                {
                  type: 'image',
                  is_vector: false,
                  link,
                  name: value.name || (rasterize ? original.name + ' (raster)' : 'Merged layers'),
                  x: 0,
                  y: 0,
                  width: canvas.width,
                  height: canvas.height,
                  width_original: canvas.width,
                  height_original: canvas.height,
                  order: composite.order,
                  opacity: rasterize ? original.opacity : 100,
                  composition: rasterize ? original.composition : 'source-over',
                  visible: rasterize ? original.visible : true,
                },
                false,
              ),
              ...composite.layers.map((layer) => new app.Actions.Delete_layer_action(layer.id)),
            ]);
            return app.Config.layer.id;
          } else if (value.op === 'selection') {
            const edits = [];
            if (app.Config.layer.id !== value.id)
              edits.push(new app.Actions.Select_layer_action(value.id));
            if (app.Config.TOOL.name !== 'selection')
              edits.push(new app.Actions.Activate_tool_action('selection'));
            edits.push(
              value.action === 'set'
                ? new app.Actions.Set_selection_action(value.x, value.y, value.width, value.height)
                : new app.Actions.Reset_selection_action(selectionTool().selection),
            );
            await nativeEdit('Select Image Region', edits);
          } else if (value.op === 'erase' || value.op === 'fill') {
            const layer = findLayer(value.id);
            const canvas = document.createElement('canvas');
            canvas.width = layer.width_original;
            canvas.height = layer.height_original;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(layer.link, 0, 0);
            const region =
              value.mode === 'selection' ? rasterSelection(layer, selectedRegion(value.id)) : null;
            if (value.op === 'erase') {
              if (region) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.globalAlpha = (value.opacity ?? 100) / 100;
                ctx.fillRect(region.x, region.y, region.width, region.height);
              } else eraseStroke(ctx, layer, value);
            } else {
              const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
              fillPixels(
                pixels,
                region ? null : rasterSeed(layer, value),
                value.color,
                value.opacity ?? 100,
                value.tolerance ?? 0,
                value.mode === 'global',
                region,
              );
              ctx.putImageData(pixels, 0, 0);
            }
            await nativeEdit(value.op === 'erase' ? 'Erase Image Pixels' : 'Fill Image Pixels', [
              new app.Actions.Update_layer_image_action(canvas, value.id),
            ]);
          } else if (value.op === 'add-brush' || value.op === 'duplicate-layer') {
            const layer =
              value.op === 'add-brush'
                ? brushLayer(value)
                : duplicateLayer(findLayer(value.id), value.name);
            if (layer.type === 'image') {
              // Garden imports release their temporary blob URL after decoding. Cloning
              // that URL cannot reload it; copy the native decoded pixels instead.
              const canvas = document.createElement('canvas');
              canvas.width = layer.width_original;
              canvas.height = layer.height_original;
              canvas.getContext('2d').drawImage(findLayer(value.id).link, 0, 0);
              layer.link.src = canvas.toDataURL('image/png');
              await layer.link.decode();
              checkFresh();
            }
            await nativeEdit(value.op === 'add-brush' ? 'Paint Brush Stroke' : 'Duplicate Layer', [
              new app.Actions.Insert_layer_action(layer, false),
            ]);
            return app.Config.layer.id;
          } else if (value.op === 'edit-filter') {
            await nativeEdit('Edit Live Filter', [
              new app.Actions.Update_layer_action(value.id, {
                filters: revisedFilters(findLayer(value.id), value),
              }),
            ]);
          } else if (value.op === 'crop-canvas') {
            const edits = cropLayers(app.Config, value);
            await nativeEdit('Crop Canvas', [
              new app.Actions.Prepare_canvas_action('undo'),
              ...edits.map(({ id, settings }) => new app.Actions.Update_layer_action(id, settings)),
              new app.Actions.Update_config_action({ WIDTH: value.width, HEIGHT: value.height }),
              new app.Actions.Prepare_canvas_action('do'),
            ]);
          } else if (value.op === 'history') {
            await exclusiveNative(() =>
              app.State[value.direction === 'undo' ? 'undo_action' : 'redo_action'](),
            );
          } else if (value.op === 'layer') {
            await nativeEdit('Update Layer', [
              new app.Actions.Update_layer_action(
                value.id,
                layerSettings(findLayer(value.id), value),
              ),
            ]);
          } else if (value.op === 'delete-layer') {
            if (app.Config.layers.length <= 1) throw new Error('Keep at least one layer.');
            await nativeEdit('Delete Layer', [new app.Actions.Delete_layer_action(value.id)]);
          } else if (value.op === 'reorder-layer') {
            await nativeEdit('Reorder Layer', [
              new app.Actions.Reorder_layer_action(value.id, value.direction === 'up' ? 1 : -1),
            ]);
          } else if (value.op === 'resize-canvas') {
            const edits = [
              new app.Actions.Prepare_canvas_action('undo'),
              new app.Actions.Update_config_action({ WIDTH: value.width, HEIGHT: value.height }),
            ];
            if (value.scaleLayers) {
              const sx = value.width / app.Config.WIDTH;
              const sy = value.height / app.Config.HEIGHT;
              for (const layer of app.Config.layers) {
                const settings = {};
                for (const key of ['x', 'width'])
                  if (Number.isFinite(layer[key])) settings[key] = layer[key] * sx;
                for (const key of ['y', 'height'])
                  if (Number.isFinite(layer[key])) settings[key] = layer[key] * sy;
                if (layer.type === 'text') {
                  settings.data = JSON.parse(JSON.stringify(layer.data));
                  for (const line of settings.data)
                    for (const span of line)
                      span.meta = {
                        ...span.meta,
                        size: (span.meta?.size ?? 40) * Math.min(sx, sy),
                      };
                }
                edits.push(new app.Actions.Update_layer_action(layer.id, settings));
              }
            }
            edits.push(new app.Actions.Prepare_canvas_action('do'));
            await nativeEdit('Resize Canvas', edits);
          } else {
            const geometry = {
              x: value.x,
              y: value.y,
              width: value.width,
              height: value.height,
              rotate: 0,
            };
            if (value.op === 'add-text') {
              await nativeEdit('Add Text', [
                new app.Actions.Insert_layer_action(
                  {
                    ...geometry,
                    name: value.name || 'Text',
                    type: 'text',
                    is_vector: true,
                    render_function: ['text', 'render'],
                    data: textData(value.text, value),
                    params: {
                      boundary: 'box',
                      kerning: 'metrics',
                      text_direction: 'ltr',
                      wrap_direction: 'ttb',
                      halign: 'left',
                      valign: 'top',
                      wrap: 'word',
                    },
                  },
                  false,
                ),
              ]);
            } else if (value.op === 'add-rectangle') {
              await nativeEdit('Add Rectangle', [
                new app.Actions.Insert_layer_action(
                  {
                    ...geometry,
                    name: value.name || 'Rectangle',
                    type: 'rectangle',
                    is_vector: true,
                    render_function: ['rectangle', 'render'],
                    color: null,
                    params: {
                      border: false,
                      border_size: 0,
                      border_color: '#000000',
                      fill: true,
                      fill_color: value.color || '#eeeeee',
                      radius: 0,
                      square: false,
                    },
                  },
                  false,
                ),
              ]);
            } else if (value.op === 'add-image') {
              const loaded = await loadProjectImage(value.path, new URL('/', location.href).href);
              try {
                checkFresh();
                await nativeEdit('Import Image', [
                  new app.Actions.Insert_layer_action(
                    {
                      ...geometry,
                      name: value.name || value.path.split('/').at(-1),
                      type: 'image',
                      is_vector: false,
                      link: loaded.image,
                      width_original: loaded.image.naturalWidth,
                      height_original: loaded.image.naturalHeight,
                    },
                    false,
                  ),
                ]);
              } finally {
                loaded.release();
              }
            }
            return app.Config.layer.id;
          }
        },
        result: (createdLayerId) => ({
          ...inspect(),
          ...(createdLayerId === undefined ? {} : { createdLayerId }),
        }),
      };
    },
  });
  window.addEventListener('message', (event) => {
    if (event.source !== parent || (origin !== undefined && event.origin !== origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('crux:app:'))
      return;
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
        } while (revision !== saved || actions.size);
      })().then(
        () => send({ op: 'flushed', flushId: message.id }),
        (error) => send({ op: 'flushed', flushId: message.id, error: error.message }),
      );
    } else if (message.type === 'crux:app:command') {
      commands.execute(message.command).then(
        (result) => send({ op: 'tool-result', commandId: message.id, result }),
        (error) => send({ op: 'tool-result', commandId: message.id, error: error.message }),
      );
    }
  });
  bar.querySelectorAll('button')[0].onclick = () => save().catch(() => {});
  bar.querySelectorAll('button')[2].onclick = () =>
    saveImage(bar.querySelector('input').value).catch((error) => show(error.message));
  bar.querySelectorAll('button')[1].onclick = () => {
    if (revision === saved || confirm('Discard the unsaved draft and reload the saved project?'))
      location.reload();
  };
  try {
    const loaded = await call({ op: 'read', path: 'project.json' });
    expected = loaded.fingerprint;
    const doc = JSON.parse(loaded.content);
    validateProject(doc);
    if (doc.project) {
      for (const image of doc.project.data) {
        const ref = image.data;
        rasterPaths.set(image.id, 'data/' + ref.__cruxBinary.path);
        const asset = await call({ op: 'native-read', path: ref.__cruxBinary.path });
        image.data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(new Blob([asset.bytes], { type: ref.__cruxBinary.type }));
        });
        rasterCache.set(image.data, ref);
      }
      await app.FileOpen.load_json(doc.project);
    }
    await settle();
    hydrating = false;
    workspace.inert = false;
    show('Saved to Garden');

    // Some native controls update the current layer before committing undo state.
    for (const event of ['input', 'change', 'pointerup', 'keyup'])
      document.addEventListener(event, (e) => {
        if (e.target instanceof Node && !bar.contains(e.target)) dirty();
      });
    if (!doc.project) dirty();
  } catch (error) {
    show(error.message);
    throw error;
  }
}
