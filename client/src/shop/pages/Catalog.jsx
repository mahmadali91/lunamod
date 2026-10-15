import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, Check, ChevronDown } from 'lucide-react';
import { shopApi } from '../api';
import ProductCard from '../ProductCard';
import RecentlyViewed from '../RecentlyViewed';

const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

const SORTS = [['default', 'Рекомендуемые'], ['new', 'Новинки'], ['popular', 'Популярные'], ['cheap', 'Сначала дешевле'], ['expensive', 'Сначала дороже']];
const FILTER_KEYS = ['sizes', 'colors', 'brands', 'min', 'max', 'inStock', 'sale'];
const COLOR_HEX = { чёрный: '#111', черный: '#111', белый: '#fff', серый: '#9ca3af', бежевый: '#e8d8bf', синий: '#2549b6', голубой: '#7fb3ea', красный: '#d42a2a', розовый: '#f4a6c0', зелёный: '#2f8a4b', зеленый: '#2f8a4b', хаки: '#7a7a4b', жёлтый: '#f2cf3a', желтый: '#f2cf3a', коричневый: '#7b4a2a', молочный: '#f6efe3', бордовый: '#7d1e2c', фиолетовый: '#7c4dc4', оранжевый: '#f08a24' };
export const colorHex = (c) => COLOR_HEX[String(c || '').toLowerCase()] || null;

function Chip({ on, onClick, children, title }) {
  return <button type="button" onClick={onClick} title={title} aria-pressed={on} className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:border-slate-900'}`}>{children}</button>;
}

// Выпадающий фильтр в строке над товарами (на телефоне — панель снизу)
function FilterMenu({ label, count, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition sm:px-3.5 sm:py-2 ${count ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:border-slate-900'}`}>
        {label}{count > 0 && <span className="ml-0.5 text-xs opacity-80">· {count}</span>}<ChevronDown size={15} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[56] max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:mt-2 sm:w-max sm:max-w-sm sm:rounded-2xl sm:p-4">
          <div className="mb-3 flex items-center justify-between sm:hidden"><b>{label}</b><button onClick={() => setOpen(false)} aria-label="Закрыть"><X size={20} /></button></div>
          {children}
          <button onClick={() => setOpen(false)} className="mt-4 w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white sm:hidden">Готово</button>
        </div>
      )}
    </div>
  );
}

