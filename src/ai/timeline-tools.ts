import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const DATE = {
  type: 'object',
  properties: {
    year: { type: 'integer' },
    month: { type: 'integer', minimum: 1, maximum: 12 },
    day: { type: 'integer', minimum: 1, maximum: 31 },
    hour: { type: 'integer', minimum: 0, maximum: 23 },
    minute: { type: 'integer', minimum: 0, maximum: 59 },
    display_date: { type: 'string', maxLength: 200 },
  },
  required: ['year'],
  additionalProperties: false,
} as const;
const TEXT = {
  type: 'object',
  properties: { headline: { type: 'string', maxLength: 1000 }, text: { type: 'string', maxLength: 40000 } },
  additionalProperties: false,
} as const;
const MEDIA = {
  type: 'object',
  properties: {
    url: { type: 'string', maxLength: 4000 },
    caption: { type: 'string', maxLength: 4000 },
    credit: { type: 'string', maxLength: 4000 },
    thumbnail: { type: 'string', maxLength: 4000 },
    alt: { type: 'string', maxLength: 1000 },
  },
  additionalProperties: false,
} as const;
const EVENT = {
  type: 'object',
  properties: {
    unique_id: { type: 'string', minLength: 1, maxLength: 120 },
    start_date: DATE,
    end_date: DATE,
    text: TEXT,
    media: MEDIA,
    group: { type: 'string', maxLength: 200 },
    display_date: { type: 'string', maxLength: 200 },
    background: {
      type: 'object',
      properties: { url: { type: 'string', maxLength: 4000 }, color: { type: 'string', maxLength: 40 } },
      additionalProperties: false,
    },
  },
  required: ['start_date', 'text'],
  additionalProperties: false,
} as const;
/** TimelineJS App Tools: read the timeline, name it, replace it, add or change events, remove events. */
export const TIMELINE_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_timeline',
    description:
      'Read the open timeline: its name, title headline, groups, the number of events and eras, and the events (unique_id, headline, start, end, group, media URL; first 200). Read data/project.json for the whole JSON.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_timeline_name',
    description: 'Name the timeline and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_timeline',
    description:
      'Replace the whole timeline with TimelineJS JSON: an optional title slide (text.headline, text.text, media), events (each with start_date {year, month?, day?}, text {headline, text}, optional end_date, media {url, caption, credit}, group, unique_id), optional eras (start_date, end_date, text) and scale (human or cosmological). Saves the timeline.',
    input_schema: {
      type: 'object',
      properties: {
        timeline: {
          type: 'object',
          properties: {
            title: { type: 'object', properties: { text: TEXT, media: MEDIA }, additionalProperties: false },
            events: { type: 'array', items: EVENT, maxItems: 2000 },
            eras: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                properties: { start_date: DATE, end_date: DATE, text: TEXT },
                required: ['start_date', 'end_date'],
                additionalProperties: false,
              },
            },
            scale: { type: 'string', enum: ['human', 'cosmological'] },
          },
          required: ['events'],
          additionalProperties: false,
        },
      },
      required: ['timeline'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'upsert_events',
    description:
      'Add events to the timeline, or change the ones whose unique_id already exists (the whole event is replaced). Each event needs start_date {year, month?, day?} and text {headline, text?}; end_date, media {url, caption, credit}, group and unique_id are optional. Saves the timeline.',
    input_schema: {
      type: 'object',
      properties: { events: { type: 'array', items: EVENT, minItems: 1, maxItems: 500 } },
      required: ['events'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'remove_events',
    description: 'Remove events by unique_id (inspect_timeline lists them) and save the timeline.',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 }, minItems: 1, maxItems: 500 } },
      required: ['ids'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function timelineCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_timeline' && !keys.length) return { op: 'inspect' };
  if (name === 'set_timeline_name') {
    if (!only(['name']) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)
      throw new Error('Name the timeline (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_timeline') {
    if (!only(['timeline']) || !input.timeline || typeof input.timeline !== 'object' || Array.isArray(input.timeline))
      throw new Error('Give the timeline as TimelineJS JSON with an events list.');
    if (JSON.stringify(input.timeline).length > 3_500_000) throw new Error('The timeline is too large (3.5 MB).');
    return { op: 'set-timeline', timeline: input.timeline };
  }
  if (name === 'upsert_events') {
    if (!only(['events']) || !Array.isArray(input.events) || !input.events.length || input.events.length > 500)
      throw new Error('Give 1 to 500 events.');
    if (input.events.some((e) => !e || typeof e !== 'object' || Array.isArray(e)))
      throw new Error('Each event is an object with start_date and text.');
    return { op: 'upsert-events', events: input.events };
  }
  if (name === 'remove_events') {
    if (
      !only(['ids']) ||
      !Array.isArray(input.ids) ||
      !input.ids.length ||
      input.ids.length > 500 ||
      input.ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 120)
    )
      throw new Error('Give the unique_ids of the events to remove.');
    return { op: 'remove-events', ids: input.ids };
  }
  throw new Error(`Unknown timeline tool ${name}.`);
}
