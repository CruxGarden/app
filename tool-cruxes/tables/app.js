// SPDX-License-Identifier: MIT
import { Tabulator } from './vendor/engine.js';
import { $, button, message, download, openProject } from './shared/session.js';
import { tableExample } from './shared/model.js';
import { importedTable, tableCSV } from './shared/csv.js';
$('#app').innerHTML =
  '<div class="actions" style="margin-bottom:20px"><button id="add-row" class="primary">Add row</button><button id="delete-rows">Delete selected rows</button><input id="filter" type="search" aria-label="Filter rows" placeholder="Find anything in this table…"><button id="export">Export CSV</button><label>Import CSV<input id="import" type="file" accept=".csv,text/csv" aria-label="Import CSV"></label></div><div class="card"><div id="table"></div></div><div class="actions"><input id="column-title" aria-label="New column name" placeholder="New column name" maxlength="80"><select id="column-type" aria-label="New column type"><option value="text">Text</option><option value="number">Number</option></select><button id="add-column">Add column</button><span class="muted">Try an example:</span><button data-example="projects">Project tracker</button><button data-example="contacts">Contacts</button><button data-example="inventory">Inventory</button></div><p>Double-click a cell to edit it. Click a heading to sort. Rows, columns and content are saved in your Crux; filters and selections are temporary.</p>';
let table, session;
const filter = () => {
  const term = $('#filter').value.toLowerCase();
  if (term)
    table.setFilter((row) =>
      Object.values(row).some((v) => String(v).toLowerCase().includes(term)),
    );
  else table.clearFilter();
};
try {
  session = await openProject('tables', (doc) => {
    table?.destroy();
    table = new Tabulator('#table', {
      height: 440,
      layout: 'fitColumns',
      data: doc.rows,
      index: 'id',
      selectableRows: true,
      clipboard: false,
      columns: [
        {
          formatter: 'rowSelection',
          titleFormatter: 'rowSelection',
          hozAlign: 'center',
          headerSort: false,
          width: 45,
          cellClick: (_e, c) => c.getRow().toggleSelect(),
        },
        ...doc.columns.map((c) => ({
          title: c.title,
          titleFormatter: () => {
            const span = document.createElement('span');
            span.textContent = c.title;
            return span;
          },
          field: c.key,
          formatter: 'plaintext',
          editor: c.type === 'number' ? 'number' : 'input',
          editorParams: c.type === 'number' ? { min: -1e12, max: 1e12 } : {},
          minWidth: 120,
          editableTitle: true,
        })),
      ],
    });
    table.on('tableBuilt', filter);
    table.on('cellEdited', (cell) => {
      const row = cell.getRow().getData();
      void session
        .update((d) => {
          const index = d.rows.findIndex((r) => r.id === row.id);
          d.rows[index] = structuredClone(row);
        })
        .catch((e) => {
          message(e);
          cell.restoreOldValue();
        });
    });
    table.on(
      'columnTitleChanged',
      (column) =>
        void session
          .update((d) => {
            d.columns.find((c) => c.key === column.getField()).title = column.getDefinition().title;
          })
          .catch(message),
    );
    $('#title').dataset.rowCount = String(doc.rows.length);
  });
} catch (e) {
  message(e);
}
$('#filter').oninput = filter;
$('#add-row').onclick = () =>
  void session
    .update((d) => {
      d.rows.push({
        id: crypto.randomUUID(),
        ...Object.fromEntries(d.columns.map((c) => [c.key, ''])),
      });
    })
    .catch(message);
$('#delete-rows').onclick = () => {
  const ids = table.getSelectedData().map((r) => r.id);
  if (ids.length && confirm(`Delete ${ids.length} selected row(s)?`))
    void session
      .update((d) => {
        d.rows = d.rows.filter((r) => !ids.includes(r.id));
      })
      .catch(message);
};
$('#add-column').onclick = () =>
  void session
    .update((d) => {
      d.columns.push({
        key: 'c-' + crypto.randomUUID(),
        title: $('#column-title').value.trim(),
        type: $('#column-type').value,
      });
    })
    .then(() => {
      $('#column-title').value = '';
    })
    .catch(message);
for (const el of document.querySelectorAll('[data-example]'))
  el.onclick = () => {
    if (confirm('Replace this table with the example? Your saved versions remain in Growth.'))
      void session.update((d) => Object.assign(d, tableExample(el.dataset.example))).catch(message);
  };
$('#export').onclick = async () => {
  try {
    await session.save();
    download(new Blob([tableCSV(session.doc)], { type: 'text/csv;charset=utf-8' }), 'table.csv');
  } catch (e) {
    message(e);
  }
};
$('#import').onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2_000_000) throw new Error('Use a CSV up to 2 MB.');
    const doc = importedTable(await file.text(), file.name.replace(/\.csv$/i, ''));
    if (
      confirm('Replace this table with the imported CSV? Your saved versions remain in Growth.')
    ) {
      await session.update((d) => Object.assign(d, doc));
      await session.save();
    }
  } catch (error) {
    message(error);
  } finally {
    e.target.value = '';
  }
};
