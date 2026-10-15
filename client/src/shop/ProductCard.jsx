import { Link } from 'react-router-dom';
import { Plus, ImageOff } from 'lucide-react';
import { useShop } from './store';

export default function ProductCard({ p }) {
  const { money, cart } = useShop();
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return (
    <div className="group relative">
      <Link to={`/product/${p.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100">
          {p.images[0] ? (
            <>
              <img src={p.images[0]} alt={p.name} loading="lazy" className={`h-full w-full object-cover transition duration-500 ${p.images[1] ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
              {p.images[1] && <img src={p.images[1]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />}
            </>
          ) : <div className="flex h-full items-center justify-center text-slate-300"><ImageOff size={40} /></div>}
          {discount > 0 && <span className="absolute top-3 left-3 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">−{discount}%</span>}
          {!p.inStock && <span className="absolute inset-x-3 bottom-3 rounded-full bg-white/90 py-1.5 text-center text-xs font-medium">Нет в наличии</span>}
        </div>
        <div className="mt-3 line-clamp-2 text-sm text-slate-700">{p.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-bold">{money(p.price)}</span>
          {p.oldPrice && <span className="text-sm text-slate-400 line-through">{money(p.oldPrice)}</span>}
        </div>
      </Link>
      {p.inStock && (
        <button onClick={() => cart.add(p)} aria-label="В корзину" title="В корзину"
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-md transition hover:bg-slate-900 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">
          <Plus size={20} />
        </button>
      )}
    </div>
  );
}
