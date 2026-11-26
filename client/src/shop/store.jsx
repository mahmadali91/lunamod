import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { shopApi, shopToken } from './api';
import { ecommerce } from './metrika';

const Ctx = createContext(null);
export const useShop = () => useContext(Ctx);
const CART = 'shop_cart';
const PAY_WAIT = 'shop_pay_wait'; // заказ, который ждёт онлайн-оплаты: после оплаты очищаем корзину
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch { return []; } };
const FAV = 'shop_fav';
const readFav = () => { try { const v = JSON.parse(localStorage.getItem(FAV) || '[]'); return Array.isArray(v) ? v.filter(Number.isInteger) : []; } catch { return []; } };

export function ShopProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [cart, setCart] = useState(readCart);
  const [favIds, setFavIds] = useState(readFav);
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null);
  const [loginOpen, setLoginOpen] = useState(null); // { then: fn } — что сделать после входа

  useEffect(() => { shopApi('/config').then((c) => { setConfig(c); document.title = c.title; }).catch(() => setConfig({ error: true })); }, []);
  useEffect(() => { if (shopToken.get()) shopApi('/me').then(setMe).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem(CART, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);
  // оплатил у банка, но на сайт не вернулся: при следующем заходе проверяем заказ и очищаем корзину
  useEffect(() => {
    if (!me) return;
    let w = null; try { w = JSON.parse(localStorage.getItem(PAY_WAIT) || 'null'); } catch { /* ignore */ }
    if (!w?.orderId) return;
    shopApi('/orders/' + w.orderId).then((o) => {
      if (o.paymentStatus === 'paid') { setCart([]); localStorage.removeItem(PAY_WAIT); }
      else if (o.status === 'cancelled' || Date.now() - w.at > 7 * 864e5) localStorage.removeItem(PAY_WAIT);
    }).catch(() => {});
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // корзина вошедшего покупателя сохраняется на сервере — чтобы напомнить, если он не оформил заказ
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => shopApi('/cart', { method: 'POST', body: { items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })) } }).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [cart, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(FAV, JSON.stringify(favIds)); } catch { /* ignore */ } }, [favIds]);
  // избранное вошедшего покупателя хранится в аккаунте: при входе объединяем с тем, что было в браузере
  useEffect(() => {
    if (!me) return;
    shopApi('/favorites/sync', { method: 'POST', body: { ids: readFav() } }).then((r) => setFavIds(r.ids)).catch(() => {});
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // у гостя избранное только в браузере: при загрузке убираем товары, которых больше нет на сайте
  useEffect(() => {
    const ids = readFav();
    if (shopToken.get() || !ids.length || ids.length > 60) return; // вошедшему — сверка через аккаунт
    shopApi('/products?limit=60&ids=' + ids.join(',')).then((r) => {
      const alive = new Set(r.items.map((p) => p.id));
      setFavIds((f) => (f.some((x) => !alive.has(x)) ? f.filter((x) => alive.has(x)) : f));
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        ecommerce('add', [{ id: p.id, name: p.name, price: p.price, quantity: next - (ex?.quantity || 0) }]);
        return ex ? c.map((i) => (i.id === p.id ? { ...i, quantity: next } : i)) : [...c, { id: p.id, cardId: p.cardId ?? p.id, name: p.name, price: p.price, image: p.images?.[0], stock: p.stock, url: p.url, quantity: next }];
      });
    },
    set(id, q) { setCart((c) => c.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, Math.min(q, config?.allowBackorder ? 999 : i.stock || 999)) } : i))); },
    remove(id) { setCart((c) => c.filter((i) => i.id !== id)); },
    qty: (id) => cart.find((i) => i.id === id)?.quantity || 0,
    // сколько штук этой карточки (всех размеров) уже в корзине — для значка на кнопке «Купить»
    countOf: (cardId) => cart.filter((i) => (i.cardId ?? Number(String(i.url || '').match(/^\/product\/(\d+)/)?.[1] ?? i.id)) === cardId).reduce((a, i) => a + i.quantity, 0),
    clear() { setCart([]); try { localStorage.removeItem(PAY_WAIT); } catch { /* ignore */ } },
    // онлайн-оплата: корзину не очищаем, пока заказ не оплачен (покупатель может уйти со страницы банка)
    waitPayment(orderId) { try { localStorage.setItem(PAY_WAIT, JSON.stringify({ orderId, at: Date.now() })); } catch { /* ignore */ } },
    paymentDone(orderId, paid) {
      let w = null; try { w = JSON.parse(localStorage.getItem(PAY_WAIT) || 'null'); } catch { /* ignore */ }
      if (!w || String(w.orderId) !== String(orderId)) return;
      if (paid) setCart([]);
      try { localStorage.removeItem(PAY_WAIT); } catch { /* ignore */ }
    },
    // сверка с сервером: убрать то, что больше не продаётся, обновить цены и доступное количество
    async check() {
      if (!cart.length) return;
      const r = await shopApi('/cart/check', { method: 'POST', body: { items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })) } }).catch(() => null);
      if (!r) return;
      const removed = [];
      setCart((c) => c.flatMap((i) => {
        const x = r.items.find((y) => y.productId === i.id);
        if (!x) return [i];
        if (!x.ok || x.quantity <= 0) { removed.push(i.name); return []; }
        return [{ ...i, price: x.price, stock: x.stock, quantity: x.quantity, image: x.image || i.image }];
      }));
      if (removed.length) notify(`Убрали из корзины — больше нет в продаже: ${removed.slice(0, 3).join(', ')}${removed.length > 3 ? ` и ещё ${removed.length - 3}` : ''}`, 'error');
    },
  }), [cart, config, notify]);

  const fav = {
    ids: favIds,
    // оставить только товары, которые сайт реально показал (остальные сняты с продажи)
    keep(alive) { const set = new Set(alive); setFavIds((f) => (f.some((x) => !set.has(x)) ? f.filter((x) => set.has(x)) : f)); },
    count: favIds.length,
    has: (id) => favIds.includes(id),
    toggle(id) {
      const on = !favIds.includes(id);
      setFavIds((f) => (on ? [id, ...f.filter((x) => x !== id)] : f.filter((x) => x !== id)));
      notify(on ? 'Добавлено в избранное' : 'Удалено из избранного');
      if (me) shopApi('/favorites/' + id, { method: on ? 'POST' : 'DELETE' }).catch(() => {});
    },
  };

  const auth = {
    me,
    login: (token, customer) => { shopToken.set(token); setMe(customer); },
    logout: () => { shopToken.set(null); setMe(null); },
    require: (then) => (me ? then() : setLoginOpen({ then })),
    refresh: () => shopApi('/me').then(setMe),
  };

  return <Ctx.Provider value={{ config, money, cart: cartApi, fav, auth, notify, toast, loginOpen, setLoginOpen }}>{children}</Ctx.Provider>;
}
