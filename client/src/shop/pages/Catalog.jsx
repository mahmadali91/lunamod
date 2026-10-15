import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { shopApi } from '../api';
import ProductCard from '../ProductCard';

const SORTS = [['popular', 'Популярные'], ['new', 'Новинки'], ['cheap', 'Сначала дешевле'], ['expensive', 'Сначала дороже']];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(false);
  const category = params.get('category'), q = params.get('q'), sort = params.get('sort') || 'popular', sale = params.get('sale');
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };

  useEffect(() => { shopApi('/categories').then(setCats); }, []);
  useEffect(() => { setPage(1); }, [category, q, sort, sale]);
  useEffect(() => {
    const p = new URLSearchParams({ sort, page, limit: 24 });
    if (category) p.set('category', category); if (q) p.set('q', q); if (sale) p.set('sale', 1);
    shopApi('/products?' + p).then((r) => { setData(r); setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items])); });
  }, [category, q, sort, sale, page]);

  const current = cats.find((c) => String(c.id) === category);
  const title = q ? `Поиск: «${q}»` : sale ? 'Скидки' : current?.name || 'Каталог';

  const catList = (
    <div className="space-y-1">
      <button onClick={() => set('category', '')} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${!category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>Все товары</button>
      {cats.map((c) => (
        <button key={c.id} onClick={() => { set('category', String(c.id)); setFilters(false); }} className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${String(c.id) === category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>
          <span>{c.name}</span><span className="opacity-50">{c.count}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {data && <p className="mt-1 text-sm text-slate-500">{data.total} товаров</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilters(true)} className="flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm lg:hidden"><SlidersHorizontal size={16} /> Категории</button>
          <select value={sort} onChange={(e) => set('sort', e.target.value)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm outline-none">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {(q || sale) && <div className="mb-4 flex gap-2">{q && <button onClick={() => set('q', '')} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">«{q}» <X size={14} /></button>}{sale && <button onClick={() => set('sale', '')} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">Со скидкой <X size={14} /></button>}</div>}
      <div className="flex gap-8">
        <aside className="hidden w-60 shrink-0 lg:block">{catList}</aside>
        <div className="flex-1">
          {!data ? <div className="py-20 text-center text-slate-400">Загрузка…</div> : items.length === 0 ? (
            <div className="py-20 text-center"><div className="text-lg font-semibold">Ничего не найдено</div><p className="mt-1 text-slate-500">Попробуйте изменить запрос или выбрать другую категорию</p></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              {items.length < data.total && <div className="mt-10 text-center"><button onClick={() => setPage(page + 1)} className="rounded-full border border-slate-300 px-8 py-3 text-sm font-medium hover:bg-slate-50">Показать ещё</button></div>}
            </>
          )}
        </div>
      </div>
      {filters && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setFilters(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><b>Категории</b><button onClick={() => setFilters(false)}><X /></button></div>
            {catList}
          </div>
        </div>
      )}
    </div>
  );
}
