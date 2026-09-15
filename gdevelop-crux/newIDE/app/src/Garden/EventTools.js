// One binding to the actual EventsSheet and its native history; no alternate sheet.
import {
  EVENT_OPS,
  validateEventCommand,
  prepareEventEdit,
  inspectEvents,
} from '../../../../garden/events.mjs';
import { fingerprint } from '../../../../garden/instances.mjs';
import { checkInput } from './SceneTools';
import { serializeToJSObject } from '../Utils/Serializer';
import { saveToHistory, undo, redo, canUndo, canRedo } from '../Utils/History';
import { clearSelection } from '../EventsSheet/SelectionHandler';
const gd = global.gd;
const editors = new Set(),
  identities = new WeakMap();
let nextId = 1;
const identity = (v) => {
  if (!identities.has(v)) identities.set(v, nextId++);
  return identities.get(v);
};
export const registerGardenEventsEditor = (editor) => editors.add(editor);
export const unregisterGardenEventsEditor = (editor) => editors.delete(editor);
function editorFor(project, scene) {
  if (!project || !project.hasLayoutNamed(scene))
    throw new Error('Choose an existing scene.');
  const events = project.getLayout(scene).getEvents();
  const editor = [...editors].find(
    (e) =>
      e.props.isActive &&
      gd.compare(e.props.project, project) &&
      gd.compare(e.props.events, events)
  );
  if (!editor || !editor._eventsTree)
    throw new Error(`Open the ${scene} (Events) tab before using event tools.`);
  return editor;
}
const snapshot = (e) =>
  JSON.stringify({
    editor: identity(e),
    history: identity(e.state.eventsHistory),
    project: serializeToJSObject(e.props.project, 'serializeTo', {
      canonicalEventSerialization: true,
    }),
  });
const positions = { positionsBeforeAction: [], positionAfterAction: [] };
const settledState = (e, state) =>
  new Promise((resolve) => e.setState(state, resolve));
async function refresh(e) {
  if (e._eventSearcher) e._eventSearcher.reset();
  if (e._searchPanel) e._searchPanel.markSearchResultsDirty();
  await new Promise((resolve) => e._eventsTree.forceEventsUpdate(resolve));
  e.updateToolbar();
}
export function prepareGardenEventCommand(getProject, c) {
  if (!EVENT_OPS.includes(c?.op)) return null;
  validateEventCommand(c);
  checkInput();
  const project = getProject(),
    editor = editorFor(project, c.scene),
    events = editor.props.events,
    before = snapshot(editor);
  const inspect = c.op === 'inspect-events';
  if (!inspect) prepareEventEdit(gd, project, events, c);
  return {
    mutates: !inspect,
    async apply() {
      const expectedState = await fingerprint(before);
      if (
        editorFor(getProject(), c.scene) !== editor ||
        snapshot(editor) !== before ||
        (!inspect && c.expectedState !== expectedState)
      )
        throw new Error(
          'Events or the project changed since inspection or while saving. Inspect again before retrying.'
        );
      checkInput();
      const current = serializeToJSObject(events),
        unrecorded =
          JSON.stringify(current) !==
          JSON.stringify(editor.state.eventsHistory.currentValue);
      if (inspect)
        return {
          ...inspectEvents(gd, events, c),
          expectedState,
          canUndo: unrecorded || canUndo(editor.state.eventsHistory),
          canRedo: !unrecorded && canRedo(editor.state.eventsHistory),
        };
      const prepared = prepareEventEdit(gd, project, events, c);
      const baseline = unrecorded
        ? saveToHistory(editor.state.eventsHistory, events, 'EDIT', {
            positions,
          })
        : editor.state.eventsHistory;
      if (
        c.op === 'event-history' &&
        !(c.direction === 'undo' ? canUndo(baseline) : canRedo(baseline))
      )
        throw new Error(`There is no event ${c.direction} step available.`);
      // Clear borrowed native references before removals/history can invalidate them.
      await settledState(editor, {
        selection: clearSelection(),
        searchHighlight: null,
        inlineEditing: false,
        inlineEditingAnchorEl: null,
      });
      // setState yields; never apply to a project changed during that yield.
      if (
        editorFor(getProject(), c.scene) !== editor ||
        snapshot(editor) !== before
      )
        throw new Error(
          'Events changed while preparing the editor. Inspect again.'
        );
      checkInput();
      if (editor._eventSearcher) editor._eventSearcher.reset();
      let history;
      if (c.op === 'event-history')
        history = (c.direction === 'undo' ? undo : redo)(
          baseline,
          events,
          project
        );
      else {
        prepared();
        history = saveToHistory(
          baseline,
          events,
          c.action === 'remove'
            ? 'DELETE'
            : c.action === 'insert' || c.action === 'duplicate'
              ? 'ADD'
              : 'EDIT',
          { positions }
        );
      }
      await settledState(editor, { eventsHistory: history });
      await refresh(editor);
      return {
        scene: c.scene,
        changed: c.action || c.direction,
        canUndo: canUndo(history),
        canRedo: canRedo(history),
        note: 'Saved through native event history. Reinspect paths before another edit. Preview to verify the meaning of expressions.',
      };
    },
  };
}
