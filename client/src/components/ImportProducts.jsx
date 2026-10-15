import { useState } from 'react';
import { FileSpreadsheet, Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { Button, Field, Modal, RefSelect, useToast } from '../ui';
import { norm, readTable } from '../excel';

// Колонки шаблона: заголовок → поле. Характеристики идут в attributes.
export const COLUMNS = [
  ['Название', 'name', 'Футболка базовая'], ['Артикул', 'sku', 'TS-001'], ['Штрихкод', 'barcode', ''], ['Категория', 'category', 'Футболки, майки, поло, топы'],
  ['Цена', 'price', 1490], ['Старая цена', 'oldPrice', ''], ['Закупочная цена', 'costPrice', 650], ['Ед. изм.', 'unit', 'шт'],
  ['Мин. остаток', 'minStock', 5], ['Количество', 'quantity', 20],
  ['Размер', 'attr:Размер', 'M'], ['Цвет', 'attr:Цвет', 'Белый'], ['Материал', 'attr:Материал', 'Хлопок 100%'], ['Бренд', 'attr:Бренд', ''],
  ['Описание', 'description', ''],
];
const ALIASES = { 'id': 'id', 'наименование': 'name', 'товар': 'name', 'название товара': 'name', 'артикул': 'sku', 'код': 'sku', 'штрих-код': 'barcode', 'штрихкод': 'barcode', 'баркод': 'barcode', 'ean': 'barcode',
  'цена продажи': 'price', 'розничная цена': 'price', 'себестоимость': 'costPrice', 'закупка': 'costPrice', 'остаток': 'quantity', 'кол-во': 'quantity', 'единица': 'unit' };

// Информационные колонки выгрузки — при загрузке пропускаются
const IGNORE = new Set(['всего на складах', 'доп. штрихкоды', 'фото']);

function mapHeader(h) {
  const n = norm(h);
  if (IGNORE.has(n)) return null;
  const col = COLUMNS.find(([title]) => norm(title) === n);
  if (col) return col[1];
  if (ALIASES[n]) return ALIASES[n];
  return n ? 'attr:' + String(h).trim() : null; // неизвестная колонка → характеристика
}

function toProducts(table) {
  const head = table.findIndex((r) => r.some((c) => String(c ?? '').trim())); // первая непустая строка — заголовки
  const keys = table[head].map(mapHeader);
  const out = [];
  for (let i = head + 1; i < table.length; i++) {
    const r = table[i];
    if (!r.some((c) => String(c ?? '').trim())) continue;
    const item = { _line: i + 1, attributes: {} };
    keys.forEach((k, j) => {
      if (!k) return;
      const v = r[j] instanceof Date ? r[j].toLocaleDateString('ru-RU') : r[j];
      if (v === null || v === undefined || String(v).trim() === '') return;
      if (k.startsWith('attr:')) item.attributes[k.slice(5)] = String(v).trim();
      else item[k] = typeof v === 'number' ? v : String(v).trim();
    });
    out.push(item);
  }
  return { rows: out, columns: keys.filter(Boolean) };
}

export default function ImportProducts({ open, onClose, onDone }) {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [warehouseId, setWarehouseId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const toast = useToast();

  const reset = () => { setParsed(null); setFileName(''); setReport(null); };
  const close = () => { reset(); onClose(); };

  const downloadTemplate = async () => {
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const data = [
      COLUMNS.map(([title]) => ({ value: title, fontWeight: 'bold' })),
      COLUMNS.map(([, , ex]) => ({ value: ex === '' ? null : ex })),
      COLUMNS.map(([, k]) => ({ value: { name: 'Юбка миди', sku: 'SK-002', category: 'Юбки', price: 3490, costPrice: 1500, unit: 'шт', minStock: 3, quantity: 8, 'attr:Размер': 'S', 'attr:Цвет': 'Чёрный' }[k] ?? null })),
    ];
    await writeXlsxFile(data, { columns: COLUMNS.map(([t]) => ({ width: Math.max(12, t.length + 4) })) }).toFile('shablon-tovary.xlsx');
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setReport(null);
    try {
      const p = toProducts(await readTable(file));
      if (!p.rows.length) throw new Error('В файле нет строк с товарами');
      if (!['id', 'name', 'sku', 'barcode'].some((k) => p.columns.includes(k))) throw new Error('Не найдены колонки «Название», «Артикул» или «Штрихкод». Скачайте шаблон.');
      setParsed(p); setFileName(file.name);
    } catch (err) { toast(err.message || 'Не удалось прочитать файл', 'error'); }
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = await api('/products/import', { method: 'POST', body: { rows: parsed.rows, warehouseId } });
      setReport(r);
      if (r.created || r.updated) onDone();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  const titleOf = (k) => (k.startsWith('attr:') ? k.slice(5) : COLUMNS.find((c) => c[1] === k)?.[0] || k);
  const hasQty = parsed?.columns.includes('quantity');

  return (
    <Modal open={open} onClose={close} title="Импорт товаров из Excel" wide
      footer={report ? <Button onClick={close}>Готово</Button> : (
        <><Button variant="secondary" onClick={close}>Отмена</Button>
          <Button icon={Upload} loading={busy} disabled={!parsed || (hasQty && !warehouseId)} onClick={run}>Загрузить {parsed ? `${parsed.rows.length} строк` : ''}</Button></>
      )}>
      {report ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-4"><div className="text-2xl font-bold text-emerald-700">{report.created}</div><div className="text-sm text-emerald-800">создано</div></div>
            <div className="rounded-xl bg-indigo-50 p-4"><div className="text-2xl font-bold text-indigo-700">{report.updated}</div><div className="text-sm text-indigo-800">обновлено</div></div>
            <div className={`rounded-xl p-4 ${report.errors.length ? 'bg-rose-50' : 'bg-slate-50'}`}><div className={`text-2xl font-bold ${report.errors.length ? 'text-rose-700' : 'text-slate-500'}`}>{report.errors.length}</div><div className="text-sm">с ошибкой</div></div>
          </div>
          {report.errors.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-rose-100 text-sm">
              {report.errors.map((e, i) => <div key={i} className="flex gap-3 border-b border-rose-50 px-3 py-2"><span className="shrink-0 text-slate-500">строка {e.line}</span><span className="font-medium">{e.name}</span><span className="text-rose-700">{e.error}</span></div>)}
            </div>
          )}
          {!report.errors.length && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> Все строки загружены</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-1 font-medium">1. Скачайте шаблон</div>
              <p className="mb-3 text-sm text-slate-500">Заполните его в Excel. Обязательна только колонка «Название». Лишние колонки станут характеристиками товара.</p>
              <Button variant="secondary" size="sm" icon={Download} onClick={downloadTemplate}>Шаблон .xlsx</Button>
            </div>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-indigo-400 hover:bg-indigo-50/30">
              <div className="mb-1 font-medium">2. Выберите файл</div>
              <p className="mb-3 text-sm text-slate-500">Excel (.xlsx) или CSV</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600"><FileSpreadsheet size={16} /> {fileName || 'Выбрать файл…'}</span>
              <input type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
            </label>
          </div>
          {parsed && (
            <>
              {hasQty && (
                <Field label="Склад для колонки «Количество» (будет установлен фактический остаток) *">
                  <RefSelect path="/warehouses" value={warehouseId} onChange={setWarehouseId} filter={(w) => w.active} placeholder="Выберите склад" />
                </Field>
              )}
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Если товар с таким ID, штрихкодом или артикулом уже есть — он будет обновлён (заполненными полями), иначе создан новый.</p>
              <div>
                <div className="label">Предпросмотр: {parsed.rows.length} строк, первые 5</div>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50"><tr>{parsed.columns.map((k) => <th key={k} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap text-slate-600">{titleOf(k)}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsed.rows.slice(0, 5).map((r) => <tr key={r._line}>{parsed.columns.map((k) => <td key={k} className="px-2 py-1.5 whitespace-nowrap">{String(k.startsWith('attr:') ? r.attributes[k.slice(5)] ?? '' : r[k] ?? '')}</td>)}</tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
