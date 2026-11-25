import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Receipt, Warehouse, Radio, Users, Tags, Settings, LogOut, Menu, X, ScanBarcode, PackagePlus, HandCoins, FolderTree, BarChart3, ShoppingBag, Globe, MessageCircle, Star, Store, BadgePercent, ChevronDown, BookOpen, CircleHelp,
} from 'lucide-react';
import { api } from './api';
import { SettingsCtx, useToast } from './ui';
import ThemeToggle from './components/ThemeToggle';
import { CameraButton } from './components/CameraScanner';
import { helpFor } from './kb/articles';

// Меню: группы сворачиваются (состояние запоминается), группа с открытой страницей раскрыта всегда
const nav = [
  { items: [
    { to: '/', icon: LayoutDashboard, label: 'Дашборд', end: true },
    { to: '/pos', icon: ShoppingCart, label: 'Новая продажа' },
  ] },
  { group: 'Продажи', items: [
    { to: '/sales', icon: Receipt, label: 'Продажи' },
    { to: '/consignment', icon: HandCoins, label: 'Реализация' },
    { to: '/stats', icon: BarChart3, label: 'Статистика' },
  ] },
  { group: 'Интернет-магазин', items: [
    { to: '/orders', icon: ShoppingBag, label: 'Заказы', badge: 'orders' },
    { to: '/customers', icon: Users, label: 'Клиенты' },
    { to: '/chats', icon: MessageCircle, label: 'Чаты', badge: 'chats' },
    { to: '/reviews', icon: Star, label: 'Отзывы', badge: 'reviews' },
    { to: '/shop-settings', icon: Globe, label: 'Настройки магазина' },
    { to: '/wildberries', icon: Store, label: 'Wildberries' },
  ] },
  { group: 'Товары', items: [
    { to: '/products', icon: Package, label: 'Товары' },
    { to: '/prices', icon: BadgePercent, label: 'Цены и скидки' },
    { to: '/categories', icon: FolderTree, label: 'Категории' },
    { to: '/stock', icon: Boxes, label: 'Остатки' },
    { to: '/receipts', icon: PackagePlus, label: 'Приход товара' },
    { to: '/labels', icon: Tags, label: 'Ценники и этикетки' },
  ] },
  { group: 'Справочники', items: [
    { to: '/warehouses', icon: Warehouse, label: 'Склады' },
    { to: '/channels', icon: Radio, label: 'Каналы продаж' },
    { to: '/counterparties', icon: Users, label: 'Контрагенты' },
    { to: '/settings', icon: Settings, label: 'Настройки' },
    { to: '/help', icon: BookOpen, label: 'База знаний' },
  ] },
];
// по умолчанию раскрыта только «Продажи»; что раскрыто — запоминается
const NAV_KEY = 'nav_open';
const readOpen = () => { try { const v = JSON.parse(localStorage.getItem(NAV_KEY)); return Array.isArray(v) ? v : ['Продажи']; } catch { return ['Продажи']; } };

function GlobalSearch() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const find = async (code) => {
    try {
      const p = await api('/products/lookup/' + encodeURIComponent(code));
      navigate('/products/' + (p.parentId || p.id));
      setQ('');
    } catch {
      toast('Точного совпадения нет — показываю результаты поиска', 'error');
      navigate('/products?q=' + encodeURIComponent(code));
    }
  };
  const submit = (e) => { e.preventDefault(); if (q.trim()) find(q.trim()); };
  return (
    <form onSubmit={submit} className="relative w-full max-w-md">
      <ScanBarcode size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по штрихкоду или артикулу…" className="input rounded-xl border-slate-200 bg-slate-50 pr-11 pl-10 focus:bg-white" />
      <CameraButton onResult={find} className="absolute top-1/2 right-2 -translate-y-1/2" />
    </form>
  );
}

export default function Layout() {
  const [settings, setSettings] = useState({ storeName: '', currency: '' });
  const [mobile, setMobile] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();

  const loadSettings = () => api('/settings').then(setSettings).catch(() => {});
  useEffect(() => { loadSettings(); }, []);
  const [newOrders, setNewOrders] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  useEffect(() => {
    const load = () => {
      api('/orders/count').then((r) => setNewOrders(r.new)).catch(() => {});
      api('/chats/unread').then((r) => setUnreadChats(r.unread)).catch(() => {});
      api('/reviews?count=1').then((r) => setPendingReviews(r.counts?.pending || 0)).catch(() => {});
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const loc = useLocation();
  const [opened, setOpened] = useState(readOpen);
  const toggleGroup = (g) => setOpened((c) => { const next = c.includes(g) ? c.filter((x) => x !== g) : [...c, g]; try { localStorage.setItem(NAV_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const badgeOf = (n) => (n.badge === 'orders' ? newOrders : n.badge === 'chats' ? unreadChats : n.badge === 'reviews' ? pendingReviews : 0);
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login'); };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={() => setMobile(false)} title="На дашборд" className="flex items-center gap-3 px-5 py-5 hover:opacity-80">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"><Boxes size={20} /></div>
        <div className="min-w-0">
          <div className="truncate font-bold text-slate-900">{settings.storeName || 'Склад'}</div>
          <div className="text-xs text-slate-500">Учёт и продажи</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((g, gi) => {
          const active = g.items.some((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));
          const open = !g.group || active || opened.includes(g.group);
          const badges = g.items.reduce((a, n) => a + badgeOf(n), 0);
          return (
            <div key={gi}>
              {g.group && (
                <button type="button" onClick={() => toggleGroup(g.group)} aria-expanded={open} disabled={active}
                  className="flex w-full items-center gap-2 rounded-lg px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase hover:text-slate-600 disabled:cursor-default">
                  {g.group}
                  {!open && badges > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] text-white normal-case">{badges}</span>}
                  {!active && <ChevronDown size={14} className={`ml-auto transition ${open ? '' : '-rotate-90'}`} />}
                </button>
              )}
              {open && g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMobile(false)}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                  <n.icon size={18} /> {n.label}
                  {badgeOf(n) > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white">{badgeOf(n)}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">{(user.name || '?')[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-xs text-slate-500">{user.role === 'admin' ? 'Администратор' : 'Продавец'}</div>
          </div>
          <button onClick={logout} title="Выйти" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><LogOut size={18} /></button>
        </div>
        <div className="flex items-center justify-between px-2 pt-1">
          <span className="text-[11px] text-slate-400" title="Версия программы">v{__APP_VERSION__}</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  return (
    <SettingsCtx.Provider value={{ ...settings, reloadSettings: loadSettings }}>
      <div className="flex h-full">
        <aside className="no-print hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
        {mobile && (
          <div className="no-print fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobile(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
              <button className="absolute top-5 right-3 p-1 text-slate-400" onClick={() => setMobile(false)}><X size={20} /></button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-8">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobile(true)}><Menu size={20} /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              {/* справка по текущему разделу */}
              <Link to={'/help/' + helpFor(loc.pathname)} title="Как это работает — инструкция по этому разделу" className="inline-flex items-center gap-1.5 rounded-lg p-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-600 sm:px-3 sm:py-2">
                <CircleHelp size={18} /> <span className="hidden md:inline">Справка</span>
              </Link>
              <NavLink to="/pos" title="Продать" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 p-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 sm:px-4 sm:py-2">
                <ShoppingCart size={16} /> <span className="hidden sm:inline">Продать</span>
              </NavLink>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-8"><Outlet /></main>
        </div>
      </div>
    </SettingsCtx.Provider>
  );
}
