import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Minus, Plus, Loader2, Bell } from 'lucide-react';
import { shopApi } from './api';
import { useShop } from './store';

/** Быстрая покупка из каталога «как на WB»: размерный ряд, сколько уже в корзине, количество, «Перейти в корзину» */
export default function QuickBuy({ card, onClose }) {
  const { cart, money, config, auth, notify } = useShop();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [sel, setSel] = useState(null);
  const [chart, setChart] = useState(false);
  useEffect(() => { shopApi('/products/' + card.id).then(setP).catch((e) => { notify(e.message, 'error'); onClose(); }); }, [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const itemOf = (v) => ({ id: v.id, cardId: p.id, name: [p.name, p.color && !p.name.toLowerCase().includes(p.color.toLowerCase()) ? p.color : null, v.size].filter(Boolean).join(' · '), price: v.price, images: p.images.slice(0, 1), stock: v.stock, url: p.url });
  const pick = (v) => {
    setSel(v.id);
    if (!v.inStock && !config.allowBackorder) return;
    if (!cart.qty(v.id)) cart.add(itemOf(v), 1);
  };
  const v = p?.variants.find((x) => x.id === sel);
  const q = v ? cart.qty(v.id) : 0;
  const max = v ? (config.allowBackorder ? 99 : v.stock) : 0;
  const wait = async () => auth.require(async () => { try { await shopApi('/waitlist/' + v.id, { method: 'POST' }); notify('Сообщим, когда размер появится'); } catch (e) { notify(e.message, 'error'); } });

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-label="Выберите размер" className="relative w-full max-w-lg rounded-t-2xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 rounded-full p-1.5 sm:top-4 sm:right-4 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Закрыть"><X size={20} /></button>
        <h2 className="pr-8 text-lg font-bold sm:text-2xl">Выберите размер</h2>
        {!p ? <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div> : (
          <>
            <div className="truncate text-xs text-slate-500 sm:mt-1 sm:text-sm">{p.name}{p.color && !p.name.toLowerCase().includes(p.color.toLowerCase()) ? ` · ${p.color}` : ''}</div>
            {p.sizeChart && <button onClick={() => setChart(!chart)} className="mt-2 border-b border-dashed text-xs sm:mt-3 sm:text-sm border-slate-400 text-sm text-slate-500">Таблица размеров</button>}
            {chart && p.sizeChart && (
              <div className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-50 p-2 text-xs">
                <table><thead><tr>{p.sizeChart.head.map((h, i) => <th key={i} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
                  <tbody>{p.sizeChart.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
              </div>
            )}
            <div className="mt-3 flex max-h-[40vh] flex-wrap gap-2 overflow-y-auto pt-2 pr-2 sm:mt-4 sm:gap-2.5">
              {p.variants.map((x) => {
                const n = cart.qty(x.id);
                return (
                  <button key={x.id} onClick={() => pick(x)} aria-pressed={sel === x.id} title={x.inStock ? `${money(x.price)}${x.stock <= 3 ? ` · осталось ${x.stock}` : ''}` : 'Нет в наличии'}
                    className={`relative min-w-[3.25rem] rounded-xl border-2 px-2.5 py-1 text-center sm:min-w-[4.5rem] sm:rounded-2xl sm:px-3 sm:py-2 transition ${sel === x.id ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'} ${x.inStock ? '' : 'text-slate-400'}`}>
                    <span className={`block text-base leading-tight sm:text-lg ${x.inStock ? '' : 'line-through'}`}>{x.size || 'Единый'}</span>
                    {x.sizeRu && <span className="block text-[10px] text-slate-400 sm:text-xs">{x.sizeRu}</span>}
                    {n > 0 && <span className="absolute -top-2 -right-2 flex h-5 min-w-5 sm:h-6 sm:min-w-6 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900">{n}</span>}
                  </button>
                );
              })}
            </div>
            {v && !v.inStock && !config.allowBackorder ? (
              <button onClick={wait} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-base font-semibold sm:mt-6 sm:py-4 sm:text-lg text-white"><Bell size={20} /> Сообщить о поступлении</button>
            ) : (
              <div className="mt-4 flex gap-2 sm:mt-6 sm:gap-3">
                <button onClick={() => (cart.countOf(p.id) ? navigate('/cart') : v ? pick(v) : notify('Выберите размер', 'error'))} className="flex-1 rounded-full bg-slate-900 py-3 text-base font-semibold whitespace-nowrap sm:py-4 sm:text-lg text-white hover:bg-slate-700">
                  {cart.countOf(p.id) ? 'Перейти в корзину' : 'Добавить в корзину'}
                </button>
                <div className={`flex items-center rounded-full bg-slate-100 px-2 ${q ? '' : 'opacity-40'}`}>
                  <button disabled={!q} onClick={() => (q <= 1 ? cart.remove(v.id) : cart.set(v.id, q - 1))} className="p-2 text-slate-900 sm:p-3" aria-label="Меньше"><Minus size={18} /></button>
                  <span className="w-6 text-center text-base font-semibold sm:w-8 sm:text-lg text-slate-900" aria-live="polite">{q}</span>
                  <button disabled={!q || q >= max} onClick={() => cart.set(v.id, q + 1)} className="p-2 text-slate-900 disabled:opacity-40 sm:p-3" aria-label="Больше"><Plus size={18} /></button>
                </div>
              </div>
            )}
            {v && <div className="mt-2 text-center text-xs text-slate-500 sm:mt-3 sm:text-sm">{money(v.price)}{v.oldPrice ? <span className="ml-2 line-through">{money(v.oldPrice)}</span> : null}{v.inStock && v.stock <= 3 ? ` · осталось ${v.stock} шт.` : ''}</div>}
          </>
        )}
      </div>
    </div>
  );
}
