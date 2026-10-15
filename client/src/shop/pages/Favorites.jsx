import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { shopApi } from '../api';
import { useShop } from '../store';
import ProductCard from '../ProductCard';

export default function Favorites() {
  const { fav, auth, setLoginOpen } = useShop();
  const [items, setItems] = useState(null);
  const key = fav.ids.join(',');
  useEffect(() => {
    document.title = 'Избранное';
    if (!fav.ids.length) { setItems([]); return; }
    // порядок — как добавляли (последние сверху); показываем и то, чего нет в наличии
    shopApi('/products?limit=60&ids=' + key).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Избранное</h1>
      {!auth.me && fav.count > 0 && <p className="mb-6 text-sm text-slate-500">Сохранено в этом браузере. <button onClick={() => setLoginOpen({ then: () => {} })} className="underline">Войдите</button>, чтобы избранное было доступно на любом устройстве.</p>}
      {items === null ? <div className="py-20 text-center text-slate-400">Загрузка…</div> : items.length === 0 ? (
        <div className="py-20 text-center">
          <Heart size={48} className="mx-auto text-slate-300" />
          <div className="mt-4 text-lg font-semibold">В избранном пока пусто</div>
          <p className="mt-1 text-slate-500">Нажимайте ♡ на товарах, чтобы вернуться к ним позже</p>
          <Link to="/" className="mt-6 inline-block rounded-full bg-slate-900 px-6 py-3 font-semibold text-white">В каталог</Link>
        </div>
      ) : <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </div>
  );
}
