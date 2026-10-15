import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, ImageOff } from 'lucide-react';
import { useShop } from '../store';

export default function Cart() {
  const { cart, money, auth } = useShop();
  const navigate = useNavigate();
  if (!cart.items.length) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShoppingBag size={48} className="mx-auto text-slate-300" />
        <h1 className="mt-4 text-2xl font-bold">Корзина пуста</h1>
        <p className="mt-2 text-slate-500">Добавьте товары из каталога</p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-slate-900 px-6 py-3 font-semibold text-white">В каталог</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Корзина</h1>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="divide-y divide-slate-100 lg:col-span-2">
          {cart.items.map((i) => (
            <div key={i.id} className="flex gap-4 py-4">
              <Link to={`/product/${i.id}`} className="h-28 w-21 shrink-0 overflow-hidden rounded-xl bg-slate-100" style={{ width: 84 }}>
                {i.image ? <img src={i.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff /></div>}
              </Link>
              <div className="flex flex-1 flex-col">
                <Link to={`/product/${i.id}`} className="text-sm font-medium">{i.name}</Link>
                <div className="mt-1 text-sm text-slate-500">{money(i.price)}</div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center rounded-full border border-slate-300">
                    <button onClick={() => cart.set(i.id, i.quantity - 1)} className="p-2" aria-label="Меньше"><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-semibold">{i.quantity}</span>
                    <button onClick={() => cart.set(i.id, i.quantity + 1)} className="p-2" aria-label="Больше"><Plus size={14} /></button>
                  </div>
                  <div className="flex items-center gap-3"><b>{money(i.price * i.quantity)}</b><button onClick={() => cart.remove(i.id)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Удалить"><Trash2 size={18} /></button></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="h-fit rounded-3xl bg-slate-50 p-6 lg:sticky lg:top-24">
          <div className="flex justify-between text-slate-600"><span>Товары ({cart.count})</span><span>{money(cart.total)}</span></div>
          <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold"><span>Итого</span><span>{money(cart.total)}</span></div>
          <p className="mt-1 text-xs text-slate-500">Стоимость доставки — на следующем шаге</p>
          <button onClick={() => auth.require(() => navigate('/checkout'))} className="mt-6 w-full rounded-full bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800">Оформить заказ</button>
        </div>
      </div>
    </div>
  );
}
