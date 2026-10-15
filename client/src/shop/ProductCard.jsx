import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ImageOff, Heart, ShoppingBag } from 'lucide-react';
import { useShop } from './store';
import QuickBuy from './QuickBuy';

export default function ProductCard({ p }) {
  const { money, cart, fav } = useShop();
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const liked = fav.has(p.id);
  const url = p.url || `/product/${p.id}`;
  const [quick, setQuick] = useState(false);
  const inCart = cart.countOf(p.id);
  const buy = () => (p.hasVariants ? setQuick(true) : cart.add({ ...p, cardId: p.id }, 1));
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-2 pb-2.5 transition [box-shadow:var(--shadow-card)] hover:[box-shadow:var(--shadow-card-hover)]">
      <Link to={url} className="flex flex-1 flex-col">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-100">
          {p.images[0] ? (
            <>
              <img src={p.images[0]} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 ${p.images[1] ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
              {p.images[1] && <img src={p.images[1]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
            </>
          ) : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff size={40} /></div>}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            {discount > 0 && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">−{discount}%</span>}
            {p.isNew && <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900">Новинка</span>}
          </div>
          {!p.inStock && <span className="absolute inset-x-3 bottom-3 rounded-full bg-white/90 py-1.5 text-center text-xs font-medium text-slate-900">Нет в наличии</span>}
        </div>
        <div className="mt-2.5 flex items-baseline gap-2 px-1">
          <span className="font-bold">{p.priceFrom ? 'от ' : ''}{money(p.price)}</span>
          {p.oldPrice && <span className="text-sm text-slate-400 line-through">{money(p.oldPrice)}</span>}
        </div>
        <div className="mt-0.5 line-clamp-2 min-h-[2.5rem] px-1 text-sm text-slate-700">{p.brand && <b className="font-semibold">{p.brand} · </b>}{p.name}</div>
        {(p.sizes?.length > 0 || p.colors?.length > 1) && (
          <div className="mt-1 truncate px-1 text-xs text-slate-500">{p.sizes.join(' ')}{p.colors.length > 1 ? `${p.sizes.length ? ' · ' : ''}${p.colors.length} цвета` : ''}</div>
        )}
      </Link>
      <button onClick={() => fav.toggle(p.id)} aria-label={liked ? 'Убрать из избранного' : 'В избранное'} aria-pressed={liked} title={liked ? 'Убрать из избранного' : 'В избранное'}
        className={`absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-110 ${liked ? 'text-rose-500' : 'text-slate-700'}`}>
        <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
      </button>
      {/* кнопка всегда внизу карточки — на одном уровне во всём ряду */}
      <button onClick={buy} disabled={!p.inStock && !p.hasVariants}
        className="relative mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-slate-900 bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-white hover:text-slate-900 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
        <ShoppingBag size={16} /> {p.inStock ? (inCart ? 'Ещё' : 'В корзину') : p.hasVariants ? 'Выбрать размер' : 'Нет в наличии'}
        {inCart > 0 && <span className="absolute -top-2 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900">{inCart}</span>}
      </button>
      {quick && <QuickBuy card={p} onClose={() => setQuick(false)} />}
    </div>
  );
}
