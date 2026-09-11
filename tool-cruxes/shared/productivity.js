// SPDX-License-Identifier: MIT
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const object = (x) => x && typeof x === 'object' && !Array.isArray(x);
const safeId = (x) =>
  typeof x === 'string' &&
  /^[\w-]{1,128}$/.test(x) &&
  !['__proto__', 'constructor', 'prototype'].includes(x);
const finite = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
export const DRAW_TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow'];
export function cellAddress(address) {
  assert(
    typeof address === 'string' && /^[A-Z]{1,3}[1-9]\d{0,3}$/.test(address),
    'Use a cell address such as B4.',
  );
  const [, letters, digits] = /^([A-Z]+)(\d+)$/.exec(address);
  let col = 0;
  for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64;
  assert(col <= 256, 'Use columns A through IV.');
  return [Number(digits) - 1, col - 1];
}
export function drawingElement(input) {
  const {
    id,
    type,
    x = 80,
    y = 80,
    width = 180,
    height = 100,
    text = '',
    strokeColor = '#1e1e1e',
    backgroundColor = 'transparent',
  } = input;
  assert(safeId(id) && DRAW_TYPES.includes(type), 'Choose a shape type and unique ID.');
  assert(
    [x, y].every((n) => finite(n, -100000, 100000)) &&
      [width, height].every((n) => finite(n, 1, 10000)),
    'Invalid drawing coordinates.',
  );
  assert(typeof text === 'string' && text.length <= 2000, 'Use text up to 2,000 characters.');
  const shape = {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };
  if (type === 'text')
    Object.assign(shape, {
      text,
      originalText: text,
      fontSize: 20,
      fontFamily: 5,
      textAlign: 'left',
      verticalAlign: 'top',
      containerId: null,
      autoResize: false,
      lineHeight: 1.25,
    });
  if (type === 'arrow')
    Object.assign(shape, {
      points: [
        [0, 0],
        [width, height],
      ],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: false,
    });
  return shape;
}
export function productivityStarter(type) {
  if (type === 'excalidraw')
    return {
      schemaVersion: 1,
      type,
      title: 'Idea map',
      scene: {
        elements: [
          drawingElement({
            id: 'idea',
            type: 'rectangle',
            x: 100,
            y: 120,
            width: 280,
            height: 160,
            backgroundColor: '#b2f2bb',
          }),
          drawingElement({
            id: 'label',
            type: 'text',
            x: 130,
            y: 170,
            width: 230,
            height: 40,
            text: 'Where ideas grow',
          }),
        ],
        appState: { viewBackgroundColor: '#ffffff', gridSize: null },
        assets: {},
      },
    };
  const cellData = {
    0: {
      0: { v: 'Studio budget' },
      1: { v: 'Quantity' },
      2: { v: 'Unit cost' },
      3: { v: 'Total' },
    },
    1: { 0: { v: 'Sketchbooks' }, 1: { v: 4 }, 2: { v: 12 }, 3: { f: '=B2*C2' } },
    2: { 0: { v: 'Workshop materials' }, 1: { v: 2 }, 2: { v: 35 }, 3: { f: '=B3*C3' } },
    4: { 2: { v: 'Grand total' }, 3: { f: '=SUM(D2:D3)' } },
  };
  return {
    schemaVersion: 1,
    type: 'univer',
    title: 'Studio budget',
    workbook: {
      id: 'budget',
      name: 'Studio budget',
      appVersion: '0.25.1',
      locale: 'enUS',
      styles: {},
      sheetOrder: ['budget-sheet'],
      sheets: {
        'budget-sheet': {
          id: 'budget-sheet',
          name: 'Budget',
          rowCount: 100,
          columnCount: 20,
          cellData,
          columnData: { 0: { w: 240 }, 1: { w: 110 }, 2: { w: 130 }, 3: { w: 130 } },
        },
      },
    },
  };
}
export function validateProductivity(doc) {
  if (doc.type === 'excalidraw') {
    const s = doc.scene;
    assert(
      object(s) &&
        Array.isArray(s.elements) &&
        s.elements.length <= 2000 &&
        object(s.appState) &&
        object(s.assets),
      'Use a whiteboard with at most 2,000 elements.',
    );
    assert(
      new Set(s.elements.map((e) => e.id)).size === s.elements.length,
      'Drawing element IDs must be unique.',
    );
    assert(Object.keys(s.assets).length <= 40, 'Use at most 40 images.');
    for (const [key, path] of Object.entries(s.assets))
      assert(
        safeId(key) &&
          typeof path === 'string' &&
          /^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(path),
        'Images must reference imported raster Artifacts.',
      );
    for (const e of s.elements) {
      assert(
        object(e) &&
          safeId(e.id) &&
          [...DRAW_TYPES, 'line', 'freedraw', 'image', 'frame'].includes(e.type),
        'Unsupported drawing element.',
      );
      assert(
        [e.x, e.y].every((n) => finite(n, -100000, 100000)) &&
          [e.width, e.height].every((n) => finite(n, 0, 100000)),
        'Invalid element bounds.',
      );
      if (e.type === 'image' && !e.isDeleted)
        assert(
          safeId(e.fileId) && Object.hasOwn(s.assets, e.fileId),
          'An image is missing its saved asset.',
        );
    }
    assert(!Object.hasOwn(s, 'files'), 'Keep image bytes separate from the drawing.');
  } else {
    const w = doc.workbook;
    assert(
      object(w) &&
        safeId(w.id) &&
        object(w.sheets) &&
        Array.isArray(w.sheetOrder) &&
        w.sheetOrder.length > 0 &&
        w.sheetOrder.length <= 20 &&
        new Set(w.sheetOrder).size === w.sheetOrder.length,
      'Use a workbook with 1–20 sheets.',
    );
    assert(
      Object.keys(w.sheets).length === w.sheetOrder.length &&
        w.sheetOrder.every((id) => safeId(id) && Object.hasOwn(w.sheets, id)),
      'Workbook sheet order must match its sheets.',
    );
    let populated = 0;
    for (const id of w.sheetOrder) {
      const s = w.sheets[id];
      assert(
        s.id === id &&
          typeof s.name === 'string' &&
          s.name.length <= 120 &&
          Number.isInteger(s.rowCount) &&
          finite(s.rowCount, 1, 10000) &&
          Number.isInteger(s.columnCount) &&
          finite(s.columnCount, 1, 256) &&
          object(s.cellData || {}),
        'Use sheets up to 10,000 rows and 256 columns.',
      );
      for (const [row, values] of Object.entries(s.cellData || {})) {
        assert(/^\d+$/.test(row) && Number(row) < s.rowCount && object(values), 'Invalid row.');
        for (const [col, cell] of Object.entries(values)) {
          populated++;
          assert(
            /^\d+$/.test(col) && Number(col) < s.columnCount && (cell === null || object(cell)),
            'Invalid cell.',
          );
          if (!cell) continue;
          assert(
            cell.v == null ||
              ['string', 'boolean'].includes(typeof cell.v) ||
              (typeof cell.v === 'number' && Number.isFinite(cell.v)),
            'Invalid cell value.',
          );
          assert(
            cell.f == null ||
              (typeof cell.f === 'string' && cell.f.startsWith('=') && cell.f.length <= 2000),
            'Invalid formula.',
          );
        }
      }
    }
    assert(
      populated <= 20000,
      'Use at most 20,000 populated cells in this first spreadsheet tool.',
    );
  }
}
export function productivityCommand(doc, command) {
  const next = structuredClone(doc);
  if (doc.type === 'excalidraw' && command.op === 'drawing') {
    assert(
      Array.isArray(command.elements) &&
        command.elements.length > 0 &&
        command.elements.length <= 30,
      'Provide 1–30 shapes.',
    );
    for (const value of command.elements) {
      assert(object(value) && safeId(value.id), 'Each shape needs an ID.');
      assert(
        Object.keys(value).every((k) =>
          [
            'id',
            'type',
            'x',
            'y',
            'width',
            'height',
            'text',
            'strokeColor',
            'backgroundColor',
          ].includes(k),
        ),
        'Unknown shape property.',
      );
      if (Object.hasOwn(value, 'text'))
        assert(
          typeof value.text === 'string' && value.text.length <= 2000,
          'Use text up to 2,000 characters.',
        );
      for (const color of ['strokeColor', 'backgroundColor'])
        if (Object.hasOwn(value, color))
          assert(
            typeof value[color] === 'string' &&
              /^(transparent|#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8}))$/.test(
                value[color],
              ),
            'Use a hex color or transparent.',
          );
      const i = next.scene.elements.findIndex((e) => e.id === value.id);
      if (i < 0) next.scene.elements.push(drawingElement(value));
      else {
        const e = next.scene.elements[i];
        assert(
          DRAW_TYPES.includes(e.type) && (!value.type || value.type === e.type),
          'Keep the existing shape type.',
        );
        const allowed = [
          'id',
          'type',
          'x',
          'y',
          'width',
          'height',
          'text',
          'strokeColor',
          'backgroundColor',
        ];
        assert(
          Object.keys(value).every((k) => allowed.includes(k)),
          'Unknown shape property.',
        );
        Object.assign(e, value, {
          version: e.version + 1,
          versionNonce: e.versionNonce + 1,
          updated: Date.now(),
        });
        if (e.type === 'text' && value.text !== undefined) e.originalText = value.text;
      }
    }
  } else if (doc.type === 'univer' && command.op === 'cells') {
    assert(
      safeId(command.sheetId) && Object.hasOwn(next.workbook.sheets, command.sheetId),
      'Inspect the workbook for its sheet IDs first.',
    );
    assert(
      Array.isArray(command.cells) && command.cells.length > 0 && command.cells.length <= 100,
      'Provide 1–100 cells.',
    );
    const sheet = next.workbook.sheets[command.sheetId];
    for (const cell of command.cells) {
      const [row, col] = cellAddress(cell.address);
      assert(row < sheet.rowCount && col < sheet.columnCount, 'This cell is outside the sheet.');
      const value = cell.value;
      assert(
        value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'string' && value.length <= 2000) ||
          (typeof value === 'number' && Number.isFinite(value)),
        'Use text, numbers, booleans or null.',
      );
      sheet.cellData ??= {};
      sheet.cellData[row] ??= {};
      const previous = sheet.cellData[row][col];
      sheet.cellData[row][col] = {
        ...(previous?.s ? { s: previous.s } : {}),
        ...(typeof value === 'string' && value.startsWith('=')
          ? { f: value, v: null }
          : { v: value }),
      };
    }
  } else throw new Error('This command does not belong to this app.');
  return next;
}
export function inspectProductivity(doc) {
  if (doc.type === 'excalidraw')
    return {
      ...doc,
      scene: { ...doc.scene, elements: doc.scene.elements.slice(0, 100) },
      elementCount: doc.scene.elements.length,
    };
  return {
    title: doc.title,
    type: doc.type,
    sheets: doc.workbook.sheetOrder.map((id) => ({
      id,
      name: doc.workbook.sheets[id].name,
      rowCount: doc.workbook.sheets[id].rowCount,
      columnCount: doc.workbook.sheets[id].columnCount,
      firstRows: Object.fromEntries(
        Object.entries(doc.workbook.sheets[id].cellData || {}).slice(0, 20),
      ),
    })),
  };
}
export function sheetCSV(sheet) {
  const rows = Object.entries(sheet.cellData || {});
  const maxRow = Math.max(0, ...rows.map(([r]) => Number(r)));
  const maxCol = Math.max(0, ...rows.flatMap(([, cells]) => Object.keys(cells).map(Number)));
  const quote = (v) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  return Array.from({ length: maxRow + 1 }, (_, r) =>
    Array.from({ length: maxCol + 1 }, (_, c) => quote(sheet.cellData?.[r]?.[c]?.v)).join(','),
  ).join('\r\n');
}
