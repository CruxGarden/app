// SPDX-License-Identifier: MIT
import {
  createUniver,
  LocaleType,
  mergeLocales,
  UniverSheetsCorePreset,
  enUS,
} from './vendor/engine.js';
import { $, message, download, openProject } from './shared/session.js';
import { validateWorkbookCommand, workbookRange } from './shared/workbook-commands.js';
import { cellAddress, inspectProductivity, sheetCSV } from './shared/productivity.js';
$('#app').innerHTML =
  '<div class="tool-actions actions"><button id="export-csv">Export sheet CSV</button><button id="save-csv">Save sheet CSV to Cruxspace</button><button id="export-project">Export workbook JSON</button><p>A real spreadsheet with formulas. CSV exports values from the active sheet; JSON preserves the workbook.</p></div><div id="editor"></div>';
let api,
  workbook,
  session,
  applying = false;
let lastWorkbook = '';
async function capture() {
  if (!workbook || applying) return;
  await workbook.endEditingAsync(true);
  await api.getFormula().onCalculationResultApplied(10000);
  const snapshot = workbook.save();
  lastWorkbook = JSON.stringify(snapshot);
  if (lastWorkbook !== JSON.stringify(session.doc.workbook))
    await session.update(
      (d) => {
        d.workbook = snapshot;
      },
      { render: false, autosave: false },
    );
}
async function render(doc, { reload = false } = {}) {
  if (!api) {
    ({ univerAPI: api } = createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: mergeLocales(enUS) },
      presets: [UniverSheetsCorePreset({ container: 'editor', disableAutoFocus: true })],
    }));
    // Agent edits arrive as native snapshots. Recompute dependents even when
    // the previous snapshot contains cached formula values.
    api.getFormula().setInitialFormulaComputing(api.Enum.CalculationMode.FORCED);
    api.addEvent(api.Event.CommandExecuted, (event) => {
      if (session && !applying && event.type === 2) session.changed();
    });
  }
  if (!reload && lastWorkbook === JSON.stringify(doc.workbook)) return;
  applying = true;
  try {
    if (workbook) api.disposeUnit(workbook.getId());
    workbook = api.createWorkbook(doc.workbook);
    await api.getFormula().onCalculationResultApplied(10000);
    lastWorkbook = JSON.stringify(doc.workbook);
    $('#editor').dataset.ready = 'true';
  } finally {
    applying = false;
  }
}
try {
  session = await openProject('univer', render, () => {}, {
    capture,
    inspect: inspectProductivity,
    commands: Object.fromEntries(
      ['cells', 'add-sheet', 'rename-sheet', 'read-range', 'format-range', 'save-csv'].map((op) => [
        op,
        runCommand,
      ]),
    ),
  });
} catch (e) {
  message(e);
}
$('#export-project').onclick = async () => {
  try {
    await session.save();
    download(
      new Blob([JSON.stringify(session.doc.workbook, null, 2)], { type: 'application/json' }),
      'workbook.json',
    );
  } catch (e) {
    message(e);
  }
};
$('#export-csv').onclick = async () => {
  try {
    await session.save();
    const sheet = workbook.getActiveSheet();
    download(
      new Blob([sheetCSV(workbook.save().sheets[sheet.getSheetId()])], {
        type: 'text/csv;charset=utf-8',
      }),
      'sheet.csv',
    );
  } catch (e) {
    message(e);
  }
};

