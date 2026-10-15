import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { shopApi, shopToken } from './api';

const Ctx = createContext(null);
export const useShop = () => useContext(Ctx);
const CART = 'shop_cart';
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch { return []; } };

export function ShopProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [cart, setCart] = useState(readCart);
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null);
  const [loginOpen, setLoginOpen] = useState(null); // { then: fn } — что сделать после входа

  useEffect(() => { shopApi('/config').then((c) => { setConfig(c); document.title = c.title; }).catch(() => setConfig({ error: true })); }, []);
  useEffect(() => { if (shopToken.get()) shopApi('/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem(CART, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);

  const notify = useCallback((text, type = 'ok') => { setToast({ text, type, id: Math.random() }); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const money = useCallback((v) => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ' + (config?.currency || '₽'), [config]);

  const cartApi = useMemo(() => ({
    items: cart,
    count: cart.reduce((a, i) => a + i.quantity, 0),
    total: cart.reduce((a, i) => a + i.quantity * i.price, 0),
    add(p, q = 1) {
      setCart((c) => {
        const ex = c.find((i) => i.id === p.id);
        const max = config?.allowBackorder ? 999 : p.stock;
        const next = Math.min((ex?.quantity || 0) + q, max);
        if (next <= (ex?.quantity || 0)) { notify(`Больше нет в наличии: доступно ${p.stock} шт.`, 'error'); return c; }
        notify('Добавлено в корзину');
        return ex ? c.map((i) => (i.id === p.id ? { ...i, quantity: next } : i)) : [...c, { id: p.id, name: p.name, price: p.price, image: p.images?.[0], stock: p.stock, quantity: next }];
      });
    },
    set(id, q) { setCart((c) => c.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.min(q, config?.allowBackorder ? 999 : i.stock || 999)) } : i))); },
    remove(id) { setCart((c) => c.filter((i) => i.id !== id)); },
    clear() { setCart([]); },
  }), [cart, config, notify]);

  const auth = {
    me,
    login: (token, customer) => { shopToken.set(token); setMe(customer); },
    logout: () => { shopToken.set(null); setMe(null); },
    require: (then) => (me ? then() : setLoginOpen({ then })),
    refresh: () => shopApi('/me').then(setMe),
  };

  return <Ctx.Provider value={{ config, money, cart: cartApi, auth, notify, toast, loginOpen, setLoginOpen }}>{children}</Ctx.Provider>;
}
