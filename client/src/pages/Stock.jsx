import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ClipboardCheck, ArrowLeftRight, PackagePlus, Download, Pencil, Save, X } from 'lucide-react';
import { api, qs } from '../api';
import ItemsEditor from '../components/ItemsEditor';
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
  const totals = rows.reduce((a, r) => ({ qty: a.qty + r.total, cost: a.cost + r.total * r.costPrice, retail: a.retail + r.total * r.price }), { qty: 0, cost: 0, retail: 0 });

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

  const exportCsv = () => {
    const head = ['Товар', 'Артикул', 'Штрихкод', ...data.warehouses.map((w) => w.name), 'Итого', 'Цена'];
    const lines = rows.map((r) => [r.name, r.sku || '', r.barcode || '', ...data.warehouses.map((w) => r.byWh[w.id] || 0), r.total, r.price]);
    const csv = '﻿' + [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ostatki.csv'; a.click();
  };

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
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!data}>Excel (CSV)</Button>
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
                    <td className="td"><Link to={`/products/${r.id}`} className="font-medium hover:text-indigo-600">{r.name}</Link><div className="font-mono text-xs text-slate-400">{r.barcode}</div></td>
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
    </div>
  );
}