const formats = {
  general: 'General',
  integer: '#,##0',
  decimal: '#,##0.00',
  percent: '0.00%',
  usd: '$#,##0.00',
};
function sheetFor(id) {
  const sheet = workbook.getSheetBySheetId(id);
  if (!sheet) throw new Error('This sheet no longer exists. Inspect the workbook again.');
  return sheet;
}
function checkedRange(sheet, address) {
  const [r, c, r2, c2] = workbookRange(address);
  if (r2 >= sheet.getMaxRows() || c2 >= sheet.getMaxColumns())
    throw new Error('This range is outside the sheet.');
  return [r, c, r2, c2];
}
function readRange(sheet, address) {
  const [r, c, r2, c2] = checkedRange(sheet, address);
  const snapshot = workbook.save();
  let remaining = 3000;
  const clip = (value) => {
    if (typeof value !== 'string') return value ?? null;
    const text = value.slice(0, Math.min(200, remaining));
    remaining -= text.length;
    return text;
  };
  return {
    sheetId: sheet.getSheetId(),
    range: address,
    cells: Array.from({ length: r2 - r + 1 }, (_, i) =>
      Array.from({ length: c2 - c + 1 }, (_, j) => {
        const cell = snapshot.sheets[sheet.getSheetId()].cellData?.[r + i]?.[c + j];
        const value = clip(cell?.v),
          formula = clip(cell?.f);
        return {
          value,
          ...(cell?.f ? { formula } : {}),
          ...(value !== (cell?.v ?? null) || formula !== (cell?.f ?? null)
            ? { truncated: true }
            : {}),
        };
      }),
    ),
  };
}
async function runCommand(command) {
  validateWorkbookCommand(command);
  const sheet = command.op === 'add-sheet' ? null : sheetFor(command.sheetId);
  if (command.op === 'read-range') return readRange(sheet, command.range);
  if (command.op === 'save-csv') return saveCsv(sheet, command.name);
  if (command.op === 'add-sheet' || command.op === 'rename-sheet') {
    const all = workbook.save();
    if (
      Object.values(all.sheets).some(
        (s) =>
          s.id !== command.sheetId && s.name.toLowerCase() === command.name.trim().toLowerCase(),
      )
    )
      throw new Error('A sheet with this name already exists. Choose another name.');
    if (command.op === 'add-sheet' && all.sheetOrder.length >= 20)
      throw new Error('This workbook already has 20 sheets.');
  }
  if (command.op === 'cells') {
    // Validate every address before changing anything. One native range command
    // retains formatting, formula dependencies and the editor's Undo history.
    const values = {};
    for (const cell of command.cells) {
      checkedRange(sheet, cell.address);
      const [r, c] = cellAddress(cell.address);
      values[r] ??= {};
      values[r][c] = {
        v: null,
        f: null,
        p: null,
        si: null,
        ...(typeof cell.value === 'string' && cell.value.startsWith('=')
          ? { f: cell.value }
          : { v: cell.value }),
      };
    }
    sheet.getRange(0, 0, sheet.getMaxRows(), sheet.getMaxColumns()).setValues(values);
  } else if (command.op === 'add-sheet') {
    const added = workbook.create(command.name.trim(), command.rows ?? 100, command.columns ?? 20);
    workbook.setActiveSheet(added);
  } else if (command.op === 'rename-sheet') {
    sheet.setName(command.name.trim());
  } else if (command.op === 'format-range') {
    checkedRange(sheet, command.range);
    const range = sheet.getRange(command.range);
    if (command.bold !== undefined) range.setFontWeight(command.bold ? 'bold' : 'normal');
    if (command.background !== undefined) range.setBackgroundColor(command.background);
    if (command.numberFormat !== undefined) range.setNumberFormat(formats[command.numberFormat]);
  }
  session.changed();
  await session.save();
  return { saved: true, project: inspectProductivity(session.doc) };
}
async function saveCsv(sheet, name) {
  await session.save();
  const bytes = new TextEncoder().encode(
    sheetCSV(workbook.save().sheets[sheet.getSheetId()]),
  ).buffer;
  return session.call({ op: 'save-output', label: name, bytes, mimeType: 'text/csv' });
}
$('#save-csv').onclick = () =>
  saveCsv(workbook.getActiveSheet(), `${workbook.getActiveSheet().getSheetName()} (CSV)`).catch(
    message,
  );
