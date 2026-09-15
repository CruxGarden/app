// Read native serialized state without replacing it or changing editor/history state.
const sections = ['objects', 'instances', 'events', 'layers', 'variables', 'resources'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const escape = (key) => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
const page = (offset = 0, limit = 20, max = 50) => {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1000000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > max
  )
    throw new Error(`Use an offset from 0 to 1000000 and a limit from 1 to ${max}.`);
  return { offset, limit };
};
const exact = (command, keys) => {
  if (Object.keys(command).some((key) => !keys.includes(key)))
    throw new Error('Unsupported inspection argument.');
};
const short = (value, max = 160) => String(value ?? '').slice(0, max);
function summarize(value, path) {
  const json = JSON.stringify(value);
  if (json.length <= 1200) return { path, value, complete: true };
  return {
    path,
    complete: false,
    characters: json.length,
    preview: Array.isArray(value)
      ? { count: value.length }
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .slice(0, 20)
              .map(([key, child]) => [
                key,
                child && typeof child === 'object'
                  ? {
                      type: Array.isArray(child) ? 'array' : 'object',
                      count: Object.keys(child).length,
                    }
                  : typeof child === 'string'
                    ? short(child)
                    : child,
              ]),
          )
        : short(value),
    readWith: 'read_gdevelop_content',
  };
}
export function inspectGame(document, command) {
  exact(command, ['op', 'scene', 'section', 'offset', 'limit']);
  const { offset, limit } = page(command.offset, command.limit);
  if (
    command.scene !== undefined &&
    (typeof command.scene !== 'string' || !command.scene.trim() || command.scene.length > 200)
  )
    throw new Error('Choose a scene name.');
  const layouts = document.layouts || [];
  if (command.section === undefined) {
    if (command.scene !== undefined) throw new Error('Choose a section when inspecting a scene.');
    return {
      name: document.properties?.name,
      total: layouts.length,
      offset,
      nextOffset: offset + limit < layouts.length ? offset + limit : null,
      scenes: layouts.slice(offset, offset + limit).map((scene, i) => ({
        name: short(scene.name, 200),
        path: `/layouts/${offset + i}`,
        objects: scene.objects?.length || 0,
        instances: scene.instances?.length || 0,
        events: scene.events?.length || 0,
      })),
      sections,
      globalObjectsPath: '/objects',
      resourcesPath: '/resources/resources',
      note: 'Paths and array indexes describe this inspection; inspect again after structural edits. Read any native subtree with read_gdevelop_content.',
    };
  }
  if (!sections.includes(command.section))
    throw new Error('Choose objects, instances, events, layers, variables or resources.');
  let values, path;
  if (command.section === 'resources') {
    if (command.scene !== undefined) throw new Error('Resources belong to the game; omit scene.');
    values = document.resources?.resources || [];
    path = '/resources/resources';
  } else if (command.scene === undefined && ['objects', 'variables'].includes(command.section)) {
    path = '/' + command.section;
    values = document[command.section] || [];
  } else {
    const index = layouts.findIndex((scene) => scene.name === command.scene);
    if (index < 0) throw new Error('Choose an existing scene from inspect_gdevelop.');
    path = `/layouts/${index}/${command.section}`;
    values = layouts[index][command.section] || [];
  }
  const items = [];
  let nextOffset = offset;
  for (let i = offset; i < Math.min(values.length, offset + limit); i++) {
    const item = summarize(values[i], path + '/' + i);
    if (JSON.stringify(items).length + JSON.stringify(item).length > 10000 && items.length) break;
    items.push(item);
    nextOffset = i + 1;
  }
  return {
    section: command.section,
    scene: command.scene,
    path,
    total: values.length,
    offset,
    nextOffset: nextOffset < values.length ? nextOffset : null,
    items,
  };
}
export async function readGameContent(document, command) {
  exact(command, ['op', 'path', 'offset', 'limit', 'expectedFingerprint']);
  if (
    command.expectedFingerprint !== undefined &&
    (typeof command.expectedFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(command.expectedFingerprint))
  )
    throw new Error('Use the contentFingerprint returned by the first read.');
  const { offset, limit } = page(command.offset, command.limit ?? 8000, 8000);
  if (
    typeof command.path !== 'string' ||
    command.path.length > 500 ||
    (command.path !== '' && !command.path.startsWith('/')) ||
    /~(?![01])/.test(command.path)
  )
    throw new Error(
      'Use a JSON pointer returned by inspection, such as /layouts/0/events/0 (empty string reads the root).',
    );
  let value = document;
  for (const encoded of command.path === '' ? [] : command.path.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (
      !value ||
      typeof value !== 'object' ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) ||
      !own(value, key)
    )
      throw new Error('This path does not exist. Inspect the current game again.');
    value = value[key];
  }
  const json = JSON.stringify(value);
  const contentFingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (
    command.expectedFingerprint !== undefined &&
    command.expectedFingerprint !== contentFingerprint
  )
    throw new Error('This content changed between reads. Inspect again and restart from offset 0.');
  return {
    path: command.path,
    contentFingerprint,
    format: 'json',
    offset,
    totalCharacters: json.length,
    text: json.slice(offset, offset + limit),
    nextOffset: offset + limit < json.length ? offset + limit : null,
    childPaths:
      value && typeof value === 'object'
        ? Object.keys(value)
            .slice(0, 20)
            .map((key) => command.path + '/' + escape(key))
        : [],
    note: 'Text chunks use JavaScript string offsets; concatenate chunks from an unchanged document before parsing. Prefer a child path for large content.',
  };
}

