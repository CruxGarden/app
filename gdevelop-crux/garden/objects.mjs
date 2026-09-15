// Garden-only commands over native object configurations and behavior descriptors.
export const OBJECT_OPS = ['inspect-object', 'edit-properties', 'edit-animation'];
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => {
  if (!plain(v) || Object.keys(v).some((k) => !keys.includes(k)))
    throw new Error('Use only the listed object operation fields.');
};
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateObjectCommand(c) {
  if (!OBJECT_OPS.includes(c?.op)) throw new Error('Unsupported object operation.');
  exact(c, [
    'op',
    'scene',
    'object',
    'scope',
    ...(c.op === 'inspect-object' ? [] : ['expectedState']),
    ...{
      'inspect-object': ['behavior', 'section', 'offset', 'limit'],
      'edit-properties': ['behavior', 'updates'],
      'edit-animation': ['animation', 'direction', 'fps', 'loop'],
    }[c.op],
  ]);
  if (!text(c.scene, 200) || !text(c.object, 100) || !['scene', 'global'].includes(c.scope))
    throw new Error('Choose the open scene, an object name and its scene/global scope.');
  if (c.op !== 'inspect-object' && !/^[a-f0-9]{64}$/.test(c.expectedState || ''))
    throw new Error('Inspect the object first and pass its current expectedState.');
  if (
    c.expectedState !== undefined &&
    (typeof c.expectedState !== 'string' || !/^[a-f0-9]{64}$/.test(c.expectedState))
  )
    throw new Error('Use the expectedState from object inspection.');
  if (c.behavior !== undefined && !text(c.behavior, 200))
    throw new Error('Choose a behavior name.');
  if (c.op === 'inspect-object') {
    if (c.section !== undefined && !['properties', 'behaviors', 'animations'].includes(c.section))
      throw new Error('Choose properties, behaviors or animations.');
    if (c.behavior !== undefined && c.section && c.section !== 'properties')
      throw new Error('Choose properties when inspecting a named behavior.');
    if (
      c.offset !== undefined &&
      (!Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset > 1000000)
    )
      throw new Error('Use an offset from 0 to 1000000.');
    if (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.limit > 30))
      throw new Error('Use a limit from 1 to 30.');
  }
  if (c.op === 'edit-properties') {
    if (
      !Array.isArray(c.updates) ||
      !c.updates.length ||
      c.updates.length > 30 ||
      new Set(c.updates.map((u) => u?.name)).size !== c.updates.length
    )
      throw new Error('Provide 1 to 30 distinct property updates.');
    for (const u of c.updates) {
      exact(u, ['name', 'value']);
      if (
        !text(u.name, 200) ||
        !(
          typeof u.value === 'boolean' ||
          (typeof u.value === 'number' && Number.isFinite(u.value) && Math.abs(u.value) <= 1e9) ||
          (typeof u.value === 'string' && u.value.length <= 4000)
        )
      )
        throw new Error(
          'Use a property name and a boolean, finite number or string up to 4000 characters.',
        );
    }
  }
  if (c.op === 'edit-animation') {
    if (
      !Number.isSafeInteger(c.animation) ||
      c.animation < 0 ||
      (c.direction !== undefined && (!Number.isSafeInteger(c.direction) || c.direction < 0))
    )
      throw new Error('Choose existing animation/direction indexes from inspection.');
    if (c.fps === undefined && c.loop === undefined) throw new Error('Supply fps or loop.');
    if (
      c.fps !== undefined &&
      (typeof c.fps !== 'number' || !Number.isFinite(c.fps) || c.fps < 0.1 || c.fps > 240)
    )
      throw new Error('Use 0.1 to 240 frames per second.');
    if (c.loop !== undefined && typeof c.loop !== 'boolean')
      throw new Error('Use a boolean loop value.');
  }
}
const vector = (v) => Array.from({ length: v.size() }, (_, i) => v.at(i));
const supported = new Set([
  'number',
  'numberwithchoices',
  'boolean',
  '',
  'string',
  'multilinestring',
  'choice',
  'color',
  'resource',
  'layer',
  'behavior',
]);
const choices = (d) => [
  ...vector(d.getChoices()).map((v) => v.getValue()),
  ...vector(d.getExtraInfo()),
];
function descriptor(name, d) {
  const type = d.getType().toLowerCase(),
    raw = d.getValue();
  const values = ['choice', 'numberwithchoices'].includes(type) ? choices(d) : [];
  return {
    name,
    type,
    value: raw.slice(0, 4000),
    valueTruncated: raw.length > 4000,
    label: d.getLabel().slice(0, 200),
    description: d.getDescription().slice(0, 500),
    writable: !d.isHidden() && supported.has(type),
    hidden: d.isHidden(),
    choices: values.slice(0, 50),
    choicesTruncated: values.length > 50,
    extraInfo: vector(d.getExtraInfo())
      .slice(0, 20)
      .map((s) => s.slice(0, 200)),
  };
}
function target(object, behavior) {
  if (behavior === undefined) return object.getConfiguration();
  if (!object.hasBehaviorNamed(behavior))
    throw new Error('This behavior no longer exists. Inspect again.');
  return object.getBehavior(behavior);
}
export function objectFor(project, layout, c) {
  const container = c.scope === 'global' ? project.getObjects() : layout.getObjects();
  if (!container.hasObjectNamed(c.object))
    throw new Error('This object no longer exists in the chosen scope. Inspect again.');
  return container.getObject(c.object);
}
function spriteAnimations(gd, object) {
  if (object.getType() !== 'Sprite')
    throw new Error('Animation timing is available for native Sprite objects.');
  return gd.asSpriteConfiguration(object.getConfiguration()).getAnimations();
}
export function inspectObject(gd, object, c) {
  const section = c.section || 'properties',
    offset = c.offset || 0,
    limit = c.limit || 20;
  let items;
  if (section === 'behaviors')
    items = vector(object.getAllBehaviorNames()).map((name) => ({
      name,
      type: object.getBehavior(name).getTypeName(),
    }));
  else if (section === 'animations') {
    const animations = spriteAnimations(gd, object);
    items = Array.from({ length: animations.getAnimationsCount() }, (_, index) => {
      const a = animations.getAnimation(index);
      return {
        index,
        name: a.getName(),
        directionCount: a.getDirectionsCount(),
        multipleDirections: a.useMultipleDirections(),
        directions: Array.from(
          { length: Math.min(a.getDirectionsCount(), a.useMultipleDirections() ? 8 : 1) },
          (_, direction) => {
            const d = a.getDirection(direction),
              seconds = d.getTimeBetweenFrames();
            return {
              direction,
              frames: d.getSpritesCount(),
              fps: seconds > 0 ? 1 / seconds : null,
              loop: d.isLooping(),
            };
          },
        ),
        directionsTruncated: a.useMultipleDirections() && a.getDirectionsCount() > 8,
      };
    });
  } else {
    const properties = target(object, c.behavior).getProperties();
    items = vector(properties.keys()).map((name) => descriptor(name, properties.get(name)));
  }
  return {
    object: object.getName(),
    type: object.getType(),
    scope: c.scope,
    behavior: c.behavior,
    section,
    total: items.length,
    offset,
    nextOffset: offset + limit < items.length ? offset + limit : null,
    items: items.slice(offset, offset + limit),
    note: 'Property values are native strings; edits use typed JSON values. Only writable descriptors are supported. Inspection tokens expire after any project edit. Object/behavior/animation edits are not part of native scene-instance Undo; Growth preserves saved versions.',
  };
}
function propertyValue(d, value, project, layout, object) {
  const type = d.getType().toLowerCase();
  if (d.isHidden() || !supported.has(type))
    throw new Error('This property requires its native specialized editor.');
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('Use a JSON boolean for this property.');
    return value ? '1' : '0'; // Same conversion as native PropertiesMapToSchema.
  }
  if (type === 'number' || type === 'numberwithchoices') {
    if (typeof value !== 'number') throw new Error('Use a JSON number for this property.');
    if (type === 'numberwithchoices' && !choices(d).includes(String(value)))
      throw new Error('Choose a listed numeric value.');
    return String(value);
  }
  if (typeof value !== 'string') throw new Error('Use a JSON string for this property.');
  if (type === 'choice' && !choices(d).includes(value))
    throw new Error('Choose a listed property value.');
  if (type === 'color' && !/^\d{1,3};\d{1,3};\d{1,3}$/.test(value))
    throw new Error('Use r;g;b color channels from 0 to 255.');
  if (type === 'color' && value.split(';').some((n) => Number(n) > 255))
    throw new Error('Color channels must be from 0 to 255.');
  if (type === 'resource' && value) {
    const resources = project.getResourcesManager(),
      kind = d.getExtraInfo().size() ? d.getExtraInfo().at(0) : '';
    if (!resources.hasResource(value) || (kind && resources.getResource(value).getKind() !== kind))
      throw new Error('Choose an existing resource of the required kind.');
  }
  if (type === 'layer' && !layout.getLayers().hasLayerNamed(value))
    throw new Error('Choose an existing scene layer.');
  if (type === 'behavior') {
    const requiredType = d.getExtraInfo().size() ? d.getExtraInfo().at(0) : '';
    if (
      !object.hasBehaviorNamed(value) ||
      (requiredType && object.getBehavior(value).getTypeName() !== requiredType)
    )
      throw new Error('Choose an existing compatible behavior.');
  }
  return value;
}
function applyEdits(gd, project, layout, object, c) {
  if (c.op === 'edit-animation') {
    const animations = spriteAnimations(gd, object);
    if (c.animation >= animations.getAnimationsCount())
      throw new Error('The animation no longer exists. Inspect again.');
    const a = animations.getAnimation(c.animation),
      index = c.direction ?? 0;
    if ((!a.useMultipleDirections() && index !== 0) || index >= a.getDirectionsCount())
      throw new Error('The animation direction no longer exists.');
    const d = a.getDirection(index);
    if (c.fps !== undefined) d.setTimeBetweenFrames(1 / c.fps);
    if (c.loop !== undefined) d.setLoop(c.loop);
    return;
  }
  const destination = target(object, c.behavior);
  for (const u of c.updates) {
    // Re-read dynamic descriptors after each preceding update.
    const properties = destination.getProperties();
    if (!properties.has(u.name)) throw new Error('This property no longer exists. Inspect again.');
    const value = propertyValue(properties.get(u.name), u.value, project, layout, object);
    if (!destination.updateProperty(u.name, value))
      throw new Error('The native editor rejected property: ' + u.name);
  }
}
export function prepareObjectEdits(gd, project, layout, c) {
  validateObjectCommand(c);
  const object = objectFor(project, layout, c);
  // Validate the full ordered batch using native setters on an owned clone.
  const owned = object.clone();
  try {
    applyEdits(gd, project, layout, owned.get(), c);
  } finally {
    owned.delete();
  }
  return { object, apply: () => applyEdits(gd, project, layout, object, c) };
}
