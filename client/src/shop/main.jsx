import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import '../index.css';
import { applyTheme } from '../theme';
import { ShopProvider } from './store';
import ShopLayout from './ShopLayout';
import Catalog from './pages/Catalog';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Account from './pages/Account';
import Order from './pages/Order';
import About from './pages/About';
import Legal from './pages/Legal';
import Favorites from './pages/Favorites';


// Учёт посещений: только после согласия в cookie-баннере; без персональных данных вовне
function trackerKey() {
  try {
    let k = localStorage.getItem('visitor_key');
    if (!k) { k = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('visitor_key', k); }
    return k;
  } catch { return null; }
}
function ShopTracker() {
  const loc = useLocation();
  const sid = useRef(0);
  const api = (path, body, keepalive) => fetch('/api/shop' + path, {
    method: 'POST', keepalive: Boolean(keepalive),
    headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('shop_token') ? { Authorization: 'Bearer ' + localStorage.getItem('shop_token') } : {}) },
    body: JSON.stringify(body),
  }).catch(() => {});
  useEffect(() => {
    let consent = false;
    try { consent = localStorage.getItem('cookie_ok') === '1'; } catch { /* приватный режим */ }
    if (!consent) return undefined;
    const key = trackerKey();
    if (!key) return undefined;
    const send = (events) => api('/track', { visitorKey: key, sessionId: sid.current || undefined, events }, true)
      .then((r) => r && r.json && r.json()).then((d) => { if (d?.sessionId) sid.current = d.sessionId; }).catch(() => {});
    const product = loc.pathname.match(/^\/product\/(\d+)/);
    send([{ type: 'page', path: loc.pathname + loc.search }, ...(product ? [{ type: 'product', path: loc.pathname, productId: Number(product[1]) }] : [])]);
    return undefined;
  }, [loc.pathname, loc.search]);
  useEffect(() => {
    let consent = false;
    try { consent = localStorage.getItem('cookie_ok') === '1'; } catch { /* ignore */ }
    if (!consent) return undefined;
    let last = Date.now();
    const beat = () => {
      if (document.visibilityState !== 'visible' || !sid.current) { last = Date.now(); return; }
      const seconds = Math.min(60, Math.round((Date.now() - last) / 1000));
      last = Date.now();
      if (seconds >= 5) api('/track/beat', { sessionId: sid.current, seconds }, true);
    };
    const t = setInterval(beat, 30000);
    const onHide = () => beat();
    window.addEventListener('pagehide', onHide);
    return () => { clearInterval(t); window.removeEventListener('pagehide', onHide); beat(); };
  }, []);
  return null;
}

// Старые адреса программы учёта (до переноса на /admin) — перенаправляем
const ADMIN_PATHS = ['login', 'pos', 'sales', 'orders', 'consignment', 'stats', 'products', 'categories', 'stock', 'receipts', 'labels', 'warehouses', 'channels', 'counterparties', 'settings', 'shop-settings'];
function NotFound() {
  const loc = useLocation();
  const first = loc.pathname.split('/')[1];
  if (ADMIN_PATHS.includes(first)) { window.location.replace('/admin' + loc.pathname + loc.search); return null; }
  return <Navigate to="/" replace />;
}

document.body.classList.add('bg-white');
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShopProvider>
      <BrowserRouter>
        <ShopTracker />
        <Routes>
          <Route element={<ShopLayout />}>
            <Route index element={<Catalog />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="product/:id" element={<Product />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="account" element={<Account />} />
            <Route path="order/:id" element={<Order />} />
            <Route path="about" element={<About />} />
            <Route path="legal/:doc" element={<Legal />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ShopProvider>
  </React.StrictMode>
);

applyTheme();
// PWA: офлайн-страница и установка на телефон (service worker также принимает пуш-уведомления)
if ('serviceWorker' in navigator && location.protocol === 'https:') window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