/** Metadata comes from the loaded native platform, including object and behavior instructions. */
export function gameCatalogue(gd, platform, command) {
  exact(command, ['op', 'kind', 'query', 'type', 'offset', 'limit']);
  const { offset, limit } = page(command.offset, command.limit, 50);
  if (!['action', 'condition', 'behavior', 'object'].includes(command.kind))
    throw new Error('Choose action, condition, behavior or object.');
  for (const key of ['query', 'type'])
    if (
      command[key] !== undefined &&
      (typeof command[key] !== 'string' || command[key].length > 200 || !command[key].trim())
    )
      throw new Error('Use a nonempty query or exact native type up to 200 characters.');
  if (command.type !== undefined && command.query !== undefined)
    throw new Error('Choose either a search query or an exact type.');
  const found = new Map();
  const add = (type, metadata, extension, scope) => {
    if (metadata.isHidden?.() || metadata.isPrivate?.()) return;
    if (command.type !== undefined && type !== command.type) return;
    const label = metadata.getFullName();
    if (
      command.query &&
      !`${type} ${label} ${metadata.getDescription()}`
        .toLowerCase()
        .includes(command.query.toLowerCase())
    )
      return;
    if (!found.has(type))
      found.set(type, {
        type,
        label: short(label, 200),
        description: short(metadata.getDescription(), 500),
        extension,
        ...scope,
        metadata,
      });
  };
  const instructions = (map, extension, scope) => {
    const keys = map.keys();
    // Emscripten value-return vectors use binding-owned storage, as in the native enumerator.
    for (let i = 0; i < keys.size(); i++) add(keys.at(i), map.get(keys.at(i)), extension, scope);
  };
  const extensions = platform.getAllPlatformExtensions(); // Borrowed, do not delete.
  for (let i = 0; i < extensions.size(); i++) {
    const extension = extensions.at(i),
      name = extension.getName();
    const objects = extension.getExtensionObjectsTypes(),
      behaviors = extension.getBehaviorsTypes();
    {
      if (command.kind === 'action' || command.kind === 'condition') {
        const stem = command.kind === 'action' ? 'getAllActions' : 'getAllConditions';
        instructions(extension[stem](), name, {});
        for (let j = 0; j < objects.size(); j++)
          instructions(extension[stem + 'ForObject'](objects.at(j)), name, {
            objectType: objects.at(j),
          });
        for (let j = 0; j < behaviors.size(); j++)
          instructions(extension[stem + 'ForBehavior'](behaviors.at(j)), name, {
            behaviorType: behaviors.at(j),
          });
      } else {
        const types = command.kind === 'object' ? objects : behaviors;
        for (let j = 0; j < types.size(); j++)
          add(
            types.at(j),
            command.kind === 'object'
              ? extension.getObjectMetadata(types.at(j))
              : extension.getBehaviorMetadata(types.at(j)),
            name,
            {},
          );
      }
    }
  }
  const matches = [...found.values()].sort((a, b) =>
    a.type < b.type ? -1 : a.type > b.type ? 1 : 0,
  );
  if (command.type && !matches.length)
    throw new Error('Unknown or hidden native type. Search the catalogue first.');
  const items = matches.slice(offset, offset + limit).map(({ metadata, ...item }) => {
    if (command.type && ['action', 'condition'].includes(command.kind)) {
      item.parameterCount = metadata.getParametersCount();
      item.parameters = Array.from({ length: Math.min(item.parameterCount, 20) }, (_, index) => {
        const p = metadata.getParameter(index);
        return {
          index,
          type: p.getType(),
          description: short(p.getDescription(), 160),
          optional: p.isOptional(),
          codeOnly: p.isCodeOnly(),
          defaultValue: short(p.getDefaultValue(), 80),
          defaultValueTruncated: p.getDefaultValue().length > 80,
          extraInfo: short(p.getExtraInfo(), 80),
          extraInfoTruncated: p.getExtraInfo().length > 80,
        };
      });
      item.parametersComplete = item.parameterCount <= 20;
      item.canHaveSubInstructions = metadata.canHaveSubInstructions();
    }
    return item;
  });
  // Keep metadata pages small, even for verbose upstream descriptions.
  while (JSON.stringify(items).length > 12000 && items.length > 1) items.pop();
  return {
    kind: command.kind,
    total: matches.length,
    offset,
    nextOffset: offset + items.length < matches.length ? offset + items.length : null,
    items,
    note: 'These are native editor capabilities, not a promise that every operation has a Garden tool. For action/condition parameters, request the exact type; retain code-only slots in native parameter order. Labels/descriptions are excerpts; truncated defaults and extra info are explicitly flagged.',
  };
}
