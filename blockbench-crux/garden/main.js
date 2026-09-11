import { startGarden } from './bridge.js';
import { validateProject, memoryStorage, packModels, unpackModel } from './model.js';
const garden = await startGarden();
try {
  const initial = garden.initial || {};
  validateProject({ version: 1, app: 'blockbench', project: initial });
  const memory = memoryStorage(initial.preferences, () => garden.changed());
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memory.storage });
  await import('../dist/bundle.js');
  if (!window.Blockbench?.setup_successful) throw new Error('Blockbench could not initialize.');
  window.onbeforeunload = null;
  // These native services depend on browser recovery or an external backend/code registry.
  for (const id of [
    'view_backups',
    'plugins_window',
    'reload_plugins',
    'load_plugin',
    'load_plugin_from_url',
    'install_plugins_from_list',
    'edit_session',
    'upload_model',
    'share_model',
    'upload_sketchfab',
  ])
    if (BarItems[id]) BarItems[id].condition = () => false;
  const models = new Map();
  const ids = new WeakMap();
  const logical = (project) => {
    if (!ids.has(project)) ids.set(project, crypto.randomUUID());
    return ids.get(project);
  };
  function remember() {
    if (!window.Project) return;
    const model = Codecs.project.compile({
      raw: true,
      bitmaps: true,
      editor_state: true,
      absolute_paths: false,
    });
    models.set(logical(Project), model);
  }
  function open(id) {
    const already = ModelProject.all.find((p) => logical(p) === id);
    if (already) {
      already.select();
      return;
    }
    Codecs.project.load(structuredClone(models.get(id)), {
      path: (models.get(id)?.name || 'model') + '.bbmodel',
      no_file: true,
    });
    if (!Project) throw new Error('Blockbench could not open a saved model.');
    ids.set(Project, id);
  }
  for (const id of initial.index?.models || [])
    models.set(id, unpackModel(initial['model-' + id], initial));
  for (const id of initial.index?.open || []) open(id);
  if (initial.index?.active) open(initial.index.active);
  const nativeUnselect = ModelProject.prototype.unselect;
  ModelProject.prototype.unselect = function (...args) {
    remember();
    return nativeUnselect.apply(this, args);
  };
  const nativeClose = ModelProject.prototype.close;
  ModelProject.prototype.close = async function () {
    // A closed tab stays in the Garden library. A failed/conflicted save keeps it open.
    try {
      if (!this.select()) return false;
      garden.changed();
      await garden.flush();
      const result = await nativeClose.call(this, true);
      garden.changed();
      refreshLibrary();
      return result;
    } catch (error) {
      garden.failed(error);
      return false;
    }
  };
  const library = document.createElement('select');
  library.id = 'garden-model-library';
  library.setAttribute('aria-label', 'Reopen model');
  document.getElementById('garden-project').append(library);
  function refreshLibrary() {
    library.replaceChildren(new Option('Reopen model…', ''));
    for (const [id, model] of models) library.add(new Option(model.name || 'Untitled model', id));
  }
  library.onchange = () => {
    if (library.value) {
      open(library.value);
      garden.changed();
      library.value = '';
    }
  };
  refreshLibrary();
  for (const event of [
    'init_edit',
    'finished_edit',
    'undo',
    'redo',
    'select_project',
    'setup_project',
    'update_project_settings',
    'add_texture',
    'update_texture',
    'update_settings',
    'update_keybindings',
  ])
    Blockbench.on(event, () => garden.changed());
  // Native controls can defer their edit until blur; don't checkpoint a half-entered value.
  document.addEventListener('input', () => garden.changed());
  document.addEventListener('change', () => garden.changed());
  let pointer = false;
  document.addEventListener('pointerdown', () => {
    pointer = true;
  });
  document.addEventListener('pointerup', () => {
    pointer = false;
  });
  document.addEventListener('pointercancel', () => {
    pointer = false;
  });
  window.addEventListener('blur', () => {
    pointer = false;
  });
  window.factoryResetAndReload = async () => {
    if (!confirm('Reset Blockbench preferences? Your models will be kept.')) return;
    memory.storage.clear();
    garden.changed();
    try {
      await garden.flush();
      location.reload();
    } catch (error) {
      garden.failed(error);
    }
  };
  garden.connect({
    busy: () =>
      pointer ||
      !!window.open_dialog ||
      !!window.Undo?.current_save ||
      ModelProject.all.some((p) => p.textures.some((t) => t.img && !t.img.complete)),
    async capture() {
      remember();
      const index = {
        models: [...models.keys()],
        open: ModelProject.all.map(logical),
        active: window.Project ? logical(Project) : null,
      };
      refreshLibrary();
      return packModels(models, index, memory.preferences());
    },
    async command(command) {
      if (command.op === 'inspect')
        return {
          models: [...models].map(([id, m]) => ({ id, name: m.name })),
          active: window.Project ? logical(Project) : null,
          name: window.Project?.name,
          elements: window.Project?.elements
            .slice(0, 200)
            .map((e) => ({ id: e.uuid, type: e.type, name: e.name, from: e.from, to: e.to })),
          textures: window.Project?.textures.length,
          animations: window.Project?.animations.map((a) => ({ name: a.name, length: a.length })),
        };
      if (!window.Project) throw new Error('Open a model first.');
      if (
        command.op === 'set-name' &&
        typeof command.name === 'string' &&
        command.name.trim() &&
        command.name.length <= 200
      ) {
        Project.name = command.name.trim();
        Project.saved = false;
        garden.changed();
        return { name: Project.name };
      }
      if (
        command.op === 'rename-element' &&
        typeof command.name === 'string' &&
        command.name.trim() &&
        command.name.length <= 200
      ) {
        const element = Project.elements.find((e) => e.uuid === command.elementId);
        if (!element) throw new Error('Choose an existing model element from inspect_blockbench.');
        Undo.initEdit({ elements: [element] });
        element.name = command.name.trim();
        Undo.finishEdit('Rename element');
        garden.changed();
        return { id: element.uuid, name: element.name };
      }
      throw new Error('Unsupported model operation or invalid arguments.');
    },
  });
} catch (error) {
  garden.failed(error);
  throw error;
}
