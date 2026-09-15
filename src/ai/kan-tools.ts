import { commandSchema } from '../../kan-crux/garden/commands-schema';
import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const identity = { type: 'string', minLength: 12, maxLength: 12 };
const nameField = { type: 'string', minLength: 1, maxLength: 255 };
const titleField = { type: 'string', minLength: 1, maxLength: 2000 };
const itemTitle = { type: 'string', minLength: 1, maxLength: 500 };
const indexField = { type: 'integer', minimum: 0, maximum: 10000 };
const colourCode = { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' };
const depthTools: Array<[string, string, string, Record<string, unknown>, string[]]> = [
  [
    'read_kan_card',
    'read-card',
    'Read a native card including rich description, due date, labels, checklists, attachments and recent activity. Returns stateToken for edits. Bounded to 20 activities, 30 checklists and 200 items per checklist.',
    { cardPublicId: identity },
    ['cardPublicId'],
  ],
  [
    'create_kan_board',
    'create-board',
    'Create a local Kan board with a name and up to 30 named lists. Kan boards/cards are distinct from Garden Tasks.',
    { name: nameField, lists: { type: 'array', items: nameField, maxItems: 30 } },
    ['name', 'lists'],
  ],
  [
    'update_kan_board',
    'update-board',
    'Revise the supplied board name/favorite fields, preserving all lists and cards.',
    { boardPublicId: identity, name: nameField, favorite: { type: 'boolean' } },
    ['boardPublicId'],
  ],
  [
    'create_kan_list',
    'create-list',
    'Append a named list to an existing board.',
    { boardPublicId: identity, name: nameField },
    ['boardPublicId', 'name'],
  ],
  [
    'update_kan_list',
    'update-list',
    'Rename or reorder an existing list using a zero-based index in its board.',
    { listPublicId: identity, name: nameField, index: indexField },
    ['listPublicId'],
  ],
  [
    'delete_kan_list',
    'delete-list',
    'Soft-delete a list. Refuses a nonempty list unless deleteCards is explicitly true. Native card activity is retained.',
    { listPublicId: identity, deleteCards: { type: 'boolean' } },
    ['listPublicId'],
  ],
  [
    'update_kan_card_details',
    'card-details',
    'Revise only supplied title, plain-text description or due date fields. Description replaces the rich body with escaped plain text (up to 2000 characters). Due date is ISO 8601 with timezone; null clears it. Other manual card content remains intact.',
    {
      cardPublicId: identity,
      title: titleField,
      description: { type: 'string', maxLength: 2000 },
      dueDate: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    },
    ['cardPublicId'],
  ],
  [
    'duplicate_kan_card',
    'duplicate-card',
    'Duplicate a card within its board into the chosen list/index, copying labels, members and checklists. Native duplication resets checklist completion and omits attachments and comments. Optional title; index defaults to append.',
    { cardPublicId: identity, listPublicId: identity, title: titleField, index: indexField },
    ['cardPublicId', 'listPublicId'],
  ],
  [
    'delete_kan_card',
    'delete-card',
    'Soft-delete an inspected card while preserving native activity/history records.',
    { cardPublicId: identity },
    ['cardPublicId'],
  ],
  [
    'create_kan_label',
    'create-label',
    'Create a named board label with a six-digit hex color.',
    { boardPublicId: identity, name: nameField, colourCode },
    ['boardPublicId', 'name', 'colourCode'],
  ],
  [
    'update_kan_label',
    'update-label',
    'Revise only supplied label name/color fields, updating existing card references.',
    { labelPublicId: identity, name: nameField, colourCode },
    ['labelPublicId'],
  ],
  [
    'set_kan_card_label',
    'set-label',
    'Assign or remove a board label from a card using an explicit boolean. Repeating the requested state does not toggle it.',
    { cardPublicId: identity, labelPublicId: identity, assigned: { type: 'boolean' } },
    ['cardPublicId', 'labelPublicId', 'assigned'],
  ],
  [
    'create_kan_checklist',
    'create-checklist',
    'Add a named checklist to a card.',
    { cardPublicId: identity, name: nameField },
    ['cardPublicId', 'name'],
  ],
  [
    'rename_kan_checklist',
    'update-checklist',
    'Rename a checklist while retaining its items and completion states.',
    { checklistPublicId: identity, name: nameField },
    ['checklistPublicId', 'name'],
  ],
  [
    'delete_kan_checklist',
    'delete-checklist',
    'Soft-delete a checklist and retain its history.',
    { checklistPublicId: identity },
    ['checklistPublicId'],
  ],
  [
    'add_kan_checklist_item',
    'create-item',
    'Append an unchecked item to a checklist. Title is plain text, up to 500 characters.',
    { checklistPublicId: identity, title: itemTitle },
    ['checklistPublicId', 'title'],
  ],
  [
    'update_kan_checklist_item',
    'update-item',
    'Revise supplied item title, completion state or zero-based checklist position.',
    {
      checklistItemPublicId: identity,
      title: itemTitle,
      completed: { type: 'boolean' },
      index: indexField,
    },
    ['checklistItemPublicId'],
  ],
  [
    'delete_kan_checklist_item',
    'delete-item',
    'Soft-delete one checklist item and preserve other items and native activity.',
    { checklistItemPublicId: identity },
    ['checklistItemPublicId'],
  ],
];
export const KAN_TOOLS: AppToolDefinition[] = [
  ...depthTools.map<AppToolDefinition>(([name, op, description, properties, required]) => ({
    name,
    description:
      description +
      (op === 'read-card'
        ? ''
        : ' Supply stateToken from a fresh Kan inspection as expectedState. Uses native operations and confirmed saves. Kan has activity history, not native Undo; Growth preserves saved versions.'),
    input_schema: {
      type: 'object',
      properties: {
        ...properties,
        ...(op === 'read-card'
          ? {}
          : { expectedState: { type: 'string', pattern: '^[a-f0-9-]{36}:\\d+$' } }),
      },
      required: op === 'read-card' ? required : [...required, 'expectedState'],
      additionalProperties: false,
    },
    writes: op === 'read-card' ? [] : ['data/project.json', 'data/'],
    timeoutMs: 180000,
  })),
  {
    name: 'inspect_kan',
    description:
      'Inspect active Kan boards and up to 200 cards in one board. Returns stateToken and board labels. Obtain native board, list and card IDs before editing. Kan cards are distinct from Garden Tasks.',
    input_schema: {
      type: 'object',
      properties: { boardPublicId: identity },
      required: [],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'create_kan_card',
    description:
      'Create a card at the end of an existing Kan list. Description is plain text. Saves through Garden after the native operation succeeds.',
    input_schema: {
      type: 'object',
      properties: {
        listPublicId: identity,
        title: { type: 'string', minLength: 1, maxLength: 2000 },
        description: { type: 'string', maxLength: 10000 },
      },
      required: ['listPublicId', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rename_kan_card',
    description:
      'Change a Kan card title while retaining its identity and native activity history.',
    input_schema: {
      type: 'object',
      properties: {
        cardPublicId: identity,
        title: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['cardPublicId', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'move_kan_card',
    description:
      'Move a Kan card to a list in the same board at a zero-based index. Inspect the board first to choose a valid position.',
    input_schema: {
      type: 'object',
      properties: {
        cardPublicId: identity,
        listPublicId: identity,
        index: { type: 'integer', minimum: 0, maximum: 10000 },
      },
      required: ['cardPublicId', 'listPublicId', 'index'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
const operations: Record<string, string> = {
  inspect_kan: 'inspect',
  create_kan_card: 'create-card',
  rename_kan_card: 'update-card',
  move_kan_card: 'move-card',
  ...Object.fromEntries(depthTools.map(([name, op]) => [name, op])),
};
export function kanCommand(name: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(operations, name) || Object.hasOwn(input, 'op'))
    throw new Error('Choose a supported Kan tool and its declared fields.');
  return commandSchema.parse({ ...input, op: operations[name] });
}
