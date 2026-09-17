import { gameCatalogue } from './inspection.mjs';
const name = (v) => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(v);

/** Native object creation; configure it with the existing inspected-property tools. */
export function addNativeObject(gd, project, command) {
  if (
    Object.keys(command).some((k) => !['op', 'scene', 'name', 'type'].includes(k)) ||
    !name(command.name) ||
    typeof command.scene !== 'string' ||
    !project.hasLayoutNamed(command.scene)
  )
    throw new Error('Choose an existing scene, native object type and a new object name.');
  if (
    typeof command.type !== 'string' ||
    !command.type.trim() ||
    command.type.length > 200 ||
    command.type.startsWith('SpineObject::')
  )
    throw new Error('Choose a supported native object type from the catalogue.');
  gameCatalogue(gd, project.getCurrentPlatform(), { kind: 'object', type: command.type });
  const objects = project.getLayout(command.scene).getObjects();
  if (objects.hasObjectNamed(command.name) || project.getObjects().hasObjectNamed(command.name))
    throw new Error('An object with this name already exists.');
  const object = objects.insertNewObject(
    project,
    command.type,
    command.name,
    objects.getObjectsCount(),
  );
  return {
    scene: command.scene,
    object: object.getName(),
    type: object.getType(),
    note: 'Created with native defaults. Inspect properties to configure resources, dimensions and text; add instances to place it. Growth preserves object edits.',
  };
}

export function validateResourceFile(kind, bytes, mimeType) {
  if (kind === 'image' || kind === 'audio') {
    if (!mimeType.startsWith(kind + '/'))
      throw new Error('Choose a file of the requested media kind.');
    return;
  }
  if (kind !== 'model3D') throw new Error('Choose image, audio or model3D.');
  if (bytes.byteLength < 20) throw new Error('Choose a complete GLB 2 model.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== bytes.byteLength
  )
    throw new Error('Choose a complete GLB 2 model.');
}
