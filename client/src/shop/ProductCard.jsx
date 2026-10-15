import { Link } from 'react-router-dom';
import { Plus, ImageOff, Heart } from 'lucide-react';
import { useShop } from './store';

export default function ProductCard({ p }) {
  const { money, cart, fav } = useShop();
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const liked = fav.has(p.id);
  const url = p.url || `/product/${p.id}`;
  return (
    <div className="group relative">
      <Link to={url} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100">
          {p.images[0] ? (
            <>
              <img src={p.images[0]} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 ${p.images[1] ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
              {p.images[1] && <img src={p.images[1]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
            </>
          ) : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff size={40} /></div>}
          <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
            {discount > 0 && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">−{discount}%</span>}
            {p.isNew && <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900">Новинка</span>}
          </div>
          {!p.inStock && <span className="absolute inset-x-3 bottom-3 rounded-full bg-white/90 py-1.5 text-center text-xs font-medium text-slate-900">Нет в наличии</span>}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-bold">{p.priceFrom ? 'от ' : ''}{money(p.price)}</span>
          {p.oldPrice && <span className="text-sm text-slate-400 line-through">{money(p.oldPrice)}</span>}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm text-slate-700">{p.brand && <b className="font-semibold">{p.brand} · </b>}{p.name}</div>
        {(p.sizes?.length > 0 || p.colors?.length > 1) && (
          <div className="mt-1 truncate text-xs text-slate-400">{p.sizes.join(' ')}{p.colors.length > 1 ? `${p.sizes.length ? ' · ' : ''}${p.colors.length} цвета` : ''}</div>
        )}
      </Link>
      <button onClick={() => fav.toggle(p.id)} aria-label={liked ? 'Убрать из избранного' : 'В избранное'} aria-pressed={liked} title={liked ? 'Убрать из избранного' : 'В избранное'}
        className={`absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm transition hover:scale-110 ${liked ? 'text-rose-500' : 'text-slate-700'}`}>
        <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
      </button>
      {p.inStock && !p.hasVariants && (
        <button onClick={() => cart.add(p)} aria-label="В корзину" title="В корзину"
          className="absolute top-14 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-md transition hover:bg-slate-900 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">
          <Plus size={18} />
        </button>
      )}
    </div>
  );
}
