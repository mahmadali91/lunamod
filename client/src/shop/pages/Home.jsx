import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck, CreditCard, RotateCcw } from 'lucide-react';
import { shopApi } from '../api';
import { useShop } from '../store';
import ProductCard from '../ProductCard';

function Row({ title, link, items }) {
  if (!items?.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <div className="mb-5 flex items-end justify-between"><h2 className="text-2xl font-bold tracking-tight">{title}</h2><Link to={link} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">Все <ArrowRight size={16} /></Link></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  );
}

export default function Home() {
  const { config } = useShop();
  const [cats, setCats] = useState([]);
  const [popular, setPopular] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [sale, setSale] = useState([]);
  useEffect(() => {
    shopApi('/categories').then(setCats);
    shopApi('/products?sort=popular&limit=8').then((r) => setPopular(r.items));
    shopApi('/products?sort=new&limit=4').then((r) => setFresh(r.items));
    shopApi('/products?sale=1&limit=4').then((r) => setSale(r.items));
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-white sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="relative max-w-xl">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{config.title}</h1>
            <p className="mt-4 text-lg text-slate-300">{config.tagline}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalog" className="rounded-full bg-white px-6 py-3 font-semibold text-slate-900 hover:bg-slate-100">Перейти в каталог</Link>
              {sale.length > 0 && <Link to="/catalog?sale=1" className="rounded-full border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">Скидки</Link>}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 pt-6 sm:grid-cols-3">
        {[[Truck, config.delivery.courier ? 'Доставка курьером' : 'Самовывоз', config.delivery.courier && config.delivery.courierFreeFrom ? `бесплатно от ${config.delivery.courierFreeFrom.toLocaleString('ru-RU')} ${config.currency}` : config.delivery.pickupAddress || 'в удобное время'],
          [CreditCard, 'Удобная оплата', [config.payments.tbank && 'онлайн картой или СБП', config.payments.cash && 'при получении'].filter(Boolean).join(' или ')],
          [RotateCcw, 'Вход по номеру телефона', 'без паролей — код в SMS']].map(([Icon, t, s]) => (
          <div key={t} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-5"><Icon className="shrink-0" /><div><div className="font-semibold">{t}</div><div className="text-sm text-slate-500">{s}</div></div></div>
        ))}
      </section>

      {cats.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-14">
          <h2 className="mb-5 text-2xl font-bold tracking-tight">Категории</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cats.map((c) => (
              <Link key={c.id} to={`/catalog?category=${c.id}`} className="group relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
                {c.image && <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
                  <div className="text-sm leading-tight font-semibold">{c.name}</div><div className="text-xs text-white/70">{c.count} товаров</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Row title="Хиты продаж" link="/catalog?sort=popular" items={popular} />
      <Row title="Скидки" link="/catalog?sale=1" items={sale} />
      <Row title="Новинки" link="/catalog?sort=new" items={fresh} />
    </div>
  );
}
