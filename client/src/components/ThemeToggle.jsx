import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getTheme, setTheme } from '../theme';

const OPTS = [['light', Sun, 'Светлая тема'], ['dark', Moon, 'Тёмная тема'], ['system', Monitor, 'Как в системе']];

/** compact — одна кнопка-переключатель (по кругу); иначе — сегментный переключатель из трёх */
export default function ThemeToggle({ compact, className = '' }) {
  const [t, setT] = useState(getTheme);
  useEffect(() => { const h = (e) => setT(e.detail.theme); window.addEventListener('themechange', h); return () => window.removeEventListener('themechange', h); }, []);
  const pick = (v) => { setTheme(v); setT(v); };
  if (compact) {
    const i = OPTS.findIndex((o) => o[0] === t);
    const [, Icon, label] = OPTS[i];
    const next = OPTS[(i + 1) % OPTS.length];
    return (
      <button type="button" onClick={() => pick(next[0])} title={`${label}. Нажмите: ${next[2].toLowerCase()}`} aria-label={`Тема: ${label}`} className={`rounded-full p-2 hover:bg-slate-100 ${className}`}>
        <Icon size={20} />
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Тема оформления" className={`inline-flex rounded-lg bg-slate-100 p-0.5 ${className}`}>
      {OPTS.map(([v, Icon, label]) => (
        <button key={v} type="button" role="radio" aria-checked={t === v} title={label} aria-label={label} onClick={() => pick(v)}
          className={`flex flex-1 items-center justify-center rounded-md px-2.5 py-1.5 ${t === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
