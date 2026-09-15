// Reuse the existing SceneEditor registration; no new upstream component hooks.
import { editorFor, checkInput, snapshot } from './SceneTools';
import { fingerprint } from '../../../../garden/instances.mjs';
import {
  OBJECT_OPS,
  validateObjectCommand,
  objectFor,
  inspectObject,
  prepareObjectEdits,
} from '../../../../garden/objects.mjs';
const gd = global.gd;
export function prepareGardenObjectCommand(getProject, command) {
  if (!OBJECT_OPS.includes(command?.op)) return null;
  validateObjectCommand(command);
  checkInput();
  const project = getProject(),
    editor = editorFor(project, command.scene),
    layout = editor.props.layout;
  const before = snapshot(editor);
  const inspect = command.op === 'inspect-object';
  if (!inspect) prepareObjectEdits(gd, project, layout, command);
  return {
    mutates: !inspect,
    async apply() {
      const expectedState = await fingerprint(before);
      if (
        editorFor(getProject(), command.scene) !== editor ||
        snapshot(editor) !== before ||
        (!inspect && command.expectedState !== expectedState)
      )
        throw new Error(
          'The object or project changed since inspection or while saving. Inspect again before retrying.'
        );
      checkInput();
      if (inspect)
        return {
          ...inspectObject(gd, objectFor(project, layout, command), command),
          expectedState,
        };
      const prepared = prepareObjectEdits(gd, project, layout, command);
      prepared.apply();
      // Same native completion callback as Apply in the object's editor dialog.
      editor._onObjectEdited(
        { object: prepared.object, global: command.scope === 'global' },
        true
      );
      editor.onObjectsModifiedOutsideEditor();
      editor.forceUpdatePropertiesEditor();
      editor.forceUpdateInstancesList();
      return {
        object: command.object,
        scope: command.scope,
        behavior: command.behavior,
        changed: command.updates?.map((u) => u.name) || ['animation'],
        note: 'Saved through native object editing. Scene-instance Undo does not undo object settings; Growth preserves saved versions.',
      };
    },
  };
}
