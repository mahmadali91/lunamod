import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Banknote, CreditCard, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import DeliveryPicker from '../DeliveryPicker';
import { shopApi, fmtPhone } from '../api';
import { useShop } from '../store';
import { ecommerce } from '../metrika';

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
  const pay = config.payments;
  const [f, setF] = useState({ name: '', paymentMethod: pay.tbank ? 'tbank' : 'cash', comment: '' });
  const [dl, setDl] = useState({ ready: false });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (auth.me) setF((x) => ({ ...x, name: x.name || auth.me.name || '' })); }, [auth.me]);
  if (!auth.me) return <Navigate to="/cart" replace />;
  if (!cart.items.length) return <Navigate to="/cart" replace />;

  const deliveryPrice = dl.price ?? null;
  const total = cart.total + (deliveryPrice || 0);
  const lines = cart.items.map((i) => ({ productId: i.id, quantity: i.quantity }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await shopApi('/orders', { method: 'POST', body: { ...f, items: lines, delivery: dl.methodId, deliveryTo: dl.to, agree } });
      ecommerce('purchase', cart.items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })), { id: r.order.number || r.order.id, revenue: r.order.total });
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
            <h2 className="mb-3 text-lg font-semibold">Доставка</h2>
            <DeliveryPicker items={lines} subtotal={cart.total} initialAddress={auth.me.address} onChange={setDl} />
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
            <div className="flex justify-between"><span className="text-slate-600">Доставка{dl.days ? ` (${dl.days})` : ''}</span><span>{deliveryPrice === null ? '—' : deliveryPrice ? money(deliveryPrice) : 'бесплатно'}</span></div>
          </div>
          <div className="mt-3 flex justify-between text-lg font-bold"><span>Итого</span><span>{money(total)}</span></div>
          <label className="mt-4 flex items-start gap-2.5 text-xs text-slate-600">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900" />
            <span>Согласен с <Link to="/legal/offer" target="_blank" className="underline">условиями продажи</Link> и <Link to="/legal/returns" target="_blank" className="underline">условиями возврата</Link></span>
          </label>
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          <button disabled={busy || !agree || !dl.ready} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />}{f.paymentMethod === 'tbank' ? 'Перейти к оплате' : 'Подтвердить заказ'}
          </button>
        </div>
      </div>
    </form>
  );
}
