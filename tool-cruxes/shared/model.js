// SPDX-License-Identifier: MIT
import { validateProductivity, productivityStarter, productivityCommand } from './productivity.js';
export const TYPES = ['openmosh', 'tables', 'smplr', 'playcanvas', 'excalidraw', 'univer'];
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone'];
export const PADS = ['kick', 'snare', 'hat', 'clap'];
export const EFFECTS = {
  pixelate: { name: 'Pixelate', params: { size: [1, 80, 8] } },
  posterize: { name: 'Posterize', params: { levels: [2, 32, 6] } },
  scanlines: { name: 'Scanlines', params: { count: [10, 400, 120], amount: [0, 1, 0.4] } },
  kaleido: {
    name: 'Kaleidoscope',
    params: { sides: [2, 16, 6], angle: [0, 360, 0], amount: [0, 1, 1] },
  },
  mirror: { name: 'Mirror', params: { amount: [0, 1, 1], side: [0, 3, 0], position: [0, 1, 0.5] } },
  'data-bend': {
    name: 'Data bend',
    params: { intensity: [0, 1, 0.4], corruption: [0, 1, 0.3], channelShift: [0, 1, 0.2] },
  },
};
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 120) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const id = (v) =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9_-]{1,64}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const unique = (xs) => new Set(xs).size === xs.length;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
export function validateProject(doc, expectedType) {
  assert(
    object(doc) &&
      doc.schemaVersion === 1 &&
      TYPES.includes(doc.type) &&
      (!expectedType || doc.type === expectedType),
    'Choose a version 1 project for this app.',
  );
  assert(text(doc.title), 'Give the project a title of 1–120 characters.');
  if (['excalidraw', 'univer'].includes(doc.type)) {
    validateProductivity(doc);
  } else if (doc.type === 'openmosh') {
    assert(
      doc.source === null ||
        (typeof doc.source === 'string' &&
          /^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(doc.source)),
      'Choose an imported raster image.',
    );
    assert(Array.isArray(doc.effects) && doc.effects.length <= 8, 'Use at most eight effects.');
    for (const effect of doc.effects) {
      const def = object(effect) && EFFECTS[effect.kind];
      assert(def && object(effect.values), 'Unknown effect.');
      assert(
        Object.keys(effect.values).every((k) => Object.hasOwn(def.params, k)),
        'Unknown effect parameter.',
      );
      for (const [key, [min, max]] of Object.entries(def.params))
        assert(number(effect.values[key], min, max), `Invalid ${key} value.`);
    }
    assert(number(doc.time, 0, 3600), 'Choose an effect time between 0 and 3600 seconds.');
  } else if (doc.type === 'tables') {
    assert(
      Array.isArray(doc.columns) &&
        doc.columns.length > 0 &&
        doc.columns.length <= 20 &&
        unique(doc.columns.map((c) => c.key)),
      'Use 1–20 uniquely named columns.',
    );
    for (const c of doc.columns)
      assert(
        object(c) &&
          id(c.key) &&
          c.key !== 'id' &&
          text(c.title, 80) &&
          ['text', 'number'].includes(c.type),
        'Invalid table column.',
      );
    assert(
      Array.isArray(doc.rows) && doc.rows.length <= 2000 && unique(doc.rows.map((r) => r.id)),
      'Use at most 2,000 rows with unique IDs.',
    );
    const keys = new Set(['id', ...doc.columns.map((c) => c.key)]);
    for (const row of doc.rows) {
      assert(
        object(row) && id(row.id) && Object.keys(row).every((k) => keys.has(k)),
        'Invalid row or column key.',
      );
      for (const col of doc.columns) {
        const value = row[col.key];
        assert(
          value === undefined ||
            value === '' ||
            (col.type === 'number'
              ? number(value, -1e12, 1e12)
              : typeof value === 'string' && value.length <= 2000),
          `Invalid value in ${col.title}.`,
        );
      }
    }
  } else if (doc.type === 'smplr') {
    assert(
      number(doc.bpm, 40, 240) && Number.isInteger(doc.bpm),
      'Choose a whole-number tempo between 40 and 240 BPM.',
    );
    assert(number(doc.volume, 0, 100), 'Choose volume between 0 and 100.');
    assert(
      object(doc.pattern) && Object.keys(doc.pattern).length === 4,
      'Use the four sample tracks.',
    );
    for (const pad of PADS)
      assert(
        Array.isArray(doc.pattern[pad]) &&
          doc.pattern[pad].length === 16 &&
          doc.pattern[pad].every((v) => typeof v === 'boolean'),
        'Each track needs 16 on/off steps.',
      );
  } else {
    assert(
      /^#[a-fA-F0-9]{6}$/.test(doc.background) && typeof doc.animate === 'boolean',
      'Choose a background color and animation state.',
    );
    assert(
      Array.isArray(doc.objects) &&
        doc.objects.length <= 100 &&
        unique(doc.objects.map((o) => o.id)),
      'Use at most 100 objects with unique IDs.',
    );
    for (const o of doc.objects) {
      assert(
        object(o) &&
          id(o.id) &&
          text(o.name) &&
          SHAPES.includes(o.shape) &&
          /^#[a-fA-F0-9]{6}$/.test(o.color),
        'Invalid scene object.',
      );
      for (const key of ['position', 'rotation', 'scale'])
        assert(
          Array.isArray(o[key]) &&
            o[key].length === 3 &&
            o[key].every((n) =>
              number(n, key === 'scale' ? 0.1 : -360, key === 'scale' ? 20 : 360),
            ),
          'Invalid object transform.',
        );
    }
  }
  assert(JSON.stringify(doc).length <= 2_000_000, 'The project is too large.');
  return doc;
}
export function tableExample(name = 'projects') {
  const examples = {
    projects: {
      title: 'Launch board',
      columns: [
        ['task', 'Task', 'text'],
        ['owner', 'Owner', 'text'],
        ['status', 'Status', 'text'],
        ['hours', 'Hours', 'number'],
      ],
      rows: [
        {
          id: 'task-1',
          task: 'Design the launch page',
          owner: 'Alex',
          status: 'In progress',
          hours: 6,
        },
        {
          id: 'task-2',
          task: 'Gather customer feedback',
          owner: 'Sam',
          status: 'Planned',
          hours: 3,
        },
      ],
    },
    contacts: {
      title: 'People to know',
      columns: [
        ['name', 'Name', 'text'],
        ['company', 'Company', 'text'],
        ['email', 'Email', 'text'],
        ['stage', 'Stage', 'text'],
      ],
      rows: [
        {
          id: 'contact-1',
          name: 'Alex Rivera',
          company: 'Example Studio',
          email: 'alex@example.com',
          stage: 'Follow up',
        },
      ],
    },
    inventory: {
      title: 'Studio inventory',
      columns: [
        ['item', 'Item', 'text'],
        ['location', 'Location', 'text'],
        ['quantity', 'Quantity', 'number'],
      ],
      rows: [
        { id: 'item-1', item: 'Microphone', location: 'Studio A', quantity: 2 },
        { id: 'item-2', item: 'Sketchbook', location: 'Supply shelf', quantity: 8 },
      ],
    },
  };
  const example = examples[name];
  assert(example, 'Unknown table example.');
  return {
    schemaVersion: 1,
    type: 'tables',
    ...structuredClone(example),
    columns: example.columns.map(([key, title, type]) => ({ key, title, type })),
  };
}
export function starter(type) {
  if (['excalidraw', 'univer'].includes(type)) return productivityStarter(type);
  if (type === 'tables') return tableExample();
  const common = { schemaVersion: 1, type };
  if (type === 'openmosh')
    return {
      ...common,
      title: 'Signal garden',
      source: null,
      time: 0,
      effects: [{ kind: 'pixelate', values: { size: 8 } }],
    };
  if (type === 'smplr')
    return {
      ...common,
      title: 'Pocket rhythm',
      bpm: 100,
      volume: 70,
      pattern: Object.fromEntries(
        PADS.map((p) => [
          p,
          Array.from({ length: 16 }, (_, i) =>
            p === 'kick'
              ? i % 8 === 0
              : p === 'snare'
                ? i % 8 === 4
                : p === 'hat'
                  ? i % 2 === 0
                  : false,
          ),
        ]),
      ),
    };
  return {
    ...common,
    title: 'Little world',
    background: '#18283e',
    animate: true,
    objects: [
      {
        id: 'center',
        name: 'Sunstone',
        shape: 'sphere',
        color: '#efb268',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1.4, 1.4, 1.4],
      },
      {
        id: 'left',
        name: 'Blue tower',
        shape: 'box',
        color: '#7eaff0',
        position: [-2, 1, 0],
        rotation: [0, 20, 0],
        scale: [1, 2, 1],
      },
    ],
  };
}
export function applyCommand(doc, command) {
  if (['excalidraw', 'univer'].includes(doc.type))
    return validateProject(productivityCommand(doc, command), doc.type);
  const next = structuredClone(doc);
  assert(object(command), 'Invalid app command.');
  if (command.op === 'effects' && doc.type === 'openmosh') {
    next.effects = command.effects;
    if (command.time !== undefined) next.time = command.time;
  } else if (command.op === 'rows' && doc.type === 'tables') {
    assert(
      Array.isArray(command.rows) && command.rows.length > 0 && command.rows.length <= 100,
      'Provide 1–100 rows.',
    );
    for (const row of command.rows) {
      assert(object(row) && id(row.id), 'Each row needs an ID.');
      const index = next.rows.findIndex((r) => r.id === row.id);
      if (index < 0) next.rows.push(row);
      else next.rows[index] = { ...next.rows[index], ...row };
    }
  } else if (command.op === 'pattern' && doc.type === 'smplr') {
    if (command.bpm !== undefined) next.bpm = command.bpm;
    if (command.pattern !== undefined) next.pattern = command.pattern;
    if (command.volume !== undefined) next.volume = command.volume;
  } else if (command.op === 'objects' && doc.type === 'playcanvas') {
    assert(
      Array.isArray(command.objects) && command.objects.length > 0 && command.objects.length <= 20,
      'Provide 1–20 scene objects.',
    );
    for (const value of command.objects) {
      assert(object(value) && id(value.id), 'Each object needs an ID.');
      const index = next.objects.findIndex((o) => o.id === value.id);
      if (index < 0) next.objects.push(value);
      else next.objects[index] = { ...next.objects[index], ...value };
    }
  } else throw new Error('This command does not belong to this app.');
  return validateProject(next, doc.type);
}
