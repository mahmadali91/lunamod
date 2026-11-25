import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useShop } from './store';

const KEY = 'cookie_ok';
export default function CookieNotice() {
  const { config } = useShop();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } });
  if (hidden) return null;
  const ok = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } setHidden(true); };
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl bg-slate-900 p-4 text-sm text-white shadow-2xl sm:flex-row sm:items-center">
      <p className="flex-1 text-slate-200">Сайт сохраняет в браузере корзину и данные входа, учитывает посещения (какие страницы и товары вы смотрели) и использует технические cookie{config?.metrika ? ' и сервис «Яндекс Метрика» для анализа посещаемости' : ''}. Подробнее — в <Link to="/legal/privacy" className="underline">политике конфиденциальности</Link>.</p>
      <button onClick={ok} className="shrink-0 rounded-full bg-white px-5 py-2 font-semibold text-slate-900">Понятно</button>
    </div>
  );
}
