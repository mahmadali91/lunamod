import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, PackagePlus, Plus, Trash2, Eye } from 'lucide-react';
import { api } from '../api';
import ItemsEditor from '../components/ItemsEditor';
import { Button, Empty, Field, Modal, PageHeader, RefSelect, Spinner, Thumb, fmtDate, fmtNum, useLoad, useMoney, useToast } from '../ui';

export default function Receipts() {
  const { data, reload } = useLoad('/receipts');
  const [view, setView] = useState(null);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();

  const open = async (id) => setView(await api('/receipts/' + id));
  const remove = async (r) => {
    if (!confirm(`Отменить приход ${r.number}? Остатки будут уменьшены.`)) return;
    try { await api('/receipts/' + r.id, { method: 'DELETE' }); toast('Приход отменён'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Приход товара" subtitle="Поступления на склад от поставщиков">
        <Button icon={Plus} onClick={() => navigate('/receipts/new')}>Новый приход</Button>
      </PageHeader>
      <div className="card overflow-hidden">
        {!data ? <Spinner /> : data.length === 0 ? (
          <Empty icon={PackagePlus} title="Приходов пока нет" text="Оформите приход, чтобы пополнить остатки"><Button icon={Plus} onClick={() => navigate('/receipts/new')}>Новый приход</Button></Empty>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th">Номер</th><th className="th">Дата</th><th className="th">Склад</th><th className="th">Поставщик</th><th className="th text-right">Позиций</th><th className="th text-right">Сумма</th><th className="th w-20" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => open(r.id)}>
                  <td className="td font-medium">{r.number}</td>
                  <td className="td text-slate-500">{fmtDate(r.date)}</td>
                  <td className="td">{r.warehouse.name}</td>
                  <td className="td">{r.counterparty?.name || '—'}</td>
                  <td className="td text-right">{r._count.items}</td>
                  <td className="td text-right font-semibold">{money(r.total)}</td>
                  <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => open(r.id)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Eye size={16} /></button>
                    <button onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Приход ${view.number}` : ''} wide>
        {view && (
          <div>
            <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
              <div><div className="label">Дата</div>{fmtDate(view.date)}</div>
              <div><div className="label">Склад</div>{view.warehouse.name}</div>
              <div><div className="label">Поставщик</div>{view.counterparty?.name || '—'}</div>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th><th className="th text-right">Кол-во</th><th className="th text-right">Цена</th><th className="th text-right">Сумма</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {view.items.map((i) => (
                  <tr key={i.id}><td className="py-2">{i.product.name}</td><td className="py-2 text-right">{fmtNum(i.quantity)}</td><td className="py-2 text-right">{money(i.costPrice)}</td><td className="py-2 text-right font-medium">{money(i.quantity * i.costPrice)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-right text-lg font-bold">Итого: {money(view.total)}</div>
            {view.note && <p className="mt-2 text-sm text-slate-500">{view.note}</p>}
            <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => navigate('/labels?ids=' + view.items.map((i) => i.productId).join(',') + '&qty=' + view.items.map((i) => Math.ceil(i.quantity)).join(','))}>Печать этикеток на приход</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function ReceiptForm() {
  const [items, setItems] = useState([]);
  const [warehouseId, setWarehouseId] = useState(null);
  const [counterpartyId, setCounterpartyId] = useState(null);
  const [note, setNote] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.costPrice || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api('/receipts', { method: 'POST', body: { warehouseId, counterpartyId, note, updateCost, items } });
      toast(`Приход ${r.number} проведён`);
      navigate('/receipts');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/receipts" className="rounded-lg p-2 text-slate-500 hover:bg-white hover:shadow-sm"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold tracking-tight">Новый приход</h1>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <ItemsEditor items={items} setItems={setItems} makeItem={(p) => ({ costPrice: p.costPrice })}
            columns={[{ key: 'quantity', label: 'Кол-во', width: 110 }, { key: 'costPrice', label: 'Цена закуп.', width: 130 }]}
            extra={{ label: 'Сумма', render: (i) => money(Number(i.quantity || 0) * Number(i.costPrice || 0)) }} />
        </div>
        <div className="card h-fit space-y-4 p-5">
          <Field label="Склад *"><RefSelect path="/warehouses" value={warehouseId} onChange={setWarehouseId} filter={(w) => w.active} placeholder="Выберите склад" /></Field>
          <Field label="Поставщик"><RefSelect path="/counterparties" value={counterpartyId} onChange={setCounterpartyId} filter={(c) => c.type !== 'customer'} /></Field>
          <Field label="Комментарий"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} /> Обновить закупочные цены в карточках</label>
          <div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-slate-500">Итого</span><span className="text-xl font-bold">{money(total)}</span></div>
          <Button className="w-full" size="lg" icon={PackagePlus} loading={saving} disabled={!items.length || !warehouseId} onClick={save}>Провести приход</Button>
        </div>
      </div>
    </div>
  );
}
