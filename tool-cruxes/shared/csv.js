// SPDX-License-Identifier: MIT
export function parseCSV(text) {
  if (text.length > 2_000_000) throw new Error('Use a CSV up to 2 MB.');
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    ended = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          ended = true;
        }
      } else field += c;
    } else if (c === '"' && !field && !ended) quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
      ended = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      ended = false;
    } else {
      if (ended) throw new Error('Unexpected text after a quoted CSV value.');
      field += c;
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quote.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function tableCSV(doc) {
  const escape = (value) => {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s) && typeof value !== 'number') s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [doc.columns.map((c) => c.title), ...doc.rows.map((r) => doc.columns.map((c) => r[c.key]))]
    .map((r) => r.map(escape).join(','))
    .join('\r\n');
}
export function importedTable(text, title = 'Imported table') {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (rows.length < 1 || !rows[0].length || rows[0].length > 20)
    throw new Error('Use 1–20 CSV columns.');
  const columns = rows[0].map((name, i) => ({
    key: `column-${i + 1}`,
    title: name.trim() || `Column ${i + 1}`,
    type: 'text',
  }));
  const values = rows.slice(1).filter((r) => r.some(Boolean));
  if (values.length > 2000) throw new Error('Use at most 2,000 CSV rows.');
  if (values.some((r) => r.length > columns.length))
    throw new Error('A CSV row has more values than its header.');
  return {
    schemaVersion: 1,
    type: 'tables',
    title,
    columns,
    rows: values.map((r, i) => ({
      id: `row-${i + 1}`,
      ...Object.fromEntries(columns.map((c, j) => [c.key, r[j] ?? ''])),
    })),
  };
}
