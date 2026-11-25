import { useEffect, useState } from 'react';
import { shopApi } from './api';
import ProductCard from './ProductCard';

const KEY = 'shop_viewed';
export function rememberViewed(id) {
  try { const list = JSON.parse(localStorage.getItem(KEY) || '[]').filter((x) => x !== id); localStorage.setItem(KEY, JSON.stringify([id, ...list].slice(0, 20))); } catch { /* приватный режим */ }
}
const readViewed = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(Number.isInteger) : []; } catch { return []; } };

/** «Вы недавно смотрели» — из истории просмотров в этом браузере */
export default function RecentlyViewed({ exclude }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const ids = readViewed().filter((x) => x !== exclude).slice(0, 12);
    if (!ids.length) { setItems([]); return; }
    shopApi('/products?limit=12&ids=' + ids.join(',')).then((r) => setItems(r.items)).catch(() => {});
  }, [exclude]);
  if (!items.length) return null;
  return (
    <section className="mt-16">
      <h2 className="mb-6 text-2xl font-bold">Вы недавно смотрели</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">{items.map((p) => <div key={p.id} className="w-40 shrink-0 snap-start sm:w-48"><ProductCard p={p} /></div>)}</div>
    </section>
  );
}
