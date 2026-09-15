// Native instance operations. The editor binding supplies history, refresh and saving.
export const SCENE_OPS = [
  'inspect-scene',
  'edit-instances',
  'duplicate-instances',
  'delete-instances',
  'select-instances',
  'scene-history',
  'add-instance',
];
const exact = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('Use only the listed scene operation fields.');
};
const text = (value, max = 200) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const number = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function validateSceneCommand(c) {
  const common = c?.op === 'inspect-scene' ? ['op', 'scene'] : ['op', 'scene', 'expectedState'];
  const extras = {
    'inspect-scene': ['offset', 'limit'],
    'edit-instances': ['updates'],
    'duplicate-instances': ['ids', 'dx', 'dy'],
    'delete-instances': ['ids'],
    'select-instances': ['ids'],
    'scene-history': ['direction'],
    'add-instance': ['object', 'x', 'y'],
  };
  if (!SCENE_OPS.includes(c?.op)) throw new Error('Unsupported scene operation.');
  exact(c, [...common, ...extras[c.op]]);
  if (!text(c.scene)) throw new Error('Choose the scene tab to edit.');
  if (
    c.op !== 'inspect-scene' &&
    c.op !== 'add-instance' &&
    !/^[a-f0-9]{64}$/.test(c.expectedState || '')
  )
    throw new Error('Inspect this scene first and pass its current expectedState.');
  if (
    c.expectedState !== undefined &&
    (typeof c.expectedState !== 'string' || !/^[a-f0-9]{64}$/.test(c.expectedState))
  )
    throw new Error('Use the expectedState returned by inspect_gdevelop_scene.');
  if (c.op === 'inspect-scene') {
    if (
      c.offset !== undefined &&
      (!Number.isSafeInteger(c.offset) || c.offset < 0 || c.offset > 1000000)
    )
      throw new Error('Use an offset from 0 to 1000000.');
    if (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.limit > 50))
      throw new Error('Use a limit from 1 to 50.');
  }
  if (['duplicate-instances', 'delete-instances', 'select-instances'].includes(c.op)) {
    if (
      !Array.isArray(c.ids) ||
      c.ids.length > 50 ||
      (c.op !== 'select-instances' && !c.ids.length) ||
      c.ids.some((id) => !text(id)) ||
      new Set(c.ids).size !== c.ids.length
    )
      throw new Error(
        'Choose up to 50 unique instance IDs from inspection; only selection can be empty.',
      );
  }
  if (
    c.op === 'duplicate-instances' &&
    ['dx', 'dy'].some((key) => c[key] !== undefined && !number(c[key], -100000, 100000))
  )
    throw new Error('Use finite duplication offsets from -100000 to 100000.');
  if (c.op === 'scene-history' && !['undo', 'redo'].includes(c.direction))
    throw new Error('Choose undo or redo for scene-instance history.');
  if (
    c.op === 'add-instance' &&
    (!text(c.object, 100) || !number(c.x, -100000, 100000) || !number(c.y, -100000, 100000))
  )
    throw new Error('Choose an object and finite x/y coordinates from -100000 to 100000.');
  if (c.op === 'edit-instances') {
    if (
      !Array.isArray(c.updates) ||
      !c.updates.length ||
      c.updates.length > 50 ||
      new Set(c.updates.map((u) => u?.id)).size !== c.updates.length
    )
      throw new Error('Provide 1 to 50 updates with unique IDs.');
    for (const u of c.updates) {
      exact(u, [
        'id',
        'x',
        'y',
        'z',
        'angle',
        'rotationX',
        'rotationY',
        'width',
        'height',
        'depth',
        'naturalSize',
        'layer',
        'zOrder',
        'opacity',
        'flippedX',
        'flippedY',
        'hidden',
        'locked',
      ]);
      if (!text(u.id) || Object.keys(u).length < 2)
        throw new Error('Each update needs an instance ID and at least one change.');
      for (const key of ['x', 'y', 'z', 'angle', 'rotationX', 'rotationY'])
        if (u[key] !== undefined && !number(u[key], -100000, 100000))
          throw new Error('Use finite coordinates and angles from -100000 to 100000.');
      for (const key of ['width', 'height', 'depth'])
        if (u[key] !== undefined && !number(u[key], 1, 16384))
          throw new Error('Use dimensions from 1 to 16384.');
      if (
        (u.width === undefined) !== (u.height === undefined) ||
        (u.naturalSize && (u.width !== undefined || u.depth !== undefined))
      )
        throw new Error(
          'Provide width and height together, or naturalSize without custom dimensions.',
        );
      for (const key of ['naturalSize', 'flippedX', 'flippedY', 'hidden', 'locked'])
        if (u[key] !== undefined && typeof u[key] !== 'boolean')
          throw new Error('Use booleans for size reset, flips, visibility and locking.');
      if (u.layer !== undefined && (typeof u.layer !== 'string' || u.layer.length > 200))
        throw new Error('Choose a layer name; empty string is the base layer.');
      if (
        u.zOrder !== undefined &&
        (!Number.isInteger(u.zOrder) || !number(u.zOrder, -100000, 100000))
      )
        throw new Error('Use an integer z-order from -100000 to 100000.');
      if (u.opacity !== undefined && (!Number.isInteger(u.opacity) || !number(u.opacity, 0, 255)))
        throw new Error('Use opacity from 0 to 255.');
    }
  }
}
export function nativeInstances(gd, container) {
  const instances = [];
  const functor = new gd.InitialInstanceJSFunctor();
  functor.invoke = (pointer) => instances.push(gd.wrapPointer(pointer, gd.InitialInstance));
  try {
    container.iterateOverInstances(functor);
  } finally {
    functor.delete();
  }
  return instances;
}
export function instanceInfo(i) {
  return {
    id: i.getPersistentUuid(),
    object: i.getObjectName(),
    x: i.getX(),
    y: i.getY(),
    z: i.getZ(),
    angle: i.getAngle(),
    rotationX: i.getRotationX(),
    rotationY: i.getRotationY(),
    customSize: i.hasCustomSize(),
    width: i.getCustomWidth(),
    height: i.getCustomHeight(),
    customDepth: i.hasCustomDepth(),
    depth: i.getCustomDepth(),
    layer: i.getLayer(),
    zOrder: i.getZOrder(),
    opacity: i.getOpacity(),
    flippedX: i.isFlippedX(),
    flippedY: i.isFlippedY(),
    hidden: i.isHidden(),
    locked: i.isLocked(),
  };
}
export const fingerprint = async (value) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
export function prepareInstances(gd, project, layout, c) {
  validateSceneCommand(c);
  const container = layout.getInitialInstances(),
    all = nativeInstances(gd, container);
  const byId = new Map(all.map((i) => [i.getPersistentUuid(), i]));
  if (byId.size !== all.length || all.some((i) => !i.getPersistentUuid()))
    throw new Error('Instances need distinct native IDs. Reopen and inspect the scene.');
  const ids = c.updates?.map((u) => u.id) || c.ids || [];
  const selected = ids.map((id) => {
    const instance = byId.get(id);
    if (!instance) throw new Error('An instance no longer exists. Inspect the scene again.');
    return instance;
  });
  for (const i of selected) {
    if (c.op !== 'select-instances' && i.isLocked()) {
      const update = c.updates?.find((u) => u.id === i.getPersistentUuid());
      if (update?.locked !== false)
        throw new Error('Unlock this instance explicitly before changing or removing it.');
    }
  }
  if (c.op === 'edit-instances')
    for (const u of c.updates)
      if (u.layer !== undefined && !layout.getLayers().hasLayerNamed(u.layer))
        throw new Error('Choose an existing scene layer.');
  if (c.op === 'duplicate-instances')
    for (const i of selected)
      if (
        !number(i.getX() + (c.dx ?? 16), -100000, 100000) ||
        !number(i.getY() + (c.dy ?? 16), -100000, 100000)
      )
        throw new Error('Duplicated positions must stay within -100000 to 100000.');
  if (
    c.op === 'add-instance' &&
    !layout.getObjects().hasObjectNamed(c.object) &&
    !project.getObjects().hasObjectNamed(c.object)
  )
    throw new Error('Choose an existing object in this scene or the global objects.');
  return {
    all,
    selected,
    apply() {
      if (c.op === 'edit-instances') {
        const setters = {
          x: 'setX',
          y: 'setY',
          z: 'setZ',
          angle: 'setAngle',
          rotationX: 'setRotationX',
          rotationY: 'setRotationY',
          layer: 'setLayer',
          zOrder: 'setZOrder',
          opacity: 'setOpacity',
          flippedX: 'setFlippedX',
          flippedY: 'setFlippedY',
          hidden: 'setHidden',
          locked: 'setLocked',
        };
        for (const u of c.updates) {
          const i = byId.get(u.id);
          for (const [key, method] of Object.entries(setters))
            if (u[key] !== undefined) i[method](u[key]);
          if (u.width !== undefined) {
            i.setHasCustomSize(true);
            i.setCustomWidth(u.width);
            i.setCustomHeight(u.height);
          }
          if (u.depth !== undefined) {
            i.setHasCustomDepth(true);
            i.setCustomDepth(u.depth);
          }
          if (u.naturalSize) {
            i.setHasCustomSize(false);
            i.setHasCustomDepth(false);
          }
        }
        return selected;
      }
      if (c.op === 'duplicate-instances')
        return selected.map((original) => {
          const copy = container.insertInitialInstance(original);
          copy.resetPersistentUuid();
          copy.setX(original.getX() + (c.dx ?? 16));
          copy.setY(original.getY() + (c.dy ?? 16));
          return copy;
        });
      if (c.op === 'delete-instances') {
        selected.forEach((i) => container.removeInstance(i));
        return [];
      }
      if (c.op === 'add-instance') {
        const i = container.insertNewInitialInstance();
        i.setObjectName(c.object);
        i.setX(c.x);
        i.setY(c.y);
        return [i];
      }
      return selected;
    },
  };
}
