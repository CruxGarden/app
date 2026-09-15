// Native event operations. Paths are valid only with their inspection state token.
export const EVENT_OPS = ['inspect-events', 'edit-event', 'edit-instruction', 'event-history'];
const types = {
  standard: 'BuiltinCommonInstructions::Standard',
  comment: 'BuiltinCommonInstructions::Comment',
  group: 'BuiltinCommonInstructions::Group',
};
const exact = (v, keys) => {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new Error('Use only the listed event fields.');
};
const path = (v, empty = true) =>
  Array.isArray(v) &&
  v.length <= 16 &&
  (empty || v.length > 0) &&
  v.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000);
const text = (v, max) => typeof v === 'string' && v.length <= max;
const index = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
export function validateEventCommand(c) {
  if (!EVENT_OPS.includes(c?.op)) throw new Error('Unsupported event operation.');
  exact(c, [
    'op',
    'scene',
    ...(c.op === 'inspect-events'
      ? ['path', 'section', 'instructionParent', 'offset', 'limit']
      : [
          'expectedState',
          ...{
            'edit-event': ['action', 'path', 'parent', 'index', 'kind', 'text', 'disabled'],
            'edit-instruction': ['action', 'path', 'list', 'instructionPath', 'instruction'],
            'event-history': ['direction'],
          }[c.op],
        ]),
  ]);
  if (!text(c.scene, 200) || !c.scene.trim()) throw new Error('Choose the open scene events tab.');
  if (
    c.op !== 'inspect-events' &&
    (typeof c.expectedState !== 'string' || !/^[a-f0-9]{64}$/.test(c.expectedState))
  )
    throw new Error('Inspect events first and pass its current expectedState.');
  if (c.op === 'inspect-events') {
    if (
      !path(c.path ?? []) ||
      !['events', 'conditions', 'actions'].includes(c.section ?? 'events') ||
      !path(c.instructionParent ?? [])
    )
      throw new Error('Choose an event path and events, conditions or actions.');
    if ((c.section ?? 'events') === 'events' && c.instructionParent !== undefined)
      throw new Error('instructionParent is only for conditions/actions.');
    if (
      (c.offset !== undefined && !index(c.offset)) ||
      (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.limit > 20))
    )
      throw new Error('Use a nonnegative offset and a limit from 1 to 20.');
  } else if (c.op === 'event-history') {
    if (!['undo', 'redo'].includes(c.direction)) throw new Error('Choose undo or redo.');
  } else if (c.op === 'edit-event') {
    if (!['insert', 'update', 'remove', 'duplicate', 'move'].includes(c.action))
      throw new Error('Choose an event action.');
    const fields = {
      insert: ['parent', 'index', 'kind', 'text', 'disabled'],
      update: ['path', 'text', 'disabled'],
      remove: ['path'],
      duplicate: ['path', 'parent', 'index'],
      move: ['path', 'parent', 'index'],
    }[c.action];
    exact(c, ['op', 'scene', 'expectedState', 'action', ...fields]);
    if (c.action !== 'insert' && !path(c.path, false))
      throw new Error('Choose an existing event path.');
    if (['insert', 'duplicate', 'move'].includes(c.action) && (!path(c.parent) || !index(c.index)))
      throw new Error('Choose a parent event path ([] is the root) and insertion index.');
    if (c.action === 'insert' && !Object.hasOwn(types, c.kind))
      throw new Error('Create a standard, comment or group event.');
    if (c.text !== undefined && !text(c.text, 4000))
      throw new Error('Use text up to 4000 characters.');
    if (c.disabled !== undefined && typeof c.disabled !== 'boolean')
      throw new Error('Use a boolean disabled value.');
    if (c.action === 'update' && c.text === undefined && c.disabled === undefined)
      throw new Error('Supply text or disabled.');
  } else {
    if (
      !['insert', 'update', 'remove'].includes(c.action) ||
      !path(c.path, false) ||
      !['conditions', 'actions'].includes(c.list) ||
      !path(c.instructionPath, false)
    )
      throw new Error('Choose an event, condition/action list and instruction path.');
    if (c.action === 'remove') {
      if (c.instruction !== undefined) throw new Error('Removal needs no instruction.');
    } else {
      exact(c.instruction, ['type', 'parameters', 'inverted', 'awaited']);
      const i = c.instruction;
      if (
        !text(i.type, 200) ||
        !i.type.trim() ||
        !Array.isArray(i.parameters) ||
        i.parameters.length > 30 ||
        i.parameters.some((p) => !text(p, 2000))
      )
        throw new Error('Supply a native instruction type and up to 30 string parameters.');
      if (i.inverted !== undefined && (typeof i.inverted !== 'boolean' || c.list !== 'conditions'))
        throw new Error('Only conditions accept a boolean inverted value.');
      if (i.awaited !== undefined && (typeof i.awaited !== 'boolean' || c.list !== 'actions'))
        throw new Error('Only actions accept a boolean awaited value.');
    }
  }
}
export function eventAt(events, p) {
  let list = events,
    event;
  for (let depth = 0; depth < p.length; depth++) {
    if (p[depth] >= list.getEventsCount())
      throw new Error('This event path no longer exists. Inspect again.');
    event = list.getEventAt(p[depth]);
    if (depth < p.length - 1) {
      if (!event.canHaveSubEvents()) throw new Error('This event cannot have subevents.');
      list = event.getSubEvents();
    }
  }
  return { list, event, index: p.at(-1) };
}
function childList(events, p) {
  if (!p.length) return events;
  const { event } = eventAt(events, p);
  if (!event.canHaveSubEvents()) throw new Error('This event cannot have subevents.');
  return event.getSubEvents();
}
function instructionList(gd, events, p, label, parent) {
  const { event } = eventAt(events, p);
  if (!event) throw new Error('Choose an event path for its instructions.');
  let list = event.getInstructionList(label);
  if (!list || !gd.getPointer(list)) throw new Error('This event has no such instruction list.');
  for (const n of parent) {
    if (n >= list.size()) throw new Error('This instruction path no longer exists.');
    list = list.get(n).getSubInstructions();
  }
  return list;
}
function metadata(gd, project, label, type) {
  const m =
    label === 'conditions'
      ? gd.MetadataProvider.getConditionMetadata(project.getCurrentPlatform(), type)
      : gd.MetadataProvider.getActionMetadata(project.getCurrentPlatform(), type);
  if (gd.MetadataProvider.isBadInstructionMetadata(m))
    throw new Error('Unknown native instruction. Use list_gdevelop_capabilities.');
  return m;
}
function prepareInstruction(gd, project, c, old) {
  const spec = c.instruction,
    m = metadata(gd, project, c.list, spec.type);
  if (spec.parameters.length !== m.getParametersCount())
    throw new Error(
      'Supply every ordered native parameter slot, including code-only placeholders; discover the exact type first.',
    );
  for (let n = 0; n < m.getParametersCount(); n++) {
    const p = m.getParameter(n);
    if (!p.isOptional() && !p.isCodeOnly() && !spec.parameters[n].trim())
      throw new Error('A required instruction parameter is empty.');
    if (p.isCodeOnly() && spec.parameters[n] !== '')
      throw new Error('Use an empty string for code-only parameter slots.');
  }
  if (spec.awaited && !m.isAsync() && !m.isOptionallyAsync())
    throw new Error('This action does not support awaiting.');
  if (old && old.getSubInstructions().size() && old.getType() !== spec.type)
    throw new Error('Remove or revise child instructions before changing their parent type.');
  const result = old ? old.clone() : new gd.Instruction();
  result.setType(spec.type);
  result.setParametersCount(spec.parameters.length);
  spec.parameters.forEach((v, n) => result.setParameter(n, v));
  if (spec.inverted !== undefined) result.setInverted(spec.inverted);
  if (spec.awaited !== undefined) result.setAwaited(spec.awaited);
  else if (old && old.getType() !== spec.type) result.setAwaited(false);
  return result;
}
function eventText(gd, e, value) {
  if (e.getType() === types.comment) gd.asCommentEvent(e).setComment(value);
  else if (e.getType() === types.group) gd.asGroupEvent(e).setName(value);
  else throw new Error('Text applies to comment and group events.');
}
function apply(gd, project, events, c) {
  if (c.op === 'edit-instruction') {
    const parent = c.instructionPath.slice(0, -1),
      n = c.instructionPath.at(-1);
    const list = instructionList(gd, events, c.path, c.list, parent);
    if (n > list.size() || (c.action !== 'insert' && n === list.size()))
      throw new Error('Choose an existing instruction or valid insertion index.');
    if (parent.length && c.action === 'insert') {
      const ancestors = instructionList(gd, events, c.path, c.list, parent.slice(0, -1));
      if (
        !metadata(
          gd,
          project,
          c.list,
          ancestors.get(parent.at(-1)).getType(),
        ).canHaveSubInstructions()
      )
        throw new Error('This instruction cannot contain child instructions.');
    }
    if (c.action === 'remove') list.removeAt(n);
    else {
      const i = prepareInstruction(gd, project, c, c.action === 'update' ? list.get(n) : null);
      try {
        if (c.action === 'insert') list.insert(i, n);
        else list.set(n, i);
      } finally {
        i.delete();
      }
    }
    return;
  }
  if (c.action === 'insert') {
    const list = childList(events, c.parent);
    if (c.index > list.getEventsCount())
      throw new Error('Insertion index is past the end of the event list.');
    if (c.text !== undefined && c.kind === 'standard')
      throw new Error('Standard events have no comment text.');
    const e = list.insertNewEvent(project, types[c.kind], c.index);
    if (c.text !== undefined) eventText(gd, e, c.text);
    if (c.disabled !== undefined) e.setDisabled(c.disabled);
    return;
  }
  const { list, event, index: n } = eventAt(events, c.path);
  if (c.action === 'remove') {
    list.removeEventAt(n);
    return;
  }
  if (c.action === 'update') {
    if (c.text !== undefined) eventText(gd, event, c.text);
    if (c.disabled !== undefined) event.setDisabled(c.disabled);
    return;
  }
  if (c.parent.length >= c.path.length && c.path.every((v, n) => c.parent[n] === v))
    throw new Error('An event cannot be moved or duplicated into itself or its descendants.');
  const destination = childList(events, c.parent);
  if (c.index > destination.getEventsCount())
    throw new Error('Insertion index is past the end of the event list.');
  // Destination index refers to the list before removal, like native drag/drop.
  if (c.action === 'move') {
    if (!list.moveEventToAnotherEventsList(event, destination, c.index))
      throw new Error('The native editor rejected the move.');
  } else destination.insertEvent(event, c.index);
}
export function prepareEventEdit(gd, project, events, c) {
  validateEventCommand(c);
  if (!['edit-event', 'edit-instruction'].includes(c.op)) return null;
  const copy = new gd.EventsList(),
    serialized = new gd.SerializerElement();
  try {
    events.serializeTo(serialized);
    copy.unserializeFrom(project, serialized);
    apply(gd, project, copy, c);
  } finally {
    copy.delete();
    serialized.delete();
  }
  return () => apply(gd, project, events, c);
}
export function inspectEvents(gd, events, c) {
  const p = c.path ?? [],
    section = c.section ?? 'events',
    offset = c.offset ?? 0,
    limit = c.limit ?? 10;
  let total,
    items = [];
  if (section === 'events') {
    const list = childList(events, p);
    total = list.getEventsCount();
    for (let n = offset; n < Math.min(total, offset + limit); n++) {
      const e = list.getEventAt(n),
        type = e.getType();
      const condition = e.getInstructionList('conditions'),
        action = e.getInstructionList('actions');
      const label =
        type === types.comment
          ? gd.asCommentEvent(e).getComment()
          : type === types.group
            ? gd.asGroupEvent(e).getName()
            : undefined;
      items.push({
        path: [...p, n],
        type,
        disabled: e.isDisabled(),
        canHaveSubEvents: e.canHaveSubEvents(),
        children: e.canHaveSubEvents() ? e.getSubEvents().getEventsCount() : 0,
        conditions: condition && gd.getPointer(condition) ? condition.size() : null,
        actions: action && gd.getPointer(action) ? action.size() : null,
        text: label?.slice(0, 2000),
        textTruncated: label !== undefined && label.length > 2000,
      });
    }
  } else {
    const parent = c.instructionParent ?? [],
      list = instructionList(gd, events, p, section, parent);
    total = list.size();
    for (let n = offset; n < Math.min(total, offset + limit); n++) {
      const i = list.get(n),
        values = Array.from({ length: i.getParametersCount() }, (_, j) =>
          i.getParameter(j).getPlainString(),
        );
      items.push({
        instructionPath: [...parent, n],
        type: i.getType(),
        parameters: values.slice(0, 30).map((v) => v.slice(0, 2000)),
        parametersTruncated: values.length > 30 || values.some((v) => v.length > 2000),
        inverted: i.isInverted(),
        awaited: i.isAwaited(),
        children: i.getSubInstructions().size(),
      });
    }
  }
  return {
    scene: c.scene,
    path: p,
    section,
    total,
    offset,
    nextOffset: offset + limit < total ? offset + limit : null,
    items,
    note: 'Paths expire after any edit. Reinspect before changing events. Instruction parameters are native expression strings; metadata checks do not prove their runtime meaning. Preview the game to verify behavior.',
  };
}
