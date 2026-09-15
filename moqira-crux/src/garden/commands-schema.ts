/** Shared host/iframe input contract. Native models and UI remain upstream-owned. */
import type { CanvasNode, ComponentKind } from '../types';
import { controlCatalogue } from '../lib/canvasNodeSemantics';
import { validateProjectImagePath } from './shared/project-image.js';

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  anyOf?: Schema[];
};
const string = (maxLength = 200, minLength = 1): Schema => ({
  type: 'string',
  minLength,
  maxLength,
});
const number = (minimum: number, maximum: number): Schema => ({ type: 'number', minimum, maximum });
const integer = (minimum: number, maximum: number): Schema => ({
  type: 'integer',
  minimum,
  maximum,
});
const boolean: Schema = { type: 'boolean' };
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items: Schema, maxItems = 100, minItems = 0): Schema => ({
  type: 'array',
  items,
  minItems,
  maxItems,
});
const id = string(100);
const expectedState = string(160);
const color: Schema = {
  type: 'string',
  pattern: '^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|transparent)$',
  maxLength: 11,
};
const point = object({ x: number(-100000, 100000), y: number(-100000, 100000) });
export const propertySchema = object(
  {
    name: string(),
    x: number(-100000, 100000),
    y: number(-100000, 100000),
    width: number(1, 20000),
    height: number(1, 20000),
    text: string(8000, 0),
    fill: color,
    stroke: color,
    textColor: color,
    fontSize: number(1, 300),
    locked: boolean,
    disabled: boolean,
    checked: boolean,
    options: array(string(2000, 0), 200),
    activeIndex: integer(-1, 199),
    showBorder: boolean,
    showScrollbar: boolean,
    opacity: number(0, 100),
    tabPlacement: choice('top', 'bottom'),
    tabAlignment: choice('left', 'center', 'right'),
    textAlign: choice('left', 'center', 'right'),
    textBold: boolean,
    textItalic: boolean,
    textUnderline: boolean,
    textStrikethrough: boolean,
    icon: string(100, 0),
    value: { anyOf: [string(2000, 0), number(-100000, 100000)] },
    orientation: choice('horizontal', 'vertical'),
    variant: string(100, 0),
    placeholder: string(2000, 0),
    arrowLine: choice('curved', 'straight'),
    arrowHeadStart: boolean,
    arrowHeadEnd: boolean,
    arrowStrokeStyle: choice('solid', 'dashed', 'dotted'),
    arrowLabelPosition: number(0, 1),
    arrowStart: point,
    arrowEnd: point,
    arrowControl: point,
    columns: array(string(2000, 0), 200),
    rows: array(string(2000, 0), 200),
  },
  [],
);
const frame = { wireframeId: id };
const guard = { expectedState };
const paging = { offset: integer(0, 100000), limit: integer(1, 100) };
const ids = array(id, 100, 1);
const link = {
  anyOf: [
    object({ kind: choice('wireframe'), wireframeId: id }),
    object({ kind: choice('url'), url: string(2000) }),
    object({ kind: choice('back') }),
    object({ kind: choice('none') }),
  ],
};
const definitions = {
  inspect: [
    'inspect_moqira',
    'Inspect the native wireframe project, active screen, selection, history and fresh state token. Wireframe summaries are paginated.',
    object(paging, []),
  ],
  catalogue: [
    'list_moqira_components',
    'Discover native wireframe components, default properties and categories. Filter by a kind, label or category before creating controls.',
    object({ query: string(100, 0), ...paging }, []),
  ],
  'read-wireframe': [
    'read_moqira_wireframe',
    'Inspect one screen with bounded component summaries, stable IDs and a fresh state token.',
    object({ ...frame, ...paging }, ['wireframeId']),
  ],
  'read-component': [
    'read_moqira_component',
    'Read component properties, native capabilities and link targets without embedding image bytes. Use field/offset/limit to page long text or lists.',
    object(
      {
        ...frame,
        id,
        field: choice('text', 'options', 'rows', 'columns'),
        offset: integer(0, 1000000),
        limit: integer(1, 8000),
      },
      ['wireframeId', 'id'],
    ),
  ],
  'create-wireframe': [
    'create_moqira_wireframe',
    'Create an empty native wireframe in one Undo step. Names are unique; returns its ID.',
    object({ name: string(), ...guard }),
  ],
  'update-wireframe': [
    'update_moqira_wireframe',
    'Revise a screen name, white/black background or grid without replacing its components.',
    object(
      {
        ...frame,
        name: string(),
        background: choice('white', 'black'),
        showGrid: boolean,
        ...guard,
      },
      ['wireframeId', 'expectedState'],
    ),
  ],
  'duplicate-wireframe': [
    'duplicate_moqira_wireframe',
    'Duplicate a screen through the native model with new component IDs. Existing links keep their original destinations, matching native duplication.',
    object({ ...frame, ...guard }),
  ],
  'delete-wireframe': [
    'delete_moqira_wireframe',
    'Delete a screen in one Undo step; retain at least one screen. Nonempty screens require allowNonEmpty. Links to it must be removed first.',
    object({ ...frame, allowNonEmpty: boolean, ...guard }, ['wireframeId', 'expectedState']),
  ],
  'set-view': [
    'set_moqira_view',
    'Choose a screen, selection and edit/interactive mode through native controls. Does not add document Undo history.',
    object({ ...frame, selectedIds: array(id), interactive: boolean, ...guard }, ['expectedState']),
  ],
  'add-components': [
    'add_moqira_components',
    'Add up to 50 native controls in one Undo step, using catalogue defaults plus explicit properties. Returns created IDs; preserves existing components.',
    object({
      ...frame,
      components: array(
        object(
          {
            kind: choice(...new Set(controlCatalogue.map((c) => c.kind))),
            properties: propertySchema,
          },
          ['kind'],
        ),
        50,
        1,
      ),
      ...guard,
    }),
  ],
  'update-components': [
    'update_moqira_components',
    'Apply scoped property patches to existing controls in one Undo step. Omitted properties, images and links survive. Unlock locked controls before editing them.',
    object({
      ...frame,
      patches: array(object({ id, properties: propertySchema }), 100, 1),
      ...guard,
    }),
  ],
  'duplicate-components': [
    'duplicate_moqira_components',
    'Duplicate selected native controls beside their originals, offset by 24 pixels, with new IDs and one Undo step.',
    object({ ...frame, ids, ...guard }),
  ],
  'delete-components': [
    'delete_moqira_components',
    'Delete only the listed controls, preserving other content and native Undo. Unlock locked controls first.',
    object({ ...frame, ids, ...guard }),
  ],
  'reorder-components': [
    'reorder_moqira_components',
    'Move listed controls front/back or one step forward/backward in the native stacking order, preserving their relative order.',
    object({ ...frame, ids, action: choice('front', 'back', 'forward', 'backward'), ...guard }),
  ],
  'set-link': [
    'set_moqira_link',
    'Set one inspected native link target to a screen, an http(s) URL or Back; kind none removes that target. Does not open URLs or publish.',
    object({ ...frame, id, key: string(500), link, ...guard }),
  ],
  'add-image': [
    'add_moqira_image',
    'Load a PNG/JPEG/WebP Artifact from this Crux as a native image control. Preserves its bytes inside the editable project; large images may exceed the 8 MB project limit.',
    object(
      {
        ...frame,
        path: string(240),
        x: number(-100000, 100000),
        y: number(-100000, 100000),
        width: number(1, 20000),
        height: number(1, 20000),
        ...guard,
      },
      ['wireframeId', 'path', 'x', 'y', 'expectedState'],
    ),
  ],
  history: [
    'moqira_history',
    'Undo or Redo one native document edit and confirm the saved result. Native Undo history is session-local; Growth preserves saved versions.',
    object({ direction: choice('undo', 'redo'), ...guard }),
  ],
  'save-project': [
    'save_moqira_project',
    'Save the complete native editable project as a JSON output, including all private wireframes and embedded images. This does not publish it.',
    object({ label: string(100) }),
  ],
} satisfies Record<string, [string, string, Schema]>;
export type CommandOp = keyof typeof definitions;
export type MoqiraCommand = {
  op: CommandOp;
  expectedState?: string;
  wireframeId?: string;
  id?: string;
  name?: string;
  query?: string;
  offset?: number;
  limit?: number;
  field?: 'text' | 'options' | 'rows' | 'columns';
  background?: 'white' | 'black';
  showGrid?: boolean;
  allowNonEmpty?: boolean;
  selectedIds?: string[];
  interactive?: boolean;
  components?: { kind: ComponentKind; properties?: Partial<CanvasNode> }[];
  patches?: { id: string; properties: Partial<CanvasNode> }[];
  ids?: string[];
  action?: 'front' | 'back' | 'forward' | 'backward';
  key?: string;
  link?:
    | { kind: 'wireframe'; wireframeId: string }
    | { kind: 'url'; url: string }
    | { kind: 'back' | 'none' };
  path?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  direction?: 'undo' | 'redo';
  label?: string;
};
export const moqiraDefinitions = Object.entries(definitions).map(
  ([op, [name, description, input_schema]]) => ({
    op: op as CommandOp,
    name,
    description,
    input_schema,
  }),
);
function validate(value: unknown, schema: Schema, path: string): void {
  if (schema.anyOf) {
    if (
      !schema.anyOf.some((option) => {
        try {
          validate(value, option, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      throw Error(`Choose a supported value for ${path}.`);
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error(`${path} must be an object.`);
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !Object.prototype.hasOwnProperty.call(schema.properties, key),
      )
    )
      throw Error(`${path} contains an unsupported field.`);
    if (schema.required?.some((key) => !(key in record)))
      throw Error(`${path} is missing a required field.`);
    for (const [key, entry] of Object.entries(record))
      validate(entry, schema.properties![key]!, `${path}.${key}`);
  } else if (schema.type === 'array') {
    if (
      !Array.isArray(value) ||
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
    )
      throw Error(`${path} has an invalid number of entries.`);
    value.forEach((item, index) => validate(item, schema.items!, `${path}[${index}]`));
  } else if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity) ||
      ((schema.minLength ?? 0) > 0 && !value.trim()) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      throw Error(`${path} must be a valid bounded string.`);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity) ||
      (schema.type === 'integer' && !Number.isInteger(value))
    )
      throw Error(`${path} must be a number within its allowed range.`);
  } else if (schema.type === 'boolean' && typeof value !== 'boolean')
    throw Error(`${path} must be boolean.`);
  if (schema.enum && !schema.enum.includes(value as string))
    throw Error(`${path} must use a listed choice.`);
}
export function validateMoqiraCommand(value: unknown): MoqiraCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Choose a Moqira command.');
  const { op, ...input } = value as Record<string, unknown>;
  if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(definitions, op))
    throw Error('Choose a supported Moqira command.');
  validate(input, definitions[op as CommandOp][2], op);
  if (op === 'update-wireframe' && !['name', 'background', 'showGrid'].some((key) => key in input))
    throw Error('Choose at least one screen property.');
  if (
    op === 'set-view' &&
    !['wireframeId', 'selectedIds', 'interactive'].some((key) => key in input)
  )
    throw Error('Choose a screen, selection or mode.');
  const parsed = { op, ...input } as MoqiraCommand;
  if (parsed.op === 'add-image') validateProjectImagePath(parsed.path);
  if (parsed.patches?.some((patch) => !Object.keys(patch.properties).length))
    throw Error('Supply at least one property per component patch.');
  for (const values of [parsed.ids, parsed.selectedIds, parsed.patches?.map((p) => p.id)])
    if (values && new Set(values).size !== values.length)
      throw Error('Use each component ID only once.');
  if (parsed.link?.kind === 'url') {
    const url = new URL(parsed.link.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw Error('Use an http(s) link without credentials.');
  }
  return parsed;
}
