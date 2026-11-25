// Общие функции Excel: выгрузка .xlsx и чтение .xlsx/.csv (библиотеки грузятся по требованию)

/** columns: [{ title, value: (row) => any, width? }] */
export async function downloadXlsx(fileName, columns, rows) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    columns.map((c) => ({ value: c.title, fontWeight: 'bold', backgroundColor: '#eef2ff' })),
    ...rows.map((r) => columns.map((c) => {
      const v = c.value(r);
      return { value: v === undefined || v === '' ? null : v, ...(typeof v === 'number' && c.money ? { format: '#,##0.00' } : {}) };
    })),
  ];
  await writeXlsxFile(data, { columns: columns.map((c) => ({ width: c.width || Math.max(10, c.title.length + 3) })), stickyRowsCount: 1 }).toFile(fileName);
}

export function parseCsv(text) {
  const first = text.split('\n')[0];
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Таблица из файла: массив строк, каждая — массив ячеек */
export async function readTable(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv((await file.text()).replace(/^﻿/, ''));
  const { readSheet } = await import('read-excel-file/browser');
  return readSheet(file);
}

export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const today = () => new Date().toISOString().slice(0, 10);
