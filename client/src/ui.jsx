import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, ImageOff, Eye, EyeOff } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { api, fileUrl } from './api';

/* ---------- Настройки (магазин, валюта) ---------- */
export const SettingsCtx = createContext({ storeName: '', currency: '' });
export const useSettings = () => useContext(SettingsCtx);

export function useMoney() {
  const { currency } = useSettings();
  return useCallback((v) => fmtNum(v, 2) + (currency ? ' ' + currency : ''), [currency]);
}
export const fmtNum = (v, max = 3) => Number(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: max });
export const fmtDate = (d, time = true) => new Date(d).toLocaleString('ru-RU', time ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });

/* ---------- Загрузка данных ---------- */
export function useLoad(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(reload, [reload]);
  return { data, loading, error, reload, setData };
}

/* ---------- Уведомления ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, type = 'success') => {
    const id = Math.random();
    setItems((s) => [...s, { id, text, type }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed right-4 bottom-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.type === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}>
            {t.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-emerald-400" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Базовые элементы ---------- */
const btnStyles = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};
export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className = '', ...p }) {
  const sz = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm';
  return (
    <button {...p} disabled={p.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${btnStyles[variant]} ${className}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}>{label && <span className="label">{label}</span>}{children}</label>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Badge({ color = 'slate', children }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', red: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20', indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20', blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  }[color];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-slate-200 ${c}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-2 backdrop-blur-sm sm:p-4 sm:pt-16" onMouseDown={onClose}>
      <div className={`card w-full min-w-0 ${wide ? 'max-w-4xl' : 'max-w-lg'} shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="min-w-0 px-4 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && <div className="mb-3 rounded-2xl bg-slate-100 p-4 text-slate-400"><Icon size={28} /></div>}
      <div className="font-semibold text-slate-700">{title}</div>
      {text && <div className="mt-1 max-w-sm text-sm text-slate-500">{text}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={28} /></div>;
}

/** Поле пароля/ключа со значком «глаз»: нажатие показывает или скрывает введённое */
export function PasswordInput({ className = 'input', wrapClassName = '', ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapClassName}`}>
      <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-10`} />
      <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)} onMouseDown={(e) => e.preventDefault()}
        aria-label={show ? 'Скрыть' : 'Показать'} title={show ? 'Скрыть' : 'Показать'}
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function Thumb({ src, size = 40, className = '' }) {
  // видео или недоступный файл — заглушка вместо «битой» картинки
  const [bad, setBad] = useState(null);
  const ok = src && bad !== src && !/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(src);
  return ok ? (
    <img src={fileUrl(src)} alt="" loading="lazy" onError={() => setBad(src)} style={{ width: size, height: size }} className={`shrink-0 rounded-lg border border-slate-200 object-cover ${className}`} />
  ) : (
    <div style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 ${className}`}><ImageOff size={size / 2.4} /></div>
  );
}

/* ---------- Штрихкод (SVG) ---------- */
export function BarcodeSvg({ value, height = 40, width = 1.6, fontSize = 12, displayValue = true, margin = 0, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    const isEan = /^\d{13}$/.test(value);
    try {
      JsBarcode(ref.current, value, { format: isEan ? 'EAN13' : 'CODE128', height, width, fontSize, displayValue, margin, flat: !isEan, textMargin: 1 });
    } catch {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, displayValue, margin, textMargin: 1 });
    }
  }, [value, height, width, fontSize, displayValue, margin]);
  return <svg ref={ref} className={className} />;
}

/* ---------- Выбор из справочника ---------- */
export function RefSelect({ path, value, onChange, placeholder = '— не выбрано —', filter, className = '' }) {
  const { data } = useLoad(path);
  const list = (data || []).filter(filter || (() => true));
  return (
    <select className={`input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
}
