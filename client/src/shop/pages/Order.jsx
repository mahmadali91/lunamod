import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, CreditCard, Loader2, Store, Truck } from 'lucide-react';
import { shopApi } from '../api';
import { useShop } from '../store';
import SbpPay from '../SbpPay';
import Img from '../Img';

export const STATUS = {
  new: ['Принят', 'bg-indigo-100 text-indigo-800'], confirmed: ['Подтверждён', 'bg-sky-100 text-sky-800'], ready: ['Собран / в пути', 'bg-amber-100 text-amber-800'],
  completed: ['Выполнен', 'bg-emerald-100 text-emerald-800'], cancelled: ['Отменён', 'bg-slate-200 text-slate-700'],
};
export const PAY = { unpaid: 'не оплачен', pending: 'ожидает оплаты', paid: 'оплачен', failed: 'оплата не прошла', refunded: 'деньги возвращены' };

export default function Order() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { auth, money, config, notify } = useShop();
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => shopApi('/orders/' + id).then(setO).catch(() => setO(false));
  useEffect(() => { if (auth.me) load(); }, [id, auth.me]); // eslint-disable-line react-hooks/exhaustive-deps
  // после возврата из банка уведомление может прийти чуть позже — обновим статус ещё пару раз
  useEffect(() => {
    if (!o || o.paymentStatus !== 'pending' || !params.get('paid')) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [o]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth.me) return <Navigate to="/" replace />;
  if (o === false) return <div className="py-24 text-center"><h1 className="text-2xl font-bold">Заказ не найден</h1><Link to="/account" className="mt-4 inline-block underline">Мои заказы</Link></div>;
  if (!o) return <div className="py-24 text-center text-slate-400">Загрузка…</div>;

  const pay = async () => {
    setBusy(true);
    try { const r = await shopApi(`/orders/${o.id}/pay`, { method: 'POST' }); window.location.href = r.paymentUrl; } catch (e) { notify(e.message, 'error'); setBusy(false); }
  };
  const testPay = async () => { setBusy(true); try { setO(await shopApi(`/orders/${o.id}/test-pay`, { method: 'POST' })); setParams({}); notify('Оплата прошла (тест)'); } finally { setBusy(false); } };
  const cancel = async () => { if (!confirm('Отменить заказ?')) return; try { setO(await shopApi(`/orders/${o.id}/cancel`, { method: 'POST' })); } catch (e) { notify(e.message, 'error'); } };
  const needPay = ['tbank', 'sbp'].includes(o.paymentMethod) && ['unpaid', 'pending', 'failed'].includes(o.paymentStatus) && o.status !== 'cancelled';
  const sbpQr = o.paymentMethod === 'sbp' && needPay && o.paymentStatus === 'pending' && o.paymentUrl;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      {sbpQr ? (
        <SbpPay order={o} money={money} onCheck={load} test={config.testMode && o.paymentUrl.includes('/TEST')} onTestPay={testPay} />
      ) : params.get('testpay') && needPay && config.testMode ? (
        <div className="mb-6 rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
          <CreditCard className="mx-auto text-amber-600" size={36} />
          <h2 className="mt-2 text-xl font-bold">Тестовая оплата</h2>
          <p className="mt-1 text-sm text-amber-900">Ключи Т-Банка ещё не подключены — эта страница заменяет платёжную форму банка. Деньги не списываются.</p>
          <button onClick={testPay} disabled={busy} className="mt-4 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white">Оплатить {money(o.total)} (тест)</button>
        </div>
      ) : (
        <div className="mb-6 rounded-3xl bg-slate-50 p-6 text-center">
          {o.status === 'cancelled' ? <XCircle className="mx-auto text-slate-400" size={44} /> : o.paymentStatus === 'paid' || o.paymentMethod === 'cash' ? <CheckCircle2 className="mx-auto text-emerald-500" size={44} /> : <Clock className="mx-auto text-amber-500" size={44} />}
          <h1 className="mt-3 text-2xl font-bold">{params.get('new') || params.get('paid') ? 'Спасибо за заказ!' : `Заказ ${o.number}`}</h1>
          <p className="mt-1 text-slate-600">
            {o.status === 'cancelled' ? 'Заказ отменён' : o.paymentStatus === 'paid' ? `Заказ ${o.number} оплачен. Мы свяжемся с вами для подтверждения.` : o.paymentMethod === 'cash' ? `Номер заказа ${o.number}. Оплата при получении — мы позвоним для подтверждения.` : params.get('failed') ? 'Оплата не прошла. Попробуйте ещё раз.' : 'Ожидаем оплату'}
          </p>
          {needPay && <button onClick={pay} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white">{busy && <Loader2 size={18} className="animate-spin" />}Оплатить {money(o.total)}</button>}
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Заказ {o.number} от {new Date(o.createdAt).toLocaleDateString('ru-RU')}</div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
        </div>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex gap-2">{o.delivery === 'pickup' ? <Store size={18} /> : <Truck size={18} />}<div>{o.deliveryName || 'Доставка'}{o.address ? `: ${o.address}` : o.delivery === 'pickup' && config.pickupAddress ? `: ${config.pickupAddress}` : ''}{(() => { try { const d = JSON.parse(o.deliveryInfo || '{}').days; return d ? ` (${d})` : ''; } catch { return ''; } })()}</div></div>
          <div className="flex gap-2"><CreditCard size={18} /><div>{{ tbank: 'Онлайн, Т-Банк', sbp: 'СБП' }[o.paymentMethod] || 'При получении'} — {PAY[o.paymentStatus]}</div></div>
        </div>
        <div className="mt-5 divide-y divide-slate-100">
          {o.items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 py-3">
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100"><Img src={i.product.images[0]?.path} /></div>
              <Link to={`/product/${i.productId}`} className="flex-1 text-sm">{i.name}<div className="text-slate-500">{i.quantity} × {money(i.price)}</div></Link>
              <b>{money(i.price * i.quantity)}</b>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-right text-sm">
          {o.delivery !== 'pickup' && <div className="text-slate-500">Доставка: {o.deliveryPrice ? money(o.deliveryPrice) : 'бесплатно'}</div>}
          <div className="text-lg font-bold">Итого: {money(o.total)}</div>
        </div>
        {o.status === 'new' && o.paymentStatus !== 'paid' && <button onClick={cancel} className="mt-4 text-sm text-slate-500 underline">Отменить заказ</button>}
      </div>
      <div className="mt-6 text-center"><Link to="/account" className="text-sm underline">Все мои заказы</Link></div>
    </div>
  );
}
