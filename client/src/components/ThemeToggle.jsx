import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { isDark, setTheme } from '../theme';

/** Переключатель «день / ночь». compact — круглая кнопка-иконка; иначе — два варианта рядом */
export default function ThemeToggle({ compact, className = '' }) {
  const [dark, setDark] = useState(isDark);
  useEffect(() => { const h = (e) => setDark(e.detail.dark); window.addEventListener('themechange', h); return () => window.removeEventListener('themechange', h); }, []);
  if (compact) {
    return (
      <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} title={dark ? 'Включить дневной режим' : 'Включить ночной режим'} aria-label={dark ? 'Дневной режим' : 'Ночной режим'} className={`rounded-full p-2 hover:bg-slate-100 ${className}`}>
        {dark ? <Sun size={21} /> : <Moon size={21} />}
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Режим оформления" className={`inline-flex rounded-lg bg-slate-100 p-0.5 ${className}`}>
      {[[false, Sun, 'Дневной'], [true, Moon, 'Ночной']].map(([v, Icon, label]) => (
        <button key={label} type="button" role="radio" aria-checked={dark === v} title={label} onClick={() => setTheme(v ? 'dark' : 'light')}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${dark === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