function PriceRange({ params, setMany, price }) {
  const [min, setMin] = useState(params.get('min') || '');
  const [max, setMax] = useState(params.get('max') || '');
  const apply = () => setMany({ min, max });
  return (
    <div className="w-64">
      <div className="flex items-center gap-2">
        <input type="number" inputMode="numeric" min="0" value={min} onChange={(e) => setMin(e.target.value)} placeholder={`от ${price.min}`} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900" />
        <span className="text-slate-400">—</span>
        <input type="number" inputMode="numeric" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder={`до ${price.max}`} onKeyDown={(e) => e.key === 'Enter' && apply()} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900" />
      </div>
      <button onClick={apply} className="mt-3 w-full rounded-full border border-slate-900 py-2 text-sm font-semibold hover:bg-slate-900 hover:text-white">Применить</button>
    </div>
  );
}

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [facets, setFacets] = useState(null);
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [panel, setPanel] = useState(false);
  const category = params.get('category'), q = params.get('q'), sort = params.get('sort') || 'default', sale = params.get('sale');
  const multi = (k) => (params.get(k) ? params.get(k).split(',') : []);
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: k !== 'category' }); };
  const setMany = (obj) => { const p = new URLSearchParams(params); Object.entries(obj).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k))); setParams(p, { replace: true }); };
  const toggle = (k, v) => { const cur = multi(k); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',')); };
  const key = params.toString();
  const active = FILTER_KEYS.filter((k) => params.get(k)).length;

  useEffect(() => { shopApi('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    const p = new URLSearchParams(); if (category) p.set('category', category); if (q) p.set('q', q); if (sale) p.set('sale', 1);
    shopApi('/facets?' + p).then(setFacets).catch(() => {});
  }, [category, q, sale]);
  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    const p = new URLSearchParams(params); p.set('sort', sort); p.set('page', page); p.set('limit', 24);
    shopApi('/products?' + p).then((r) => { setData(r); setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items])); }).catch(() => setData({ items: [], total: 0 }));
  }, [key, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = cats.find((c) => String(c.id) === category);
  const title = q ? `Поиск: «${q}»` : sale ? 'Скидки' : sort === 'new' && !category ? 'Новинки' : current?.name || 'Каталог';
  const reset = () => { const p = new URLSearchParams(params); FILTER_KEYS.forEach((k) => p.delete(k)); setParams(p); };

  const categoriesUi = (
    <div className="space-y-0.5">
      <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Категории</div>
      <button onClick={() => set('category', '')} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${!category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>Все товары</button>
      {cats.map((c) => (
        <button key={c.id} onClick={() => set('category', String(c.id))} className={`flex w-full justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${String(c.id) === category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>
          <span>{c.name}</span><span className="opacity-50">{c.count}</span>
        </button>
      ))}
    </div>
  );

  const filtersUi = (mobile) => (
    <div className="flex flex-col gap-6">
      <div className={mobile ? 'order-last' : ''}>
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Категории</div>
        <div className="space-y-0.5">
          <button onClick={() => set('category', '')} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${!category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>Все товары</button>
          {cats.map((c) => (
            <button key={c.id} onClick={() => set('category', String(c.id))} className={`flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm ${String(c.id) === category ? 'bg-slate-900 font-medium text-white' : 'hover:bg-slate-100'}`}>
              <span>{c.name}</span><span className="opacity-50">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
      {facets?.sizes.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Размер</div>
          <div className="flex flex-wrap gap-1.5">{facets.sizes.map(({ v }) => <Chip key={v} on={multi('sizes').includes(v)} onClick={() => toggle('sizes', v)}>{v}</Chip>)}</div>
        </div>
      )}
      {facets?.colors.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Цвет</div>
          <div className="flex flex-wrap gap-1.5">{facets.colors.map(({ v }) => (
            <Chip key={v} on={multi('colors').includes(v)} onClick={() => toggle('colors', v)}>
              <span className="flex items-center gap-1.5">{colorHex(v) && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-slate-300" style={{ background: colorHex(v) }} />}{v}</span>
            </Chip>
          ))}</div>
        </div>
      )}
      {facets?.brands.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Бренд</div>
          <div className="flex flex-wrap gap-1.5">{facets.brands.map(({ v }) => <Chip key={v} on={multi('brands').includes(v)} onClick={() => toggle('brands', v)}>{v}</Chip>)}</div>
        </div>
      )}
      {facets?.price && (
        <div>
          <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Цена, ₽</div>
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" min="0" defaultValue={params.get('min') || ''} key={'min' + params.get('min')} placeholder={`от ${facets.price.min}`} onBlur={(e) => set('min', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && set('min', e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900" />
            <span className="text-slate-400">—</span>
            <input type="number" inputMode="numeric" min="0" defaultValue={params.get('max') || ''} key={'max' + params.get('max')} placeholder={`до ${facets.price.max}`} onBlur={(e) => set('max', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && set('max', e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {[['inStock', 'Только в наличии'], ['sale', 'Со скидкой']].map(([k, l]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
            <span className={`flex h-5 w-5 items-center justify-center rounded border ${params.get(k) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>{params.get(k) && <Check size={14} />}</span>
            <input type="checkbox" className="sr-only" checked={!!params.get(k)} onChange={(e) => set(k, e.target.checked ? '1' : '')} />{l}
          </label>
        ))}
      </div>
      {active > 0 && <button onClick={reset} className="text-sm text-slate-500 underline">Сбросить фильтры</button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:pt-6">
      {/* одна строка: заголовок с количеством · фильтры · сортировка (на телефоне фильтры — второй строкой с прокруткой) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2.5 sm:mb-5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2 lg:flex-none">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {data && <span className="shrink-0 text-sm whitespace-nowrap text-slate-500">{data.total} {plural(data.total, 'товар', 'товара', 'товаров')}</span>}
        </div>
        <select value={sort} onChange={(e) => set('sort', e.target.value)} aria-label="Сортировка" className="max-w-[45%] shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none lg:order-last lg:max-w-none sm:px-3.5 sm:py-2">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:w-auto lg:flex-1 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
          <button onClick={() => setPanel(true)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm sm:px-3.5 sm:py-2 lg:hidden">
            <SlidersHorizontal size={15} /> Все{active > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-xs text-white">{active}</span>}
          </button>
          {facets?.sizes.length > 0 && <FilterMenu label="Размер" count={multi('sizes').length}>
            <div className="flex flex-wrap gap-1.5">{facets.sizes.map(({ v }) => <Chip key={v} on={multi('sizes').includes(v)} onClick={() => toggle('sizes', v)}>{v}</Chip>)}</div>
          </FilterMenu>}
          {facets?.colors.length > 0 && <FilterMenu label="Цвет" count={multi('colors').length}>
            <div className="flex max-w-xs flex-wrap gap-1.5">{facets.colors.map(({ v }) => (
              <Chip key={v} on={multi('colors').includes(v)} onClick={() => toggle('colors', v)}>
                <span className="flex items-center gap-1.5">{colorHex(v) && <span className="h-3.5 w-3.5 rounded-full ring-1 ring-slate-300" style={{ background: colorHex(v) }} />}{v}</span>
              </Chip>
            ))}</div>
          </FilterMenu>}
          {facets?.brands.length > 0 && <FilterMenu label="Бренд" count={multi('brands').length}>
            <div className="flex max-w-xs flex-wrap gap-1.5">{facets.brands.map(({ v }) => <Chip key={v} on={multi('brands').includes(v)} onClick={() => toggle('brands', v)}>{v}</Chip>)}</div>
          </FilterMenu>}
          {facets?.price && <FilterMenu label="Цена" count={params.get('min') || params.get('max') ? 1 : 0}>
            <PriceRange params={params} setMany={setMany} price={facets.price} />
          </FilterMenu>}
          {[['inStock', 'В наличии'], ['sale', 'Со скидкой']].map(([k, l]) => (
            <button key={k} onClick={() => set(k, params.get(k) ? '' : '1')} aria-pressed={!!params.get(k)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition sm:px-3.5 sm:py-2 ${params.get(k) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:border-slate-900'}`}>{l}</button>
          ))}
        </div>
      </div>
      {(q || active > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {q && <button onClick={() => set('q', '')} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">«{q}» <X size={14} /></button>}
          {['sizes', 'colors', 'brands'].flatMap((k) => multi(k).map((v) => <button key={k + v} onClick={() => toggle(k, v)} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">{v} <X size={14} /></button>))}
          {(params.get('min') || params.get('max')) && <button onClick={() => { const p = new URLSearchParams(params); p.delete('min'); p.delete('max'); setParams(p); }} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">{params.get('min') || 0} – {params.get('max') || '∞'} ₽ <X size={14} /></button>}
          {params.get('inStock') && <button onClick={() => set('inStock', '')} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">В наличии <X size={14} /></button>}
          {sale && <button onClick={() => set('sale', '')} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">Со скидкой <X size={14} /></button>}
        </div>
      )}
      <div className="flex gap-8">
        <aside className="panel hidden w-60 shrink-0 self-start p-3 lg:block">{categoriesUi}</aside>
        <div className="min-w-0 flex-1">
          {!data ? <div className="py-20 text-center text-slate-400">Загрузка…</div> : items.length === 0 ? (
            <div className="py-20 text-center"><div className="text-lg font-semibold">Ничего не найдено</div><p className="mt-1 text-slate-500">Попробуйте изменить фильтры или выбрать другую категорию</p>{active > 0 && <button onClick={reset} className="mt-4 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white">Сбросить фильтры</button>}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              {items.length < data.total && <div className="mt-10 text-center"><button onClick={() => setPage(page + 1)} className="rounded-full border border-slate-300 px-8 py-3 text-sm font-medium hover:bg-slate-50">Показать ещё</button></div>}
            </>
          )}
        </div>
      </div>
      <RecentlyViewed />
      {panel && (
        <div className="fixed inset-0 z-[55] lg:hidden" onClick={() => setPanel(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Фильтры" className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><b className="text-lg">Фильтры</b><button onClick={() => setPanel(false)} aria-label="Закрыть"><X /></button></div>
            <div className="flex-1 overflow-y-auto p-5">{filtersUi(true)}</div>
            <div className="border-t border-slate-100 p-4"><button onClick={() => setPanel(false)} className="w-full rounded-full bg-slate-900 py-3 font-semibold text-white">Показать {data?.total ?? ''} товаров</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
