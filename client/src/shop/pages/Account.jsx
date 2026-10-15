import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LogOut, Package } from 'lucide-react';
import { shopApi, fmtPhone } from '../api';
import { useShop } from '../store';
import { STATUS, PAY } from './Order';

export default function Account() {
  const { auth, money, notify } = useShop();
  const [orders, setOrders] = useState(null);
  const [f, setF] = useState(null);
  useEffect(() => { if (auth.me) { shopApi('/orders').then(setOrders); setF({ name: auth.me.name || '', email: auth.me.email || '', address: auth.me.address || '' }); } }, [auth.me]);
  if (!auth.me) return <Navigate to="/" replace />;
  const save = async (e) => { e.preventDefault(); await shopApi('/me', { method: 'PUT', body: f }); await auth.refresh(); notify('Сохранено'); };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Мои заказы</h1><p className="text-slate-500">{fmtPhone(auth.me.phone)}</p></div>
        <button onClick={auth.logout} className="flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm"><LogOut size={16} /> Выйти</button>
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {!orders ? <div className="text-slate-400">Загрузка…</div> : orders.length === 0 ? (
            <div className="rounded-3xl bg-slate-50 p-10 text-center"><Package className="mx-auto text-slate-300" size={40} /><p className="mt-3 text-slate-500">Заказов пока нет</p><Link to="/catalog" className="mt-4 inline-block underline">В каталог</Link></div>
          ) : orders.map((o) => (
            <Link key={o.id} to={`/order/${o.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:border-slate-400">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Заказ {o.number}</div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
              </div>
              <div className="mt-1 text-sm text-slate-500">{new Date(o.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {o.items.length} поз. · <b className="text-slate-900">{money(o.total)}</b> · {PAY[o.paymentStatus]}</div>
              <div className="mt-3 flex gap-2">{o.items.slice(0, 5).map((i) => <div key={i.id} className="h-14 w-11 overflow-hidden rounded-lg bg-slate-100">{i.product.images[0] && <img src={i.product.images[0].path} alt="" className="h-full w-full object-cover" />}</div>)}</div>
            </Link>
          ))}
        </div>
        {f && (
          <form onSubmit={save} className="h-fit space-y-3 rounded-3xl bg-slate-50 p-6">
            <h2 className="font-semibold">Мои данные</h2>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Имя" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
            <textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Адрес доставки" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
            <button className="w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white">Сохранить</button>
          </form>
        )}
      </div>
    </div>
  );
}
