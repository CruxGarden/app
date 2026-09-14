// SPDX-License-Identifier: MIT
import { cellAddress } from './productivity.js';
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const id = (v) =>
  typeof v === 'string' &&
  /^[\w-]{1,128}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
export function workbookRange(value) {
  assert(
    typeof value === 'string' && /^[A-Z]{1,3}[1-9]\d{0,3}(?::[A-Z]{1,3}[1-9]\d{0,3})?$/.test(value),
    'Use an A1 range such as A1:D8.',
  );
  const [start, end = start] = value.split(':');
  const [r, c] = cellAddress(start),
    [r2, c2] = cellAddress(end);
  assert(
    r2 >= r && c2 >= c && (r2 - r + 1) * (c2 - c + 1) <= 100,
    'Use an ordered range of at most 100 cells.',
  );
  return [r, c, r2, c2];
}
export function validateWorkbookCommand(command) {
  const allowed = {
    cells: ['sheetId', 'cells'],
    'add-sheet': ['name', 'rows', 'columns'],
    'rename-sheet': ['sheetId', 'name'],
    'read-range': ['sheetId', 'range'],
    'format-range': ['sheetId', 'range', 'bold', 'numberFormat', 'background'],
    'save-csv': ['sheetId', 'name'],
  }[command.op];
  assert(
    allowed && Object.keys(command).every((k) => k === 'op' || allowed.includes(k)),
    'Use the documented spreadsheet inputs.',
  );
  if (command.op !== 'add-sheet')
    assert(id(command.sheetId), 'Inspect the workbook for a valid sheet ID.');
  if (['add-sheet', 'rename-sheet', 'save-csv'].includes(command.op)) {
    assert(
      typeof command.name === 'string' &&
        command.name.trim() &&
        command.name.length <= (command.op === 'save-csv' ? 120 : 31),
      'Use a name of 1–31 characters (up to 120 for an output).',
    );
    if (command.op !== 'save-csv')
      assert(!/[\\/\[\]*?:]/.test(command.name), 'Sheet names cannot contain \\ / [ ] * ? or :.');
  }
  if (command.op === 'add-sheet') {
    for (const [key, max] of [
      ['rows', 10000],
      ['columns', 256],
    ])
      if (command[key] !== undefined)
        assert(
          Number.isInteger(command[key]) && command[key] >= 1 && command[key] <= max,
          `Use ${key} between 1 and ${max}.`,
        );
  }
  if (command.range !== undefined || ['read-range', 'format-range'].includes(command.op))
    workbookRange(command.range);
  if (command.op === 'format-range') {
    assert(
      ['bold', 'numberFormat', 'background'].some((k) => command[k] !== undefined),
      'Choose bold, numberFormat or background.',
    );
    if (command.bold !== undefined)
      assert(typeof command.bold === 'boolean', 'Bold must be true or false.');
    if (command.numberFormat !== undefined)
      assert(
        ['general', 'integer', 'decimal', 'percent', 'usd'].includes(command.numberFormat),
        'Choose general, integer, decimal, percent or usd.',
      );
    if (command.background !== undefined)
      assert(
        typeof command.background === 'string' && /^#[\da-f]{6}$/i.test(command.background),
        'Use a six-digit hex background colour.',
      );
  }
  if (command.op === 'cells') {
    assert(
      Array.isArray(command.cells) && command.cells.length >= 1 && command.cells.length <= 100,
      'Provide 1–100 cells.',
    );
    const seen = new Set();
    for (const cell of command.cells) {
      assert(
        cell &&
          typeof cell === 'object' &&
          Object.keys(cell).length === 2 &&
          Object.hasOwn(cell, 'address') &&
          Object.hasOwn(cell, 'value'),
        'Each cell needs only address and value.',
      );
      cellAddress(cell.address);
      assert(!seen.has(cell.address), 'Use each cell address once.');
      seen.add(cell.address);
      const v = cell.value;
      assert(
        v === null ||
          typeof v === 'boolean' ||
          (typeof v === 'number' && Number.isFinite(v)) ||
          (typeof v === 'string' && v.length <= 2000),
        'Use text up to 2,000 characters, finite numbers, booleans or null.',
      );
    }
  }
  return command;
}
