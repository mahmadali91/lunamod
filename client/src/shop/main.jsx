import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import '../index.css';
import { ShopProvider } from './store';
import ShopLayout from './ShopLayout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Account from './pages/Account';
import Order from './pages/Order';
import About from './pages/About';

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
        <Routes>
          <Route element={<ShopLayout />}>
            <Route index element={<Home />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="product/:id" element={<Product />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="account" element={<Account />} />
            <Route path="order/:id" element={<Order />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ShopProvider>
  </React.StrictMode>
);
