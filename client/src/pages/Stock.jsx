import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ClipboardCheck, ArrowLeftRight, PackagePlus, Download, Pencil, Save, X, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { api, qs } from '../api';
import ItemsEditor from '../components/ItemsEditor';
import { downloadXlsx, norm, readTable, today } from '../excel';
import { Button, Field, Modal, PageHeader, RefSelect, Spinner, Thumb, fmtNum, useLoad, useMoney, useToast } from '../ui';

function AdjustModal({ open, onClose, onDone }) {
  const [warehouseId, setWarehouseId] = useState(null);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState('Инвентаризация');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { if (open) { setItems([]); } }, [open]);

  const save = async () => {
    setSaving(true);
    try { await api('/stock/adjust', { method: 'POST', body: { warehouseId, items, note } }); toast('Остатки обновлены'); onDone(); onClose(); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const current = (p) => {
    const s = p.stocks?.find((x) => x.warehouseId === warehouseId);
    return s ? s.quantity : 0;
  };

  return (
    <Modal open={open} onClose={onClose} title="Инвентаризация / ввод остатков" wide
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button icon={ClipboardCheck} loading={saving} disabled={!warehouseId || !items.length} onClick={save}>Сохранить остатки</Button></>}>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Field label="Склад *"><RefSelect path="/warehouses" value={warehouseId} onChange={(v) => { setWarehouseId(v); setItems([]); }} filter={(w) => w.active} placeholder="Выберите склад" /></Field>
        <Field label="Основание"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {warehouseId ? (
        <ItemsEditor items={items} setItems={setItems} hint="Отсканируйте товар и укажите фактическое количество"
          makeItem={(p) => ({ quantity: current(p), info: `сейчас: ${fmtNum(current(p))}` })}
          columns={[{ key: 'quantity', label: 'Факт. кол-во', width: 140 }]} />
      ) : <p className="text-sm text-slate-500">Выберите склад, чтобы начать.</p>}
    </Modal>
  );
}

function TransferModal({ open, onClose, onDone }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { if (open) setItems([]); }, [open]);

  const save = async () => {
    setSaving(true);
    try { await api('/stock/transfer', { method: 'POST', body: { fromWarehouseId: from, toWarehouseId: to, items } }); toast('Перемещение выполнено'); onDone(); onClose(); }
    catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const avail = (p) => p.stocks?.find((x) => x.warehouseId === from)?.quantity || 0;

  return (
    <Modal open={open} onClose={onClose} title="Перемещение между складами" wide
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button icon={ArrowLeftRight} loading={saving} disabled={!from || !to || from === to || !items.length} onClick={save}>Переместить</Button></>}>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Field label="Откуда *"><RefSelect path="/warehouses" value={from} onChange={(v) => { setFrom(v); setItems([]); }} filter={(w) => w.active} placeholder="Склад-отправитель" /></Field>
        <Field label="Куда *"><RefSelect path="/warehouses" value={to} onChange={setTo} filter={(w) => w.active && w.id !== from} placeholder="Склад-получатель" /></Field>
      </div>
      {from ? (
        <ItemsEditor items={items} setItems={setItems} makeItem={(p) => ({ info: `доступно: ${fmtNum(avail(p))}` })} columns={[{ key: 'quantity', label: 'Кол-во', width: 120 }]} />
      ) : <p className="text-sm text-slate-500">Выберите склад-отправитель.</p>}
    </Modal>
  );
}

