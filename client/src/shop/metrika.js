import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Счётчик Яндекс Метрики вставляет сервер (только в страницы магазина). Здесь — просмотры
// при переходах внутри сайта (SPA) и события электронной коммерции.
export function useMetrika(m) {
  const loc = useLocation();
  const prev = useRef(null);
  useEffect(() => {
    const url = location.href;
    if (m?.id && prev.current && prev.current !== url && typeof window.ym === 'function') window.ym(m.id, 'hit', url, { referer: prev.current, title: document.title });
    prev.current = url;
  }, [loc.pathname, loc.search, m?.id]);
}

/** Электронная коммерция: action = detail | add | remove | purchase */
export function ecommerce(action, products, extra) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: { currencyCode: 'RUB', [action]: { ...(extra ? { actionField: extra } : {}), products: products.map((p) => ({ id: String(p.id), name: p.name, price: Number(p.price) || 0, category: p.category, quantity: p.quantity })) } } });
  } catch { /* не критично */ }
}
