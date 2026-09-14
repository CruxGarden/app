import { validateCommand, validateBounds } from './commands.js';

/** Native geometry/history, scoped to the active model. The bridge owns confirmed saves. */
export function modelCommands(w, { changed, saveOutput, modelCount, models, activeId }) {
  const nodes = () => (w.Project ? [...w.Project.elements, ...w.Project.groups] : []);
  const node = (id) => nodes().find((n) => n.uuid === id);
  const parent = (id) => {
    if (!id || id === 'root') return w.Outliner.ROOT;
    const group = node(id);
    if (!(group instanceof w.Group))
      throw new Error('That parent group no longer exists in the active model. Inspect again.');
    if (group.locked)
      throw new Error('Unlock the parent group in the native editor before editing it.');
    return group;
  };
  function inspect(v = {}) {
    const all = nodes(),
      offset = v.offset ?? 0,
      limit = v.limit ?? 25;
    return {
      models: models().slice(0, 50),
      modelCount: modelCount(),
      active: activeId(),
      name: String(w.Project?.name ?? '').slice(0, 200),
      format: w.Project?.format?.id,
      elementCount: all.length,
      nextOffset: offset + limit < all.length ? offset + limit : null,
      elements: all.slice(offset, offset + limit).map((e) => ({
        id: e.uuid,
        type: e.type,
        name: String(e.name).slice(0, 200),
        parentId: e.parent?.uuid ?? 'root',
        from: e.from,
        to: e.to,
        origin: e.origin,
        rotation: e.rotation,
        childCount: e.children?.length,
        textures: e.faces
          ? [
              ...new Set(
                Object.values(e.faces)
                  .map((f) => f.texture)
                  .filter(Boolean),
              ),
            ]
          : undefined,
      })),
      textureCount: w.Project?.textures.length ?? 0,
      textures: w.Project?.textures.slice(0, 50).map((t) => ({
        id: t.uuid,
        name: String(t.name).slice(0, 200),
        width: t.width,
        height: t.height,
      })),
      animations: w.Project?.animations
        .slice(0, 50)
        .map((a) => ({ name: String(a.name).slice(0, 200), length: a.length })),
    };
  }
  function resolve(v) {
    if (v.op === 'inspect') return;
    if (v.op === 'create-model') {
      if (modelCount() >= 500) throw new Error('The model library is limited to 500 models.');
      return;
    }
    if (!w.Project) throw new Error('Create or open a native model first.');
    if (
      ['add-cube', 'update-cube', 'add-group', 'move-element', 'delete-element'].includes(v.op) &&
      w.Format.id !== 'free'
    )
      throw new Error(
        'These geometry tools currently support Generic Models. Open or create a Generic Model; other formats retain their native manual tools.',
      );
    if (['add-cube', 'add-group'].includes(v.op) && nodes().length >= 1000)
      throw new Error('This tool supports up to 1,000 model parts.');
    if (v.parentId !== undefined) parent(v.parentId);
    if (!v.elementId) return;
    const e = node(v.elementId);
    if (!e) throw new Error('That part no longer exists in the active model. Inspect again.');
    if (e.locked) throw new Error('Unlock this part in the native editor before editing it.');
    if (v.op === 'update-cube') {
      if (!(e instanceof w.Cube)) throw new Error('Choose a native cube to revise its geometry.');
      validateBounds(v.from ?? e.from, v.to ?? e.to);
    }
    if (
      ['move-element', 'delete-element'].includes(v.op) &&
      !(e instanceof w.Cube) &&
      !(e instanceof w.Group)
    )
      throw new Error('These tools currently arrange cubes and groups.');
    if (v.op === 'delete-element' && e instanceof w.Group && e.children.length)
      throw new Error(
        'Move or delete the group’s children explicitly before deleting the empty group.',
      );
    if (v.op === 'move-element') {
      for (let p = parent(v.parentId); p && p !== w.Outliner.ROOT; p = p.parent)
        if (p === e) throw new Error('A group cannot contain itself or one of its ancestors.');
    }
    return e;
  }
  function refreshBranch(element) {
    for (const child of element.children ?? []) refreshBranch(child);
    element.preview_controller?.updateTransform?.(element);
    element.preview_controller?.updateGeometry?.(element);
  }
  const refresh = (elements) => {
    w.Canvas.updateView({
      elements,
      element_aspects: { transform: true, geometry: true, faces: true },
    });
    w.updateSelection();
  };
  const partState = (target) =>
    JSON.stringify({
      native: target.getSaveCopy(),
      parent: target.parent?.uuid ?? target.parent ?? 'root',
      children: target.children?.map((child) => child.uuid),
    });
  function prepare(value) {
    const v = validateCommand(value),
      project = w.Project;
    const target = resolve(v);
    const before = target ? partState(target) : undefined;
    return {
      mutates: v.op !== 'inspect',
      async apply() {
        if (v.op === 'inspect') return inspect(v);
        if (w.Project !== project)
          throw new Error(
            'The active model changed while saving. Inspect the intended model before continuing.',
          );
        const e = resolve(v);
        if (e && partState(e) !== before)
          throw new Error(
            'That model part changed while saving. Inspect again to preserve the latest edits.',
          );
        if (v.op === 'save-model' || v.op === 'save-gltf') {
          const text =
            v.op === 'save-model'
              ? JSON.stringify(
                  w.Codecs.project.compile({
                    raw: true,
                    bitmaps: true,
                    editor_state: true,
                    absolute_paths: false,
                  }),
                )
              : await w.Codecs.gltf.compile({ encoding: 'ascii', embed_textures: true });
          if (v.op === 'save-gltf') {
            const gltf = JSON.parse(text);
            if (
              [...(gltf.images ?? []), ...(gltf.buffers ?? [])].some(
                (a) => a.uri && !a.uri.startsWith('data:'),
              )
            )
              throw new Error(
                'The model export still references external media. Import its textures locally before exporting.',
              );
          }
          return saveOutput(
            v.label,
            new TextEncoder().encode(text).buffer,
            v.op === 'save-model' ? 'application/x-blockbench-model+json' : 'model/gltf+json',
          );
        }
        let created;
        if (v.op === 'create-model') {
          w.newProject(w.Formats.free);
          w.Project.name = v.name;
        } else if (v.op === 'set-name') w.Project.name = v.name;
        else if (v.op === 'add-cube') {
          w.Undo.initEdit({ outliner: true, elements: [], selection: true });
          created = new w.Cube({
            name: v.name,
            from: v.from,
            to: v.to,
            origin: v.origin ?? [0, 0, 0],
            rotation: v.rotation ?? [0, 0, 0],
          }).init();
          created.addTo(parent(v.parentId));
          if (!created.box_uv) created.mapAutoUV();
          w.unselectAllElements();
          created.select();
          refresh([created]);
          w.Undo.finishEdit('Add cube', { outliner: true, elements: [created], selection: true });
        } else if (v.op === 'add-group') {
          w.Undo.initEdit({ outliner: true, groups: [], selection: true });
          created = new w.Group({ name: v.name, origin: v.origin ?? [0, 0, 0] });
          created.isOpen = true;
          created.addTo(parent(v.parentId)).init().select();
          w.Undo.finishEdit('Add group', { outliner: true, groups: [created], selection: true });
        } else if (v.op === 'rename-element') {
          e.temp_data.old_name = e.name;
          e.name = v.name;
          e.saveName();
        } else if (v.op === 'update-cube') {
          w.Undo.initEdit({ elements: [e] });
          e.extend(
            Object.fromEntries(
              ['from', 'to', 'origin', 'rotation']
                .filter((k) => v[k] !== undefined)
                .map((k) => [k, v[k]]),
            ),
          );
          refresh([e]);
          w.Undo.finishEdit('Edit cube geometry');
        } else if (v.op === 'move-element') {
          w.Undo.initEdit({
            outliner: true,
            selection: true,
            ...(e instanceof w.Group ? { groups: [e] } : { elements: [e] }),
          });
          e.addTo(parent(v.parentId));
          refreshBranch(e);
          w.updateSelection();
          w.Undo.finishEdit('Move model part');
        } else if (v.op === 'delete-element') {
          if (e instanceof w.Group) e.remove(true);
          else {
            w.Undo.initEdit({ outliner: true, elements: [e], selection: true });
            e.remove();
            w.Undo.finishEdit('Delete model part', {
              outliner: true,
              elements: [],
              selection: true,
            });
          }
          w.updateSelection();
        }
        created?.showInOutliner();
        w.Project.saved = false;
        changed();
        return created ? { createdId: created.uuid } : undefined;
      },
      result: (value) =>
        value?.path ? value : { ...inspect(v.op === 'inspect' ? v : {}), ...value },
    };
  }
  return { prepare, inspect };
}
