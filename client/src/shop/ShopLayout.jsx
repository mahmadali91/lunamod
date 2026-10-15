import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Heart, User, Search, Menu, X, Phone, MapPin, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useShop } from './store';
import LoginModal from './Login';
import ChatWidget from './ChatWidget';
import CookieNotice from './CookieNotice';
import Socials from './Socials';
import ThemeToggle from '../components/ThemeToggle';
import { useMetrika } from './metrika';

export default function ShopLayout() {
  const { config, cart, fav, auth, toast, setLoginOpen } = useShop();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useMetrika(config?.metrika);

  const search = (e) => { e.preventDefault(); navigate('/' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '')); };
  if (!config) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" /></div>;
  if (config.error || !config.enabled) {
    return <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center"><h1 className="text-3xl font-bold">{config.title || 'Магазин'}</h1><p className="mt-2 text-slate-500">Скоро открытие. Заходите позже!</p></div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Перейти к содержимому</a>
      {config.testMode && <div className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950">Магазин работает в тестовом режиме</div>}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4">
          <button className="-ml-1 shrink-0 p-1 md:hidden" onClick={() => setMenu(true)} aria-label="Меню"><Menu /></button>
          <Link to="/" className="min-w-0 truncate text-lg font-extrabold tracking-tight sm:text-xl">{config.title}</Link>
          <nav className="ml-4 hidden shrink-0 gap-5 text-sm font-medium text-slate-600 lg:flex">
            <NavLink to="/?sort=new" className="hover:text-slate-900">Новинки</NavLink>
            <NavLink to="/?sort=popular" className="hover:text-slate-900">Хиты</NavLink>
            <NavLink to="/?sale=1" className="hover:text-slate-900">Скидки</NavLink>
            <NavLink to="/about" className={({ isActive }) => (isActive ? 'text-slate-900' : 'hover:text-slate-900')}>Доставка и оплата</NavLink>
          </nav>
          <form onSubmit={search} className="relative ml-auto hidden max-w-xs flex-1 sm:block">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товаров" aria-label="Поиск товаров" className="w-full rounded-full bg-slate-100 py-2 pr-4 pl-9 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-slate-900" />
          </form>
          <Socials links={config.socials} size={17} className="hidden shrink-0 md:flex" />
          <div className="ml-auto flex shrink-0 items-center sm:ml-0">
            <ThemeToggle compact />
            <Link to="/favorites" className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Избранное">
              <Heart size={22} />
              {fav.count > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{fav.count}</span>}
            </Link>
            <button onClick={() => (auth.me ? navigate('/account') : setLoginOpen({ then: () => navigate('/account') }))} className="flex items-center gap-2 rounded-full p-2 hover:bg-slate-100" aria-label="Профиль">
              <User size={22} /><span className="hidden text-sm xl:inline">{auth.me ? auth.me.name || 'Профиль' : 'Войти'}</span>
            </button>
            <Link to="/cart" className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Корзина">
              <ShoppingBag size={22} />
              {cart.count > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-bold text-white">{cart.count}</span>}
            </Link>
          </div>
        </div>
        <form onSubmit={search} className="relative px-4 pb-3 sm:hidden">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-7 -translate-y-[60%] text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товаров" className="w-full rounded-full bg-slate-100 py-2.5 pr-4 pl-9 text-sm outline-none" />
        </form>
      </header>

      {menu && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 w-72 bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-5 right-4" onClick={() => setMenu(false)}><X /></button>
            <div className="mb-8 text-xl font-extrabold">{config.title}</div>
            <nav className="flex flex-col gap-4 text-lg">
              <Link to="/">Все товары</Link>
              <Link to="/?sale=1">Скидки</Link><Link to="/about">Доставка и оплата</Link><Link to="/account">Мои заказы</Link><Link to="/cart">Корзина</Link>
            </nav>
            <Socials links={config.socials} size={22} className="-ml-2 mt-8 flex-wrap" />
          </div>
        </div>
      )}

      <main id="main" className="flex-1"><Outlet /></main>

      <footer className="mt-16 border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div><div className="text-lg font-extrabold">{config.title}</div><p className="mt-2 text-sm text-slate-500">{config.tagline}</p><Socials links={config.socials} className="-ml-2 mt-3" /></div>
          <div className="space-y-2 text-sm text-slate-600">
            {config.phone && <a href={`tel:${config.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 hover:text-slate-900"><Phone size={16} />{config.phone}</a>}
            {config.address && <div className="flex items-center gap-2"><MapPin size={16} />{config.address}</div>}
            {config.workHours && <div className="flex items-center gap-2"><Clock size={16} />{config.workHours}</div>}
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <Link to="/about" className="block hover:text-slate-900">Доставка и оплата</Link>
            {config.legal.map((l) => <Link key={l.id} to={`/legal/${l.id}`} className="block hover:text-slate-900">{l.title}</Link>)}
            <Link to="/legal/requisites" className="block hover:text-slate-900">Реквизиты</Link>
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-400">
          {config.socials?.instagram && <p className="mb-2">* Instagram — продукт компании Meta, деятельность которой признана экстремистской и запрещена в Российской Федерации.</p>}
          © {new Date().getFullYear()} {config.title}{config.seller.name ? ` · ${config.seller.name}` : ''}{config.seller.inn ? ` · ИНН ${config.seller.inn}` : ''}{config.seller.ogrn ? ` · ОГРН ${config.seller.ogrn}` : ''}
        </div>
      </footer>

      <LoginModal />
      {config.chat.enabled && <ChatWidget />}
      <CookieNotice />
      {toast && (
        <div className={`fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-emerald-400" />} {toast.text}
        </div>
      )}
    </div>
  );
}
