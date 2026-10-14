import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt, Undo2 } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, Button, Empty, Modal, PageHeader, RefSelect, Spinner, fmtDate, fmtNum, useLoad, useMoney, useToast } from '../ui';

const payNames = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' };

export default function Sales() {
  const [f, setF] = useState({ from: '', to: '', channelId: null, warehouseId: null, q: '' });
  const { data, reload, loading } = useLoad('/sales' + qs(f));
  const [view, setView] = useState(null);
  const navigate = useNavigate();
  const money = useMoney();
  const toast = useToast();

  const open = async (id) => setView(await api('/sales/' + id));
  const doReturn = async () => {
    if (!confirm('Оформить возврат? Товары вернутся на склад.')) return;
    try { setView(await api(`/sales/${view.id}/return`, { method: 'POST' })); toast('Возврат оформлен'); reload(); } catch (e) { toast(e.message, 'error'); }
  };

  const list = data || [];
  const sum = list.filter((s) => s.status === 'completed').reduce((a, s) => a + s.total, 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Продажи" subtitle={data ? `${list.length} продаж на сумму ${money(sum)}` : ''}>
        <Button icon={Plus} onClick={() => navigate('/pos')}>Новая продажа</Button>
      </PageHeader>
      <div className="card">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
          <input className="input" placeholder="Номер чека" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <input className="input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="С" />
          <input className="input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="По" />
          <RefSelect path="/channels" value={f.channelId} onChange={(v) => setF({ ...f, channelId: v })} placeholder="Все каналы" />
          <RefSelect path="/warehouses" value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} placeholder="Все склады" />
        </div>
        {!data ? <Spinner /> : list.length === 0 ? <Empty icon={Receipt} title="Продаж не найдено" /> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th">Номер</th><th className="th">Дата</th><th className="th">Канал</th><th className="th">Покупатель</th><th className="th">Склад</th><th className="th">Оплата</th><th className="th text-right">Сумма</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((s) => (
                  <tr key={s.id} onClick={() => open(s.id)} className="cursor-pointer hover:bg-slate-50/70">
                    <td className="td font-medium">{s.number} {s.status === 'returned' && <Badge color="red">возврат</Badge>}</td>
                    <td className="td text-slate-500">{fmtDate(s.date)}</td>
                    <td className="td">{s.channel ? <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.channel.color }} />{s.channel.name}</span> : '—'}</td>
                    <td className="td">{s.counterparty?.name || <span className="text-slate-400">Розница</span>}</td>
                    <td className="td text-slate-600">{s.warehouse.name}</td>
                    <td className="td text-slate-600">{payNames[s.paymentMethod]}</td>
                    <td className={`td text-right font-semibold ${s.status === 'returned' ? 'text-slate-400 line-through' : ''}`}>{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `Продажа ${view.number}` : ''} wide
        footer={view?.status === 'completed' && <Button variant="secondary" icon={Undo2} onClick={doReturn} className="text-rose-600">Оформить возврат</Button>}>
        {view && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div><div className="label">Дата</div>{fmtDate(view.date)}</div>
              <div><div className="label">Канал</div>{view.channel?.name || '—'}</div>
              <div><div className="label">Покупатель</div>{view.counterparty?.name || 'Розница'}</div>
              <div><div className="label">Склад / оплата</div>{view.warehouse.name} · {payNames[view.paymentMethod]}</div>
            </div>
            {view.status === 'returned' && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">По этой продаже оформлен возврат</div>}
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th><th className="th text-right">Кол-во</th><th className="th text-right">Цена</th><th className="th text-right">Сумма</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {view.items.map((i) => (
                  <tr key={i.id}><td className="py-2">{i.product.name}<div className="font-mono text-xs text-slate-400">{i.product.barcodes[0]?.code}</div></td><td className="py-2 text-right">{fmtNum(i.quantity)}</td><td className="py-2 text-right">{money(i.price)}</td><td className="py-2 text-right font-medium">{money(i.quantity * i.price)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 text-right">
              {view.discount > 0 && <div className="text-sm text-rose-600">Скидка: −{money(view.discount)}</div>}
              <div className="text-xl font-bold">Итого: {money(view.total)}</div>
            </div>
            {view.note && <p className="mt-2 text-sm text-slate-500">{view.note}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
