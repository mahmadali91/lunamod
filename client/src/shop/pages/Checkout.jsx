import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Store, Truck, Banknote, CreditCard, Loader2 } from 'lucide-react';
import { shopApi, fmtPhone } from '../api';
import { useShop } from '../store';

function Option({ active, onClick, icon: Icon, title, sub }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}>
      <Icon className="mt-0.5 shrink-0" size={20} /><div><div className="font-semibold">{title}</div>{sub && <div className="text-sm text-slate-500">{sub}</div>}</div>
    </button>
  );
}

export default function Checkout() {
  const { config, cart, money, auth, notify } = useShop();
  const navigate = useNavigate();
  const d = config.delivery, pay = config.payments;
  const [f, setF] = useState({ name: '', delivery: d.pickup ? 'pickup' : 'courier', address: '', paymentMethod: pay.tbank ? 'tbank' : 'cash', comment: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (auth.me) setF((x) => ({ ...x, name: x.name || auth.me.name || '', address: x.address || auth.me.address || '' })); }, [auth.me]);
  if (!auth.me) return <Navigate to="/cart" replace />;
  if (!cart.items.length) return <Navigate to="/cart" replace />;

  const deliveryPrice = f.delivery === 'courier' && !(d.courierFreeFrom > 0 && cart.total >= d.courierFreeFrom) ? d.courierPrice : 0;
  const total = cart.total + deliveryPrice;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await shopApi('/orders', { method: 'POST', body: { ...f, items: cart.items.map((i) => ({ productId: i.id, quantity: i.quantity })) } });
      cart.clear();
      if (r.paymentUrl) { window.location.href = r.paymentUrl; return; }
      if (r.paymentError) notify(r.paymentError, 'error');
      navigate(`/order/${r.order.id}?new=1`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl px-4 pt-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Оформление заказа</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Получатель</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Имя" className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-600">{fmtPhone(auth.me.phone)}</div>
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Получение</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {d.pickup && <Option active={f.delivery === 'pickup'} onClick={() => setF({ ...f, delivery: 'pickup' })} icon={Store} title="Самовывоз" sub={d.pickupAddress || 'бесплатно'} />}
              {d.courier && <Option active={f.delivery === 'courier'} onClick={() => setF({ ...f, delivery: 'courier' })} icon={Truck} title="Курьером" sub={d.courierFreeFrom > 0 && cart.total >= d.courierFreeFrom ? 'бесплатно' : `${money(d.courierPrice)}${d.courierFreeFrom > 0 ? `, бесплатно от ${money(d.courierFreeFrom)}` : ''}`} />}
            </div>
            {f.delivery === 'courier' && <textarea required rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Город, улица, дом, квартира, подъезд" className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Оплата</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {pay.tbank && <Option active={f.paymentMethod === 'tbank'} onClick={() => setF({ ...f, paymentMethod: 'tbank' })} icon={CreditCard} title="Онлайн через Т-Банк" sub="картой, СБП или T-Pay" />}
              {pay.cash && <Option active={f.paymentMethod === 'cash'} onClick={() => setF({ ...f, paymentMethod: 'cash' })} icon={Banknote} title="При получении" sub="наличными или картой" />}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Комментарий</h2>
            <textarea rows={2} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Например, удобное время доставки" className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900" />
          </section>
        </div>
        <div className="h-fit rounded-3xl bg-slate-50 p-6 lg:sticky lg:top-24">
          <div className="space-y-2 text-sm">
            {cart.items.map((i) => <div key={i.id} className="flex justify-between gap-3"><span className="text-slate-600">{i.name} × {i.quantity}</span><span className="shrink-0">{money(i.price * i.quantity)}</span></div>)}
          </div>
          <div className="mt-4 space-y-1 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Товары</span><span>{money(cart.total)}</span></div>
            {f.delivery === 'courier' && <div className="flex justify-between"><span className="text-slate-600">Доставка</span><span>{deliveryPrice ? money(deliveryPrice) : 'бесплатно'}</span></div>}
          </div>
          <div className="mt-3 flex justify-between text-lg font-bold"><span>Итого</span><span>{money(total)}</span></div>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />}{f.paymentMethod === 'tbank' ? 'Перейти к оплате' : 'Подтвердить заказ'}
          </button>
        </div>
      </div>
    </form>
  );
}
