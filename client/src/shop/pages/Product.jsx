import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Check, Heart, Ruler, Bell, BellRing, X, Star } from 'lucide-react';
import { shopApi } from '../api';
import { useShop } from '../store';
import ProductCard from '../ProductCard';
import Gallery from '../Gallery';
import Reviews, { Stars } from '../Reviews';
import RecentlyViewed, { rememberViewed } from '../RecentlyViewed';
import { ecommerce } from '../metrika';

function Shelf({ title, items }) {
  if (!items?.length) return null;
  return (
    <section className="pt-16">
      <h2 className="mb-5 text-2xl font-bold tracking-tight">{title}</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {items.slice(0, 8).map((x) => <div key={x.id} className="w-44 shrink-0 snap-start md:w-auto"><ProductCard p={x} /></div>)}
      </div>
    </section>
  );
}

function SizeChart({ chart, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-label="Таблица размеров" className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 sm:max-w-2xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Таблица размеров</h2><button onClick={onClose} aria-label="Закрыть"><X /></button></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{chart.head.map((h, i) => <th key={i} className="border-b border-slate-200 px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{chart.rows.map((r, i) => <tr key={i} className="odd:bg-slate-50">{r.map((c, j) => <td key={j} className={`px-3 py-2 whitespace-nowrap ${j === 0 ? 'font-semibold' : ''}`}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {chart.note && <p className="mt-4 text-sm whitespace-pre-line text-slate-500">{chart.note}</p>}
      </div>
    </div>
  );
}

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { money, cart, fav, auth, notify, config } = useShop();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState(null);
  const [needSize, setNeedSize] = useState(false);
  const [chart, setChart] = useState(false);
  const [waiting, setWaiting] = useState([]);

  useEffect(() => {
    setP(null); setQty(1); setSize(null); setNeedSize(false); setErr('');
    shopApi('/products/' + parseInt(id, 10)).then((r) => {
      if (r.redirect) { navigate(r.redirect, { replace: true }); return; }
      setP(r); document.title = r.name;
      rememberViewed(r.id);
      ecommerce('detail', [{ id: r.id, name: r.name, price: r.price, category: r.category?.name }]);
    }).catch((e) => setErr(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (auth.me) shopApi('/waitlist').then(setWaiting).catch(() => {}); }, [auth.me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // как на WB: главное фото, затем видео, затем остальные фото
  const media = useMemo(() => {
    if (!p) return [];
    const img = p.media.filter((m) => m.kind !== 'video'), vid = p.media.filter((m) => m.kind === 'video');
    return [...img.slice(0, 1), ...vid, ...img.slice(1)];
  }, [p]);
  const [allAttrs, setAllAttrs] = useState(false);
  const [fullDesc, setFullDesc] = useState(false);

  if (err) return <div className="py-24 text-center"><h1 className="text-2xl font-bold">{err}</h1><Link to="/" className="mt-4 inline-block underline">В каталог</Link></div>;
  if (!p) return <div className="py-24 text-center text-slate-400">Загрузка…</div>;

  const hasV = p.hasVariants;
  // цвет — у карточки; другие цвета модели — соседние карточки (как на WB), внутри карточки — размеры
  const vOf = (s) => p.variants.find((v) => (v.size || null) === (s || null));
  const sizes = hasV ? p.variants.map((v) => v.size).filter(Boolean) : [];
  const variant = hasV ? (sizes.length ? (size ? vOf(size) : null) : p.variants[0]) : null;
  const sellable = hasV ? variant : p;
  const price = variant?.price ?? p.price;
  const oldPrice = variant ? variant.oldPrice : p.oldPrice;
  const inCart = sellable && cart.items.find((x) => x.id === sellable.id);
  const liked = fav.has(p.id);
  const waited = sellable && waiting.includes(sellable.id);

  const add = () => {
    if (hasV && !variant) { setNeedSize(true); return; }
    const img = media.find((m) => m.kind !== 'video')?.path || p.images[0];
    cart.add({ id: sellable.id, name: [p.name, p.color && !p.name.toLowerCase().includes(p.color.toLowerCase()) ? p.color : null, variant?.size].filter(Boolean).join(' · '), price, images: img ? [img] : [], stock: sellable.stock, url: p.url }, qty);
  };
  const wait = () => auth.require(async () => {
    try {
      if (waited) { await shopApi('/waitlist/' + sellable.id, { method: 'DELETE' }); setWaiting(waiting.filter((x) => x !== sellable.id)); notify('Подписка отменена'); }
      else { await shopApi('/waitlist/' + sellable.id, { method: 'POST' }); setWaiting([...waiting, sellable.id]); notify('Сообщим, когда товар появится'); }
    } catch (e) { notify(e.message, 'error'); }
  });

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Навигация"><Link to="/" className="hover:text-slate-900">Каталог</Link>{p.category && <> / <Link to={`/?category=${p.category.id}`} className="hover:text-slate-900">{p.category.name}</Link></>}</nav>
      <div className="grid gap-8 md:grid-cols-2 lg:gap-14">
        <Gallery media={media} alt={p.name} />
        <div className="md:pt-4">
          {p.brand && <Link to={`/?brands=${encodeURIComponent(p.brand)}`} className="text-sm font-semibold tracking-wide text-slate-500 uppercase hover:text-slate-900">{p.brand}</Link>}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{p.name}</h1>
            <button onClick={() => fav.toggle(p.id)} aria-pressed={liked} aria-label={liked ? 'Убрать из избранного' : 'В избранное'} className={`shrink-0 rounded-full border border-slate-200 p-2.5 ${liked ? 'text-rose-500' : 'text-slate-600 hover:text-slate-900'}`}><Heart size={20} fill={liked ? 'currentColor' : 'none'} /></button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            {p.sku && <span>Артикул: {p.sku}</span>}
            {p.reviews.count > 0 && <a href="#reviews" className="flex items-center gap-1 text-slate-600"><Stars value={p.reviews.avg} size={14} /> {p.reviews.avg} · {p.reviews.count} отзыв.</a>}
          </div>
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-extrabold text-rose-600">{hasV && !variant && p.priceFrom ? 'от ' : ''}{money(price)}</span>
            {oldPrice && <span className="text-lg text-slate-400 line-through">{money(oldPrice)}</span>}
            {oldPrice && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-600">−{Math.round((1 - price / oldPrice) * 100)}%</span>}
          </div>

          {(p.color || p.groupCards.length > 1) && (
            <div className="mt-6">
              <div className="mb-2 text-sm">Цвет: <b>{p.color || '—'}</b></div>
              {p.groupCards.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {p.groupCards.map((g) => (
                    <Link key={g.id} to={g.url} replace title={g.color || ''} aria-current={g.id === p.id ? 'true' : undefined}
                      className={`relative h-[72px] w-14 overflow-hidden rounded-xl bg-slate-100 ${g.id === p.id ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}>
                      {g.image ? <img src={g.image} alt={g.color || ''} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-slate-500">{g.color}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {sizes.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className={needSize && !size ? 'font-semibold text-rose-600' : ''}>{needSize && !size ? 'Выберите размер' : <>Размер{size && <>: <b>{size}</b></>}</>}</span>
                {p.sizeChart && <button onClick={() => setChart(true)} className="flex items-center gap-1 text-slate-600 underline"><Ruler size={15} /> Таблица размеров</button>}
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const v = vOf(s);
                  return (
                    <button key={s} onClick={() => { setSize(s); setNeedSize(false); setQty(1); }} aria-pressed={s === size} title={v?.inStock ? (v.stock <= 3 ? `Осталось ${v.stock} шт.` : 'В наличии') : 'Нет в наличии — можно подписаться'}
                      className={`relative min-w-[3rem] rounded-xl border px-3 py-2.5 text-sm font-medium ${s === size ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 hover:border-slate-900'} ${v?.inStock ? '' : 'text-slate-400'}`}>
                      <span className={`block ${v?.inStock ? '' : 'line-through'}`}>{s}</span>
                      {v?.sizeRu && <span className={`block text-[11px] font-normal ${s === size ? 'text-white/70' : 'text-slate-400'}`}>{v.sizeRu}</span>}
                      {v?.inStock && v.stock <= 2 && <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />}
                    </button>
                  );
                })}
              </div>
              {p.reviews.count >= 3 && <FitHint fit={p.reviews.fit} />}
            </div>
          )}
          {p.modelInfo && <p className="mt-3 text-sm text-slate-500">На фото: {p.modelInfo}</p>}

          {sellable && <div className={`mt-4 text-sm ${sellable.inStock ? 'text-emerald-600' : 'text-rose-600'}`}>{sellable.inStock ? (sellable.stock <= 3 ? `Осталось ${sellable.stock} шт.` : 'В наличии') : 'Нет в наличии'}</div>}

          {(!sellable || sellable.inStock || config.allowBackorder) ? (
            <div className="mt-6 flex gap-3">
              <div className="flex items-center rounded-full border border-slate-300">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-3" aria-label="Меньше"><Minus size={16} /></button>
                <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
                <button onClick={() => setQty(Math.min(sellable && !config.allowBackorder ? sellable.stock : 99, qty + 1))} className="p-3" aria-label="Больше"><Plus size={16} /></button>
              </div>
              <button onClick={add} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-900 py-3.5 font-semibold text-white hover:bg-slate-800">
                <ShoppingBag size={18} /> {hasV && !variant ? 'Выбрать размер' : 'В корзину'}
              </button>
            </div>
          ) : (
            <button onClick={wait} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-semibold ${waited ? 'border border-emerald-600 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
              {waited ? <><BellRing size={18} /> Сообщим о поступлении · отменить</> : <><Bell size={18} /> Сообщить о поступлении</>}
            </button>
          )}
          {inCart && <Link to="/cart" className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><Check size={16} /> В корзине {inCart.quantity} шт. — перейти в корзину</Link>}

          {p.attributes.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-lg font-bold">О товаре</h2>
              <dl className="text-sm">
                {(allAttrs ? p.attributes : p.attributes.slice(0, 6)).map((a) => (
                  <div key={a.name} className="flex items-baseline gap-2 py-1.5">
                    <dt className="shrink-0 text-slate-500">{a.name}</dt>
                    <span className="mb-1 flex-1 border-b border-dotted border-slate-300" aria-hidden="true" />
                    <dd className="max-w-[55%] text-right font-medium">{a.value}</dd>
                  </div>
                ))}
              </dl>
              {p.attributes.length > 6 && <button onClick={() => setAllAttrs(!allAttrs)} className="mt-1 text-sm font-medium text-indigo-600">{allAttrs ? 'Свернуть' : `Все характеристики (${p.attributes.length})`}</button>}
            </section>
          )}
          {p.description && (
            <section className="mt-6">
              <h2 className="mb-2 text-lg font-bold">Описание</h2>
              <p className={`leading-relaxed whitespace-pre-line text-slate-600 ${fullDesc ? '' : 'line-clamp-5'}`}>{p.description}</p>
              {p.description.length > 300 && <button onClick={() => setFullDesc(!fullDesc)} className="mt-1 text-sm font-medium text-indigo-600">{fullDesc ? 'Свернуть' : 'Читать полностью'}</button>}
            </section>
          )}
        </div>
      </div>
      <Shelf title="С этим носят" items={p.look} />
      <Shelf title="С этим покупают" items={p.also} />
      {config.reviews && <Reviews product={p} />}
      <Shelf title="Похожие товары" items={p.related} />
      <RecentlyViewed exclude={p.id} />
      {chart && p.sizeChart && <SizeChart chart={p.sizeChart} onClose={() => setChart(false)} />}
    </div>
  );
}

// «Маломерит / большемерит» по отзывам
function FitHint({ fit }) {
  const total = fit.small + fit.ok + fit.large;
  if (!total) return null;
  const [k, n] = Object.entries(fit).sort((a, b) => b[1] - a[1])[0];
  const text = { small: 'маломерит — возьмите на размер больше', ok: 'соответствует размеру', large: 'большемерит — возьмите на размер меньше' }[k];
  return <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><Star size={14} className="text-amber-500" fill="currentColor" /> По отзывам {Math.round((n / total) * 100)}% покупателей: {text}</p>;
}
