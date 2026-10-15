import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, Check } from 'lucide-react';
import { shopApi } from '../api';
import { useShop } from '../store';
import ProductCard from '../ProductCard';

export default function Product() {
  const { id } = useParams();
  const { money, cart } = useShop();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [qty, setQty] = useState(1);
  useEffect(() => { setP(null); setI(0); setQty(1); shopApi('/products/' + id).then((r) => { setP(r); document.title = r.name; }).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <div className="py-24 text-center"><h1 className="text-2xl font-bold">{err}</h1><Link to="/catalog" className="mt-4 inline-block underline">В каталог</Link></div>;
  if (!p) return <div className="py-24 text-center text-slate-400">Загрузка…</div>;
  const inCart = cart.items.find((x) => x.id === p.id);
  const n = p.images.length;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6">
      <nav className="mb-4 text-sm text-slate-500"><Link to="/catalog" className="hover:text-slate-900">Каталог</Link>{p.category && <> / <Link to={`/catalog?category=${p.category.id}`} className="hover:text-slate-900">{p.category.name}</Link></>}</nav>
      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        <div>
          <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-slate-100">
            {n > 0 && <img src={p.images[i]} alt={p.name} className="h-full w-full object-cover" />}
            {n > 1 && <>
              <button onClick={() => setI((i - 1 + n) % n)} className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Назад"><ChevronLeft /></button>
              <button onClick={() => setI((i + 1) % n)} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow" aria-label="Вперёд"><ChevronRight /></button>
            </>}
          </div>
          {n > 1 && <div className="mt-3 flex gap-2">{p.images.map((src, k) => <button key={k} onClick={() => setI(k)} className={`h-20 w-16 overflow-hidden rounded-xl bg-slate-100 ${k === i ? 'ring-2 ring-slate-900' : 'opacity-60'}`}><img src={src} alt="" className="h-full w-full object-cover" /></button>)}</div>}
        </div>
        <div className="md:pt-4">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{p.name}</h1>
          {p.sku && <div className="mt-1 text-sm text-slate-400">Артикул: {p.sku}</div>}
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{money(p.price)}</span>
            {p.oldPrice && <span className="text-lg text-slate-400 line-through">{money(p.oldPrice)}</span>}
          </div>
          <div className={`mt-2 text-sm ${p.inStock ? 'text-emerald-600' : 'text-rose-600'}`}>{p.inStock ? (p.stock <= 3 ? `Осталось ${p.stock} шт.` : 'В наличии') : 'Нет в наличии'}</div>

          {p.inStock && (
            <div className="mt-6 flex gap-3">
              <div className="flex items-center rounded-full border border-slate-300">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-3" aria-label="Меньше"><Minus size={16} /></button>
                <span className="w-8 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty(Math.min(p.stock, qty + 1))} className="p-3" aria-label="Больше"><Plus size={16} /></button>
              </div>
              <button onClick={() => cart.add(p, qty)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800">
                <ShoppingBag size={18} /> В корзину
              </button>
            </div>
          )}
          {inCart && <Link to="/cart" className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><Check size={16} /> В корзине {inCart.quantity} шт. — перейти в корзину</Link>}

          {p.attributes.length > 0 && (
            <dl className="mt-8 divide-y divide-slate-100 border-y border-slate-100 text-sm">
              {p.attributes.map((a) => <div key={a.name} className="flex justify-between py-3"><dt className="text-slate-500">{a.name}</dt><dd className="font-medium">{a.value}</dd></div>)}
            </dl>
          )}
          {p.description && <p className="mt-6 leading-relaxed whitespace-pre-line text-slate-600">{p.description}</p>}
        </div>
      </div>
      {p.related.length > 0 && (
        <section className="pt-16">
          <h2 className="mb-5 text-2xl font-bold tracking-tight">Похожие товары</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{p.related.slice(0, 4).map((x) => <ProductCard key={x.id} p={x} />)}</div>
        </section>
      )}
    </div>
  );
}
