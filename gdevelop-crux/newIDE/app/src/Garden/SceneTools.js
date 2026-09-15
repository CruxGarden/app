// Garden-only binding to the native scene editor. No alternate model/history.
import {
  SCENE_OPS,
  validateSceneCommand,
  prepareInstances,
  nativeInstances,
  instanceInfo,
  fingerprint,
} from '../../../../garden/instances.mjs';
import { serializeToJSObject } from '../Utils/Serializer';
import { saveToHistory, undo, redo, canUndo, canRedo } from '../Utils/History';
const gd = global.gd;
const editors = new Set();
const identities = new WeakMap();
let nextIdentity = 1;
const identity = (value) => {
  if (!identities.has(value)) identities.set(value, nextIdentity++);
  return identities.get(value);
};
export const registerGardenSceneEditor = (editor) => editors.add(editor);
export const unregisterGardenSceneEditor = (editor) => editors.delete(editor);
function editorFor(project, scene) {
  const editor = [...editors].find(
    (e) =>
      project &&
      gd.compare(e.props.project, project) &&
      e.props.isActive &&
      e.props.layout &&
      e.props.layout.getName() === scene &&
      !e.props.externalLayout &&
      !e.props.eventsBasedObject
  );
  if (!editor)
    throw new Error(
      `Open the ${scene} scene tab in the native editor before using scene tools.`
    );
  return editor;
}
function checkInput() {
  const active = document.activeElement;
  if (active && (active.matches('input,textarea') || active.isContentEditable))
    throw new Error(
      'Finish the active native text/number edit and click outside its field before using scene tools.'
    );
}
const snapshot = (editor) =>
  JSON.stringify({
    editor: identity(editor),
    history: identity(editor.state.history),
    project: serializeToJSObject(editor.props.project, 'serializeTo', {
      canonicalEventSerialization: true,
    }),
  });
async function inspect(editor, command) {
  const state = snapshot(editor);
  const expectedState = await fingerprint(state);
  if (!editors.has(editor) || snapshot(editor) !== state)
    throw new Error('The scene changed during inspection. Inspect again.');
  const unrecorded =
    JSON.stringify(serializeToJSObject(editor.props.initialInstances)) !==
    JSON.stringify(editor.state.history.currentValue);
  const all = nativeInstances(gd, editor.props.initialInstances),
    offset = command.offset || 0,
    limit = command.limit || 20;
  return {
    scene: editor.props.layout.getName(),
    expectedState,
    total: all.length,
    offset,
    nextOffset: offset + limit < all.length ? offset + limit : null,
    instances: all.slice(offset, offset + limit).map(instanceInfo),
    selectedIds: editor.instancesSelection
      .getSelectedInstances()
      .slice(0, 50)
      .map((i) => i.getPersistentUuid()),
    canUndo: unrecorded || canUndo(editor.state.history),
    canRedo: !unrecorded && canRedo(editor.state.history),
    note: 'History is the active scene instance history only. Width/height/depth are stored custom dimensions and apply only when their custom-size flag is true. Inspect again after edits, Undo/Redo or reopening.',
  };
}
export function prepareGardenSceneCommand(getProject, command) {
  if (!SCENE_OPS.includes(command?.op)) return null;
  validateSceneCommand(command);
  checkInput();
  const project = getProject(),
    editor = editorFor(project, command.scene),
    layout = editor.props.layout;
  if (command.op === 'inspect-scene')
    return { mutates: false, apply: () => inspect(editor, command) };
  // Validate the entire batch before the shared runner saves any manual changes.
  prepareInstances(gd, project, layout, command);
  const before = snapshot(editor);
  return {
    mutates: command.op !== 'select-instances',
    async apply() {
      const expected = await fingerprint(before);
      if (
        (command.expectedState !== undefined &&
          command.expectedState !== expected) ||
        editorFor(getProject(), command.scene) !== editor ||
        snapshot(editor) !== before
      )
        throw new Error(
          'The scene changed since inspection or while saving. Inspect again before retrying.'
        );
      checkInput();
      const prepared = prepareInstances(gd, project, layout, command);
      if (command.op === 'select-instances') {
        editor._setSelectedInstances(prepared.selected, false);
        editor.forceUpdatePropertiesEditor();
        editor.forceUpdateInstancesList();
        editor.updateToolbar();
        return {
          selectedIds: prepared.selected.map((i) => i.getPersistentUuid()),
        };
      }
      const current = serializeToJSObject(editor.props.initialInstances);
      // Capture a native manual change that has not yet been put into history,
      // before taking the separate history step for this command.
      const baseline =
        JSON.stringify(current) ===
        JSON.stringify(editor.state.history.currentValue)
          ? editor.state.history
          : saveToHistory(
              editor.state.history,
              editor.props.initialInstances,
              'EDIT'
            );
      if (
        command.op === 'scene-history' &&
        !(command.direction === 'undo' ? canUndo(baseline) : canRedo(baseline))
      )
        throw new Error(
          `There is no scene-instance ${command.direction} step available.`
        );
      // Drop native references before removal or history unserialization can delete them.
      editor.instancesSelection.clearSelection();
      if (editor.editorDisplay)
        editor.editorDisplay.instancesHandlers.clearHighlightedInstance();
      editor.forceUpdatePropertiesEditor();
      let affected = [],
        history;
      if (command.op === 'scene-history') {
        history = (command.direction === 'undo' ? undo : redo)(
          baseline,
          editor.props.initialInstances,
          project
        );
      } else {
        affected = prepared.apply();
        history = saveToHistory(
          baseline,
          editor.props.initialInstances,
          command.op === 'delete-instances'
            ? 'DELETE'
            : ['add-instance', 'duplicate-instances'].includes(command.op)
              ? 'ADD'
              : 'EDIT'
        );
      }
      await new Promise((resolve) =>
        editor.setState(
          { history, selectedObjectFolderOrObjectsWithContext: [] },
          () => {
            editor.onInstancesModifiedOutsideEditor();
            editor.forceUpdateInstancesList();
            editor.forceUpdatePropertiesEditor();
            if (affected.length) editor._setSelectedInstances(affected, false);
            resolve();
          }
        )
      );
      return {
        scene: command.scene,
        affectedIds: affected.map((i) => i.getPersistentUuid()),
        total: editor.props.initialInstances.getInstancesCount(),
        canUndo: canUndo(editor.state.history),
        canRedo: canRedo(editor.state.history),
      };
    },
  };
}
