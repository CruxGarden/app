// SPDX-License-Identifier: MIT
import {
  createUniver,
  LocaleType,
  mergeLocales,
  UniverSheetsCorePreset,
  enUS,
} from './vendor/engine.js';
import { $, message, download, openProject } from './shared/session.js';
import { inspectProductivity, sheetCSV } from './shared/productivity.js';
$('#app').innerHTML =
  '<div class="tool-actions actions"><button id="export-csv">Export sheet CSV</button><button id="export-project">Export workbook JSON</button><p>A real spreadsheet with formulas. CSV exports values from the active sheet; JSON preserves the workbook.</p></div><div id="editor"></div>';
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
