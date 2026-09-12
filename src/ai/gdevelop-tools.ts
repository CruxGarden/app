import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const GDEVELOP_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gdevelop',
    description: 'Inspect the native game name and first 100 scenes with object and event counts.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
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
    description: 'Place an instance of an existing object in a scene at x, y.',
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
              parameters: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 500 } },
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
              parameters: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 500 } },
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
        ((item as { parameters: unknown[] }).parameters.length <= 12) &&
        (item as { parameters: unknown[] }).parameters.every(
          (p) => typeof p === 'string' && p.length <= 500,
        ) &&
        Object.keys(item).every(
          (key) =>
            key === 'type' ||
            key === 'parameters' ||
            (allowInverted && key === 'inverted' && typeof (item as { inverted?: unknown }).inverted === 'boolean'),
        ),
    ));
export function gdevelopCommand(name: string, input: Record<string, unknown>) {
  if (name === 'add_gdevelop_resource') {
    if (
      Object.keys(input).length !== 3 ||
      !str(input.path, 240) ||
      !str(input.name, 100) ||
      (input.kind !== 'image' && input.kind !== 'audio')
    )
      throw new Error('Choose a file path in this Crux, a resource name and a kind: image or audio.');
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
  if (name === 'inspect_gdevelop' && !Object.keys(input).length) return { op: 'inspect' };
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
