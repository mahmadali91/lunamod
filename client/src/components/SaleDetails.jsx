import { useState } from 'react';
import { Undo2, Wallet, PackageX } from 'lucide-react';
import { api } from '../api';
import { Badge, Button, Field, Modal, Thumb, fmtDate, fmtNum, useMoney, useToast } from '../ui';

export const payNames = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', consignment: 'Реализация' };

export function SaleStatus({ s }) {
  if (s.status === 'returned') return <Badge color="red">возврат</Badge>;
  if (s.consignment) {
    if (s.debt > 0) {
      const overdue = s.dueDate && new Date(s.dueDate) < new Date();
      return <Badge color={overdue ? 'red' : 'amber'}>{overdue ? 'просрочено' : 'в долг'}</Badge>;
    }
    return <Badge color="green">оплачено</Badge>;
  }
  return null;
}

/** Окно продажи: состав, оплаты по реализации, возвраты */
export default function SaleDetails({ sale, onClose, onChange }) {
  const [mode, setMode] = useState(null); // 'pay' | 'return'
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [ret, setRet] = useState({});
  const [busy, setBusy] = useState(false);
  const money = useMoney();
  const toast = useToast();
  if (!sale) return null;
  const s = sale;
  const canReturn = s.status === 'completed' && s.items.some((i) => i.quantity > i.returned);

  const run = async (fn, msg) => {
    setBusy(true);
    try { const r = await fn(); onChange(r); setMode(null); toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const doPay = () => run(() => api(`/sales/${s.id}/payments`, { method: 'POST', body: pay }), 'Оплата принята');
  const doReturnItems = () => run(() => api(`/sales/${s.id}/return-items`, { method: 'POST', body: { items: Object.entries(ret).map(([saleItemId, quantity]) => ({ saleItemId, quantity })) } }), 'Возврат оформлен');
  const doReturnAll = () => { if (confirm('Вернуть весь товар по этой продаже на склад?')) run(() => api(`/sales/${s.id}/return`, { method: 'POST' }), 'Возврат оформлен'); };

  const footer = mode === 'pay' ? (
    <><Button variant="secondary" onClick={() => setMode(null)}>Отмена</Button><Button icon={Wallet} loading={busy} onClick={doPay}>Принять оплату</Button></>
  ) : mode === 'return' ? (
    <><Button variant="secondary" onClick={() => setMode(null)}>Отмена</Button><Button icon={Undo2} loading={busy} onClick={doReturnItems}>Вернуть на склад</Button></>
  ) : (
    <>
      {canReturn && <Button variant="secondary" icon={PackageX} onClick={() => { setRet({}); setMode('return'); }}>Вернуть часть товара</Button>}
      {canReturn && <Button variant="secondary" icon={Undo2} onClick={doReturnAll} className="text-rose-600">Вернуть всё</Button>}
      {s.debt > 0 && <Button icon={Wallet} onClick={() => { setPay({ amount: s.debt, method: 'cash', note: '' }); setMode('pay'); }}>Принять оплату</Button>}
    </>
  );

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2">Продажа {s.number} <SaleStatus s={s} /></span>} wide footer={footer}>
      <div className="mb-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div><div className="label">Дата</div>{fmtDate(s.date)}</div>
        <div><div className="label">Канал</div>{s.channel?.name || '—'}</div>
        <div><div className="label">Покупатель</div>{s.counterparty?.name || 'Розница'}{s.counterparty?.phone && <div className="text-xs text-slate-500">{s.counterparty.phone}</div>}</div>
        <div><div className="label">Склад / оплата</div>{s.warehouse.name} · {payNames[s.paymentMethod]}</div>
      </div>

      {s.consignment && s.status !== 'returned' && (
        <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl bg-amber-50 p-4 text-sm">
          <div><div className="text-xs text-amber-700">Сумма</div><b>{money(s.total)}</b></div>
          <div><div className="text-xs text-amber-700">Оплачено</div><b className="text-emerald-700">{money(s.paidAmount)}</b></div>
          <div><div className="text-xs text-amber-700">Долг{s.dueDate ? ` · до ${fmtDate(s.dueDate, false)}` : ''}</div><b className={s.debt > 0 ? 'text-rose-600' : ''}>{money(s.debt)}</b></div>
        </div>
      )}

      {mode === 'pay' && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:grid-cols-3">
          <Field label={`Сумма (долг ${money(s.debt)})`}><input className="input" type="number" min="0" step="any" autoFocus value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Способ"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">Наличные</option><option value="card">Карта</option><option value="transfer">Перевод</option></select></Field>
          <Field label="Комментарий"><input className="input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
        </div>
      )}
      {mode === 'return' && <p className="mb-2 text-sm text-slate-600">Укажите, сколько единиц возвращается на склад «{s.warehouse.name}»:</p>}

      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th><th className="th text-right">Кол-во</th><th className="th text-right">Цена</th><th className="th text-right">Сумма</th>{mode === 'return' && <th className="th text-right">Вернуть</th>}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {s.items.map((i) => {
            const left = i.quantity - i.returned;
            return (
              <tr key={i.id}>
                <td className="py-2"><div className="flex items-center gap-2"><Thumb src={i.product.images?.[0]?.path} size={32} /><div>{i.product.name}<div className="font-mono text-xs text-slate-400">{i.product.barcodes[0]?.code}</div></div></div></td>
                <td className="py-2 text-right">{fmtNum(left)}{i.returned > 0 && <div className="text-xs text-rose-500">возвр. {fmtNum(i.returned)}</div>}</td>
                <td className="py-2 text-right">{money(i.price)}</td>
                <td className="py-2 text-right font-medium">{money(left * i.price)}</td>
                {mode === 'return' && <td className="py-2 pl-2 text-right"><input className="input w-20 text-right" type="number" min="0" max={left} step="any" placeholder="0" disabled={left <= 0} value={ret[i.id] || ''} onChange={(e) => setRet({ ...ret, [i.id]: e.target.value })} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 space-y-1 text-right">
        {s.discount > 0 && <div className="text-sm text-rose-600">Скидка: −{money(s.discount)}</div>}
        <div className="text-xl font-bold">Итого: {money(s.total)}</div>
      </div>

      {s.payments?.length > 0 && (
        <div className="mt-4">
          <div className="label">Оплаты</div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
            {s.payments.map((p) => (
              <div key={p.id} className="flex justify-between px-3 py-2"><span className="text-slate-500">{fmtDate(p.date)} · {payNames[p.method]}{p.note ? ' · ' + p.note : ''}</span><b className="text-emerald-700">+{money(p.amount)}</b></div>
            ))}
          </div>
        </div>
      )}
      {s.note && <p className="mt-2 text-sm text-slate-500">{s.note}</p>}
    </Modal>
  );
}
