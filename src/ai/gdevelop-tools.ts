import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
import { GDEVELOP_SCENE_TOOLS, gdevelopSceneCommand } from './gdevelop-scene-tools';
import { GDEVELOP_OBJECT_TOOLS, gdevelopObjectCommand } from './gdevelop-object-tools';
import { GDEVELOP_EVENT_TOOLS, gdevelopEventCommand } from './gdevelop-event-tools';
export const GDEVELOP_TOOLS: AppToolDefinition[] = [
  ...GDEVELOP_SCENE_TOOLS,
  ...GDEVELOP_OBJECT_TOOLS,
  ...GDEVELOP_EVENT_TOOLS,
  {
    name: 'inspect_gdevelop',
    description:
      'Inspect the current native game: paginated scene overview, or objects, instances, events, layers, variables or resources. Omit scene for global objects/variables/resources. Results include JSON pointers for read_gdevelop_content; paths/indexes can shift after structural edits. Large entries are explicitly summarized.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        section: {
          type: 'string',
          enum: ['objects', 'instances', 'events', 'layers', 'variables', 'resources'],
        },
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'read_gdevelop_content',
    description:
      'Read exact native game JSON at a pointer returned by inspect_gdevelop (e.g. /layouts/0/events/0 or /layouts/0/objects/0/behaviors). Empty path reads the root. Large values return text chunks with nextOffset and contentFingerprint; pass that as expectedFingerprint for subsequent chunks to reject changed content, concatenate before parsing, or read a smaller childPath. Includes native fields and nested events without modifying the game.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', maxLength: 500 },
        expectedFingerprint: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 8000 },
      },
      required: ['path'],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'list_gdevelop_capabilities',
    description:
      'Search the loaded native action, condition, behavior or object catalogue by query, with pagination. Request an exact action/condition type for ordered parameter types, defaults, optional and code-only slots. Use this before constructing native events; catalogue entries describe the editor and do not imply dedicated Garden editing tools for every entry.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['action', 'condition', 'behavior', 'object'] },
        query: { type: 'string', minLength: 1, maxLength: 200 },
        type: { type: 'string', minLength: 1, maxLength: 200 },
        offset: { type: 'integer', minimum: 0, maximum: 1000000 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'set_gdevelop_name',
    description: 'Name the native GDevelop game and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_gdevelop_background',
    description: 'Set the background color of an existing native scene and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        rgb: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'integer', minimum: 0, maximum: 255 },
        },
      },
      required: ['scene', 'rgb'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_gdevelop_resource',
    description:
      'Register an image or audio file of this Crux (for example one copied in with use_cruxspace_asset) as a named native GDevelop resource.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 240 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        kind: { type: 'string', enum: ['image', 'audio'] },
      },
      required: ['path', 'name', 'kind'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_gdevelop_sprite',
    description:
      'Create a native Sprite object in a scene from an image file of this Crux, with one looping animation. Give frameWidth/frameHeight to slice a sprite sheet into frames. Optional behaviors by native type, for example TopDownMovementBehavior::TopDownMovementBehavior.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        path: { type: 'string', minLength: 1, maxLength: 240 },
        frameWidth: { type: 'integer', minimum: 1, maximum: 4096 },
        frameHeight: { type: 'integer', minimum: 1, maximum: 4096 },
        fps: { type: 'integer', minimum: 1, maximum: 60 },
        behaviors: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 200 } },
      },
      required: ['scene', 'name', 'path'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_gdevelop_instance',
    description:
      'Place an instance of an existing object at x, y in the currently open native scene tab. Uses native scene history and refresh; requires finished property-field editing.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        object: { type: 'string', minLength: 1, maxLength: 100 },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['scene', 'object', 'x', 'y'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_gdevelop_event',
    description:
      'Append one standard event to a scene with native condition and action types and their string parameters, for example condition CollisionNP [Gardener, Seed, "", "", ""] and actions Delete [Seed, ""], PlaySound ["", "chime", "no", "100", "1"].',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        conditions: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', maxLength: 200 },
              parameters: {
                type: 'array',
                maxItems: 12,
                items: { type: 'string', maxLength: 500 },
              },
              inverted: { type: 'boolean' },
            },
            required: ['type', 'parameters'],
            additionalProperties: false,
          },
        },
        actions: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', maxLength: 200 },
              parameters: {
                type: 'array',
                maxItems: 12,
                items: { type: 'string', maxLength: 500 },
              },
            },
            required: ['type', 'parameters'],
            additionalProperties: false,
          },
        },
      },
      required: ['scene'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'export_gdevelop_web_game',
    description:
      'Build the playable web game with the native exporter and save the ZIP as a named output of this Crux for its Cruxspaces (a website member can unpack it).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
const str = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() && value.length <= max;
const instructions = (value: unknown, allowInverted: boolean) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        str((item as { type?: unknown }).type, 200) &&
        Array.isArray((item as { parameters?: unknown }).parameters) &&
        (item as { parameters: unknown[] }).parameters.length <= 12 &&
        (item as { parameters: unknown[] }).parameters.every(
          (p) => typeof p === 'string' && p.length <= 500,
        ) &&
        Object.keys(item).every(
          (key) =>
            key === 'type' ||
            key === 'parameters' ||
            (allowInverted &&
              key === 'inverted' &&
              typeof (item as { inverted?: unknown }).inverted === 'boolean'),
        ),
    ));
