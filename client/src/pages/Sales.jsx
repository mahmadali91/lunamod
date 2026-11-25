import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt, FileText } from 'lucide-react';
import { api, qs } from '../api';
import SaleDetails, { SaleStatus, payNames } from '../components/SaleDetails';
import { Button, Empty, PageHeader, RefSelect, Spinner, fmtDate, useLoad, useMoney } from '../ui';
import { receiptPdf } from '../pdf';
import { useEffect } from 'react';

export default function Sales() {
  const [f, setF] = useState({ from: '', to: '', channelId: null, warehouseId: null, q: '' });
  const { data, reload, loading } = useLoad('/sales' + qs(f));
  const [view, setView] = useState(null);
  const [shop, setShop] = useState(null);
  useEffect(() => { api('/orders/settings').then(setShop).catch(() => {}); }, []);
  const navigate = useNavigate();
  const receipt = (s) => receiptPdf(s, {
    seller: { name: shop?.sellerName, inn: shop?.sellerInn, ogrn: shop?.sellerOgrn, address: shop?.sellerAddress, phone: shop?.sellerPhone || shop?.phone, email: shop?.sellerEmail || shop?.email },
    storeName: shop?.title || 'ЛУНАРА', money, fmtDate: (d) => new Date(d).toLocaleString('ru-RU'), paymentLabel: payNames[s.paymentMethod] || '—',
  }).catch((e) => alert('Не удалось сформировать PDF: ' + e.message));
  const money = useMoney();

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
                  <tr key={s.id} onClick={async () => setView(await api('/sales/' + s.id))} className="cursor-pointer hover:bg-slate-50/70">
                    <td className="td font-medium"><span className="mr-2">{s.number}</span><SaleStatus s={s} />
                      <button onClick={(e) => { e.stopPropagation(); receipt(s); }} title="Скачать чек PDF" className="ml-2 inline-flex align-middle text-slate-400 hover:text-indigo-600"><FileText size={15} /></button></td>
                    <td className="td text-slate-500">{fmtDate(s.date)}</td>
                    <td className="td">{s.channel ? <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.channel.color }} />{s.channel.name}</span> : '—'}</td>
                    <td className="td">{s.counterparty?.name || <span className="text-slate-400">Розница</span>}</td>
                    <td className="td text-slate-600">{s.warehouse.name}</td>
                    <td className="td text-slate-600">{payNames[s.paymentMethod]}</td>
                    <td className={`td text-right font-semibold ${s.status === 'returned' ? 'text-slate-400 line-through' : ''}`}>{money(s.total)}{s.debt > 0 && <div className="text-xs font-normal text-rose-600">долг {money(s.debt)}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && <SaleDetails sale={view} onClose={() => setView(null)} onChange={(s) => { setView(s); reload(); }} />}
    </div>
  );
}
