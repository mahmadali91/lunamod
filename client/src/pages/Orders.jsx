import { useEffect, useState } from 'react';
import { ShoppingBag, Search, Phone, MapPin, Store, Truck, CheckCircle2, XCircle, Wallet, ExternalLink } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { Badge, Button, Empty, Modal, PageHeader, Spinner, Thumb, fmtDate, fmtNum, useLoad, useMoney, useToast } from '../ui';

export const ORDER_STATUS = {
  new: ['Новый', 'indigo'], confirmed: ['Подтверждён', 'blue'], ready: ['Собран / в пути', 'amber'], completed: ['Выполнен', 'green'], cancelled: ['Отменён', 'slate'],
};
export const PAY_STATUS = { unpaid: ['не оплачен', 'slate'], pending: ['ожидает оплаты', 'amber'], paid: ['оплачен', 'green'], failed: ['ошибка оплаты', 'red'], refunded: ['возврат', 'red'] };
const PAY_METHOD = { cash: 'При получении', tbank: 'Онлайн (Т-Банк)' };
const fmtPhone = (p) => (p ? `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}` : '');

function OrderModal({ id, onClose, onChange }) {
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);
  const money = useMoney();
  const toast = useToast();
  useEffect(() => { api('/orders/' + id).then(setO); }, [id]);
  if (!o) return null;

  const act = async (path, body, msg) => {
    setBusy(true);
    try { const r = await api(`/orders/${o.id}/${path}`, { method: 'POST', body }); setO(r); onChange(); toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const setStatus = (status) => {
    if (status === 'completed' && !confirm('Отметить заказ выполненным? Будет создана продажа и списан товар со склада.')) return;
    if (status === 'cancelled') {
      const refund = o.paymentMethod === 'tbank' && o.paymentStatus === 'paid';
      if (!confirm(refund ? 'Отменить заказ и вернуть деньги покупателю через Т-Банк?' : 'Отменить заказ?')) return;
      return act('status', { status, refund }, 'Заказ отменён');
    }
    act('status', { status }, 'Статус обновлён');
  };
  const open = !['completed', 'cancelled'].includes(o.status);
  const flow = ['new', 'confirmed', 'ready', 'completed'];

  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2">Заказ {o.number} <Badge color={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></span>}
      footer={open && (
        <>
          <Button variant="secondary" icon={XCircle} className="mr-auto text-rose-600" loading={busy} onClick={() => setStatus('cancelled')}>Отменить</Button>
          {o.paymentMethod === 'cash' && o.paymentStatus !== 'paid' && <Button variant="secondary" icon={Wallet} loading={busy} onClick={() => act('paid', {}, 'Оплата отмечена')}>Оплачен</Button>}
          {o.status === 'new' && <Button variant="secondary" loading={busy} onClick={() => setStatus('confirmed')}>Подтвердить</Button>}
          {['new', 'confirmed'].includes(o.status) && <Button variant="secondary" loading={busy} onClick={() => setStatus('ready')}>Собран / в пути</Button>}
          <Button variant="success" icon={CheckCircle2} loading={busy} onClick={() => setStatus('completed')}>Выдан покупателю</Button>
        </>
      )}>
      <div className="mb-5 flex items-center gap-1">
        {flow.map((s, i) => {
          const reached = o.status !== 'cancelled' && flow.indexOf(o.status) >= i;
          return <div key={s} className="flex flex-1 items-center gap-1"><div className={`h-1.5 flex-1 rounded-full ${reached ? 'bg-indigo-600' : 'bg-slate-200'}`} /><span className={`text-[11px] ${reached ? 'text-indigo-700' : 'text-slate-400'}`}>{ORDER_STATUS[s][0]}</span></div>;
        })}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div><div className="label">Покупатель</div><div className="font-medium">{o.name || '—'}</div><a href={`tel:+${o.phone}`} className="inline-flex items-center gap-1 text-indigo-600"><Phone size={12} />{fmtPhone(o.phone)}</a></div>
        <div><div className="label">Получение</div><div className="flex items-center gap-1">{o.delivery === 'pickup' ? <Store size={14} /> : <Truck size={14} />} {o.deliveryName || o.delivery}</div>{o.address && <div className="flex items-start gap-1 text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0" />{o.address}</div>}{(() => { try { const i = JSON.parse(o.deliveryInfo || '{}'); return <div className="text-xs text-slate-500">{[i.pointCode && `пункт ${i.pointCode}`, i.postcode && `индекс ${i.postcode}`, i.days && `срок ${i.days}`].filter(Boolean).join(' · ')}</div>; } catch { return null; } })()}</div>
        <div><div className="label">Оплата</div>{PAY_METHOD[o.paymentMethod]}<div><Badge color={PAY_STATUS[o.paymentStatus][1]}>{PAY_STATUS[o.paymentStatus][0]}</Badge></div></div>
      </div>
      {o.comment && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm"><b>Комментарий покупателя:</b> {o.comment}</div>}
      {/* на телефоне — списком, без горизонтальной прокрутки */}
      <div className="divide-y divide-slate-100 border-y border-slate-100 sm:hidden">
        {o.items.map((i) => {
          const stock = i.product.stocks.reduce((a, s) => a + s.quantity, 0);
          return (
            <Link key={i.id} to={`/products/${i.productId}`} className="flex gap-3 py-2.5 text-sm">
              <Thumb src={i.product.images[0]?.path} size={44} />
              <div className="min-w-0 flex-1">
                <div className="leading-snug">{i.name}</div>
                <div className="font-mono text-xs text-slate-400">{i.product.sku}</div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                  <span>{fmtNum(i.quantity)} × {money(i.price)}</span>
                  <span className={stock < i.quantity ? 'text-rose-600' : ''}>на складе {fmtNum(stock)}</span>
                  <span className="text-sm font-semibold text-slate-900">{money(i.price * i.quantity)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="hidden sm:block">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th><th className="th text-right">Кол-во</th><th className="th text-right">Цена</th><th className="th text-right">Сумма</th><th className="th text-right">На складе</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {o.items.map((i) => {
            const stock = i.product.stocks.reduce((a, s) => a + s.quantity, 0);
            return (
              <tr key={i.id}>
                <td className="py-2"><Link to={`/products/${i.productId}`} className="flex items-center gap-2 hover:text-indigo-600"><Thumb src={i.product.images[0]?.path} size={36} /><div>{i.name}<div className="font-mono text-xs text-slate-400">{i.product.sku}</div></div></Link></td>
                <td className="py-2 text-right">{fmtNum(i.quantity)}</td><td className="py-2 text-right">{money(i.price)}</td><td className="py-2 text-right font-medium">{money(i.price * i.quantity)}</td>
                <td className={`py-2 text-right ${stock < i.quantity ? 'text-rose-600' : 'text-slate-500'}`}>{fmtNum(stock)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="mt-3 space-y-0.5 text-right text-sm">
        <div className="text-slate-500">Товары: {money(o.subtotal)}</div>
        {o.delivery !== 'pickup' && <div className="text-slate-500">Доставка: {o.deliveryPrice ? money(o.deliveryPrice) : 'бесплатно'}</div>}
        <div className="text-xl font-bold">Итого: {money(o.total)}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Создан: {fmtDate(o.createdAt)}</span>
        {o.paidAt && <span>Оплачен: {fmtDate(o.paidAt)}</span>}
        {o.paymentId && <span>Платёж Т-Банк: {o.paymentId}</span>}
        {o.saleId && <Link to="/sales" className="inline-flex items-center gap-1 text-indigo-600">Продажа создана <ExternalLink size={12} /></Link>}
      </div>
    </Modal>
  );
}

export default function Orders() {
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [view, setView] = useState(params.get('open') ? Number(params.get('open')) : null);
  const { data, reload, loading } = useLoad('/orders' + qs({ status, q }));
  const money = useMoney();
  const c = data?.counts || {};
  const tabs = [['active', 'В работе', (c.new || 0) + (c.confirmed || 0) + (c.ready || 0)], ['new', 'Новые', c.new], ['completed', 'Выполненные', c.completed], ['cancelled', 'Отменённые', c.cancelled], ['', 'Все']];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Заказы" subtitle="Заказы из интернет-магазина">
        <a href="/" target="_blank" rel="noreferrer"><Button variant="secondary" icon={ExternalLink}>Открыть магазин</Button></a>
      </PageHeader>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          {tabs.map(([k, l, n]) => <button key={l} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 text-sm ${status === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}{n ? ` · ${n}` : ''}</button>)}
          <div className="relative ml-auto w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Номер, телефон, имя" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={ShoppingBag} title="Заказов нет" text="Заказы покупателей из интернет-магазина появятся здесь" /> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th">Заказ</th><th className="th">Дата</th><th className="th">Покупатель</th><th className="th">Получение</th><th className="th">Оплата</th><th className="th text-right">Сумма</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((o) => (
                  <tr key={o.id} onClick={() => setView(o.id)} className={`cursor-pointer hover:bg-slate-50/70 ${o.status === 'new' ? 'bg-indigo-50/40' : ''}`}>
                    <td className="td"><div className="font-medium">{o.number}</div><Badge color={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></td>
                    <td className="td text-slate-500">{fmtDate(o.createdAt)}</td>
                    <td className="td"><div>{o.name || '—'}</div><div className="text-xs text-slate-500">{fmtPhone(o.phone)}</div></td>
                    <td className="td text-sm"><span title={o.address || ''}>{o.deliveryName || o.delivery}</span></td>
                    <td className="td text-sm"><div>{PAY_METHOD[o.paymentMethod]}</div><Badge color={PAY_STATUS[o.paymentStatus][1]}>{PAY_STATUS[o.paymentStatus][0]}</Badge></td>
                    <td className="td text-right font-semibold">{money(o.total)}<div className="text-xs font-normal text-slate-500">{fmtNum(o._count.items)} поз.</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && <OrderModal id={view} onClose={() => setView(null)} onChange={reload} />}
    </div>
  );
}