export function gdevelopCommand(name: string, input: Record<string, unknown>) {
  const eventCommand = gdevelopEventCommand(name, input);
  if (eventCommand) return eventCommand;
  const objectCommand = gdevelopObjectCommand(name, input);
  if (objectCommand) return objectCommand;
  const sceneCommand = gdevelopSceneCommand(name, input);
  if (sceneCommand) return sceneCommand;
  if (name === 'add_gdevelop_resource') {
    if (
      Object.keys(input).length !== 3 ||
      !str(input.path, 240) ||
      !str(input.name, 100) ||
      (input.kind !== 'image' && input.kind !== 'audio')
    )
      throw new Error(
        'Choose a file path in this Crux, a resource name and a kind: image or audio.',
      );
    return { op: 'add-resource', path: input.path, name: input.name, kind: input.kind };
  }
  if (name === 'add_gdevelop_sprite') {
    const allowed = ['scene', 'name', 'path', 'frameWidth', 'frameHeight', 'fps', 'behaviors'];
    const integer = (v: unknown, max: number) =>
      v === undefined || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max);
    if (
      Object.keys(input).some((key) => !allowed.includes(key)) ||
      !str(input.scene, 200) ||
      !str(input.name, 100) ||
      !str(input.path, 240) ||
      !integer(input.frameWidth, 4096) ||
      !integer(input.frameHeight, 4096) ||
      (input.frameWidth === undefined) !== (input.frameHeight === undefined) ||
      !integer(input.fps, 60) ||
      (input.behaviors !== undefined &&
        (!Array.isArray(input.behaviors) ||
          input.behaviors.length > 8 ||
          !input.behaviors.every((b) => str(b, 200))))
    )
      throw new Error(
        'Choose a scene, an object name, an image path in this Crux, optional frame dimensions (both), fps and behavior types.',
      );
    return { op: 'add-sprite-object', ...input };
  }
  if (name === 'add_gdevelop_instance') {
    if (
      Object.keys(input).length !== 4 ||
      !str(input.scene, 200) ||
      !str(input.object, 100) ||
      ![input.x, input.y].every((v) => typeof v === 'number' && Number.isFinite(v))
    )
      throw new Error('Choose a scene, an existing object and x, y positions.');
    return { op: 'add-instance', ...input };
  }
  if (name === 'add_gdevelop_event') {
    if (
      Object.keys(input).some((key) => !['scene', 'conditions', 'actions'].includes(key)) ||
      !str(input.scene, 200) ||
      !instructions(input.conditions, true) ||
      !instructions(input.actions, false) ||
      (!(input.conditions as unknown[] | undefined)?.length &&
        !(input.actions as unknown[] | undefined)?.length)
    )
      throw new Error(
        'Choose a scene and up to 8 conditions and 8 actions, each with a native type and string parameters.',
      );
    return { op: 'add-event', ...input };
  }
  if (name === 'export_gdevelop_web_game') {
    if (Object.keys(input).length !== 1 || !str(input.name, 120))
      throw new Error('Name the exported game using up to 120 characters.');
    return { op: 'export-web-game', name: input.name };
  }
  if (['inspect_gdevelop', 'read_gdevelop_content', 'list_gdevelop_capabilities'].includes(name)) {
    const allowed =
      name === 'inspect_gdevelop'
        ? ['scene', 'section', 'offset', 'limit']
        : name === 'read_gdevelop_content'
          ? ['path', 'offset', 'limit', 'expectedFingerprint']
          : ['kind', 'query', 'type', 'offset', 'limit'];
    const maxLimit = name === 'read_gdevelop_content' ? 8000 : 50;
    if (
      Object.keys(input).some((key) => !allowed.includes(key)) ||
      (input.offset !== undefined &&
        (!Number.isSafeInteger(input.offset) ||
          (input.offset as number) < 0 ||
          (input.offset as number) > 1000000)) ||
      (input.limit !== undefined &&
        (!Number.isInteger(input.limit) ||
          (input.limit as number) < 1 ||
          (input.limit as number) > maxLimit))
    )
      throw new Error(
        `Use only the listed inspection fields, an offset from 0 to 1000000 and a limit from 1 to ${maxLimit}.`,
      );
    if (name === 'inspect_gdevelop') {
      if (
        (input.scene !== undefined && !str(input.scene, 200)) ||
        (input.section !== undefined &&
          !['objects', 'instances', 'events', 'layers', 'variables', 'resources'].includes(
            input.section as string,
          )) ||
        (input.scene !== undefined &&
          (input.section === undefined || input.section === 'resources')) ||
        (['instances', 'events', 'layers'].includes(input.section as string) &&
          input.scene === undefined)
      )
        throw new Error(
          'Choose an existing scene and section; omit scene for global objects, variables or resources.',
        );
      return { op: 'inspect', ...input };
    }
    if (name === 'read_gdevelop_content') {
      if (
        typeof input.path !== 'string' ||
        input.path.length > 500 ||
        (input.path !== '' && !input.path.startsWith('/')) ||
        /~(?![01])/.test(input.path)
      )
        throw new Error(
          'Choose a JSON pointer returned by inspection, or an empty path for the root.',
        );
      if (
        input.expectedFingerprint !== undefined &&
        (typeof input.expectedFingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/.test(input.expectedFingerprint))
      )
        throw new Error('Use the contentFingerprint returned by the first read.');
      return { op: 'read-content', ...input };
    }
    if (
      !['action', 'condition', 'behavior', 'object'].includes(input.kind as string) ||
      (input.query !== undefined && !str(input.query, 200)) ||
      (input.type !== undefined && !str(input.type, 200)) ||
      (input.query !== undefined && input.type !== undefined)
    )
      throw new Error(
        'Choose a capability kind and either a search query or an exact native type.',
      );
    return { op: 'catalogue', ...input };
  }
  if (
    name === 'set_gdevelop_name' &&
    Object.keys(input).length === 1 &&
    typeof input.name === 'string' &&
    input.name.trim() &&
    input.name.length <= 200
  )
    return { op: 'set-name', name: input.name };
  if (
    name === 'set_gdevelop_background' &&
    Object.keys(input).length === 2 &&
    typeof input.scene === 'string' &&
    input.scene.trim() &&
    input.scene.length <= 200 &&
    Array.isArray(input.rgb) &&
    input.rgb.length === 3 &&
    input.rgb.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  )
    return { op: 'set-background', scene: input.scene, rgb: input.rgb };
  throw new Error('Choose a game name or an existing scene and three RGB integers from 0 to 255.');
}