/** Загрузка остатков из Excel: колонки-склады по названию, товар — по ID, штрихкоду или артикулу */
function StockImport({ data, onClose, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const table = await readTable(file);
      const h = table.findIndex((r) => r.some((c) => String(c ?? '').trim()));
      const head = table[h].map(norm);
      const col = (...names) => head.findIndex((x) => names.includes(x));
      const iId = col('id'), iSku = col('артикул'), iBc = col('штрихкод', 'штрих-код', 'баркод');
      const whCols = data.warehouses.map((w) => ({ w, i: head.indexOf(norm(w.name)) })).filter((x) => x.i >= 0);
      if (!whCols.length) throw new Error('В файле нет колонок с названиями складов. Выгрузите остатки и отредактируйте этот файл.');
      const byId = new Map(data.rows.map((r) => [r.id, r]));
      const bySku = new Map(data.rows.filter((r) => r.sku).map((r) => [String(r.sku).toLowerCase(), r]));
      const byBc = new Map(data.rows.filter((r) => r.barcode).map((r) => [String(r.barcode), r]));
      const items = [], unknown = [];
      for (let i = h + 1; i < table.length; i++) {
        const r = table[i];
        if (!r.some((c) => String(c ?? '').trim())) continue;
        const row = (iId >= 0 && byId.get(Number(r[iId]))) || (iBc >= 0 && byBc.get(String(r[iBc] ?? '').trim())) || (iSku >= 0 && bySku.get(String(r[iSku] ?? '').trim().toLowerCase()));
        if (!row) { unknown.push(i + 1); continue; }
        for (const { w, i: c } of whCols) {
          const v = r[c];
          if (v === null || v === undefined || String(v).trim() === '') continue;
          const q = Number(String(v).replace(/\s/g, '').replace(',', '.'));
          if (isNaN(q)) { unknown.push(i + 1); continue; }
          if (q !== (row.byWh[w.id] || 0)) items.push({ productId: row.id, warehouseId: w.id, quantity: q, name: row.name, wh: w.name, from: row.byWh[w.id] || 0 });
        }
      }
      setPlan({ items, unknown, file: file.name, warehouses: whCols.map((x) => x.w.name) });
    } catch (err) { toast(err.message || 'Не удалось прочитать файл', 'error'); }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api('/stock/bulk', { method: 'POST', body: { items: plan.items, note: 'Загрузка остатков из Excel' } });
      toast(`Остатки обновлены: ${r.changed}`); onDone(); onClose();
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Загрузка остатков из Excel" wide
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button icon={Upload} loading={busy} disabled={!plan?.items.length} onClick={apply}>Обновить {plan ? plan.items.length : ''} остатков</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Выгрузите остатки кнопкой «Выгрузить в Excel», исправьте количество в колонках складов и загрузите файл. Товары узнаются по ID, штрихкоду или артикулу. Пустая ячейка — без изменений.</p>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-4 hover:border-indigo-400 hover:bg-indigo-50/30">
          <FileSpreadsheet className="text-indigo-600" />
          <span className="text-sm font-medium text-indigo-600">{plan?.file || 'Выбрать файл .xlsx или .csv'}</span>
          <input type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
        </label>
        {plan && (
          <>
            <div className="text-sm text-slate-600">Склады в файле: <b>{plan.warehouses.join(', ')}</b> · изменений: <b>{plan.items.length}</b></div>
            {plan.unknown.length > 0 && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Не распознаны строки: {plan.unknown.slice(0, 30).join(', ')}{plan.unknown.length > 30 ? '…' : ''} — они будут пропущены.</p>}
            {plan.items.length > 0 ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50"><tr><th className="th">Товар</th><th className="th">Склад</th><th className="th text-right">Было</th><th className="th text-right">Станет</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.items.map((it, k) => <tr key={k}><td className="px-4 py-2">{it.name}</td><td className="px-4 py-2 text-slate-600">{it.wh}</td><td className="px-4 py-2 text-right text-slate-400">{fmtNum(it.from)}</td><td className="px-4 py-2 text-right font-semibold">{fmtNum(it.quantity)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">Изменений нет — все остатки в файле совпадают с текущими.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Stock() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [modal, setModal] = useState(null);
  const [edit, setEdit] = useState(null); // { 'productId:warehouseId': новое значение }
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, reload, loading } = useLoad('/stock' + qs({ q: debounced }));

  const rows = (data?.rows || []).filter((r) => !onlyLow || r.total <= r.minStock);
  const totals = rows.reduce((a, r) => ({ qty: a.qty + r.total, cost: a.cost + (r.stockCost ?? r.total * r.costPrice), retail: a.retail + r.total * r.price }), { qty: 0, cost: 0, retail: 0 });

  const changes = edit ? Object.entries(edit).filter(([k, v]) => {
    const [pid, wid] = k.split(':').map(Number);
    const row = data?.rows.find((r) => r.id === pid);
    return v !== '' && !isNaN(Number(v)) && Number(v) !== (row?.byWh[wid] || 0);
  }) : [];

  const saveEdit = async () => {
    setSaving(true);
    try {
      const items = changes.map(([k, v]) => { const [productId, warehouseId] = k.split(':').map(Number); return { productId, warehouseId, quantity: Number(v) }; });
      const r = await api('/stock/bulk', { method: 'POST', body: { items } });
      toast(`Остатки сохранены: изменено ${r.changed}`);
      setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };

  // Enter — перейти к ячейке ниже (удобно вводить подряд)
  const onCellKey = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const cells = [...document.querySelectorAll(`input[data-col="${e.target.dataset.col}"]`)];
    cells[cells.indexOf(e.target) + 1]?.focus();
  };

  const exportXlsx = () => downloadXlsx(`ostatki-${today()}.xlsx`, [
    { title: 'ID', value: (r) => r.id, width: 7 },
    { title: 'Товар', value: (r) => r.name, width: 42 },
    { title: 'Артикул', value: (r) => r.sku, width: 16 },
    { title: 'Цвет', value: (r) => r.color, width: 12 },
    { title: 'Размер', value: (r) => r.size, width: 9 },
    { title: 'Штрихкод', value: (r) => r.barcode, width: 16 },
    ...data.warehouses.map((w) => ({ title: w.name, value: (r) => r.byWh[w.id] || 0, width: Math.max(12, w.name.length + 2) })),
    { title: 'Всего на складах', value: (r) => r.total, width: 16 },
    { title: 'Цена', value: (r) => r.price, width: 11 },
  ], rows);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Остатки" subtitle="Количество товаров по складам">
        {edit ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => (changes.length && !confirm('Отменить несохранённые изменения?') ? null : setEdit(null))}>Отмена</Button>
            <Button variant="success" icon={Save} loading={saving} disabled={!changes.length} onClick={saveEdit}>Сохранить изменения{changes.length ? ` (${changes.length})` : ''}</Button>
          </>
        ) : (
          <Button icon={Pencil} onClick={() => setEdit({})} disabled={!data}>Редактировать остатки</Button>
        )}
        <Button variant="secondary" icon={Download} onClick={exportXlsx} disabled={!data}>Выгрузить в Excel</Button>
        <Button variant="secondary" icon={Upload} onClick={() => setModal('import')} disabled={!data || !!edit}>Загрузить из Excel</Button>
        <Button variant="secondary" icon={ArrowLeftRight} onClick={() => setModal('transfer')}>Перемещение</Button>
        <Button variant="secondary" icon={ClipboardCheck} onClick={() => setModal('adjust')}>Инвентаризация</Button>
        <Button variant="secondary" icon={PackagePlus} onClick={() => navigate('/receipts/new')}>Приход</Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4"><div className="text-sm text-slate-500">Единиц на складах</div><div className="text-xl font-bold">{fmtNum(totals.qty)}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">По себестоимости</div><div className="text-xl font-bold">{money(totals.cost)}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">По розничной цене</div><div className="text-xl font-bold">{money(totals.retail)}</div></div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Название, артикул, штрихкод" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Только заканчивающиеся</label>
        </div>
        {edit && <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Режим редактирования: введите фактическое количество в нужных ячейках (Enter — следующая строка) и нажмите «Сохранить изменения». Изменённые ячейки подсвечены.</div>}
        {!data ? <Spinner /> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th w-14">Фото</th><th className="th">Товар</th><th className="th">Артикул</th>
                  {data.warehouses.map((w) => <th key={w.id} className="th text-right">{w.name}</th>)}
                  <th className="th text-right">Итого</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="td py-2"><Thumb src={r.image} size={44} /></td>
                    <td className="td"><Link to={`/products/${r.parentId || r.id}`} className="font-medium hover:text-indigo-600">{r.parentId ? r.name.split(" · ")[0] : r.name}</Link>{r.parentId && <div className="text-xs font-semibold text-indigo-700">{[r.color, r.size].filter(Boolean).join(" · ")}</div>}<div className="font-mono text-xs text-slate-400">{r.sku ? r.sku + " · " : ""}{r.barcode}</div></td>
                    <td className="td font-mono text-xs text-slate-600">{r.sku || '—'}</td>
                    {data.warehouses.map((w) => {
                      const v = r.byWh[w.id] || 0;
                      if (edit) {
                        const k = `${r.id}:${w.id}`;
                        const val = edit[k] ?? v;
                        const changed = edit[k] !== undefined && edit[k] !== '' && Number(edit[k]) !== v;
                        return (
                          <td key={w.id} className="px-2 py-1.5 text-right">
                            <input type="number" step="any" data-col={w.id} value={val} onKeyDown={onCellKey} onFocus={(e) => e.target.select()}
                              onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                              className={`input w-24 text-right tabular-nums ${changed ? 'border-amber-400 bg-amber-50 font-semibold' : ''}`} />
                          </td>
                        );
                      }
                      return <td key={w.id} className={`td text-right tabular-nums ${v < 0 ? 'text-rose-600' : v === 0 ? 'text-slate-300' : ''}`}>{fmtNum(v)}</td>;
                    })}
                    <td className={`td text-right font-semibold tabular-nums ${r.total <= 0 ? 'text-rose-600' : r.total <= r.minStock ? 'text-amber-600' : ''}`}>{fmtNum(r.total)} <span className="text-xs font-normal text-slate-400">{r.unit}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={20} className="py-12 text-center text-sm text-slate-400">Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AdjustModal open={modal === 'adjust'} onClose={() => setModal(null)} onDone={reload} />
      <TransferModal open={modal === 'transfer'} onClose={() => setModal(null)} onDone={reload} />
      {modal === 'import' && data && <StockImport data={data} onClose={() => setModal(null)} onDone={reload} />}
    </div>
  );
}
