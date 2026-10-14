import { useEffect, useRef, useState } from 'react';
import { ScanBarcode, Search } from 'lucide-react';
import { api, qs } from '../api';
import { Thumb, useMoney, useToast, fmtNum } from '../ui';

/**
 * Поле поиска товара: ввод названия/артикула/штрихкода.
 * Сканер штрихкода печатает код и Enter → товар добавляется сразу.
 */
export default function ProductPicker({ onPick, autoFocus, placeholder = 'Сканируйте штрихкод или введите название / артикул…', warehouseId }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const money = useMoney();
  const toast = useToast();

  useEffect(() => {
    if (!q.trim()) { setList([]); return; }
    const t = setTimeout(() => {
      api('/products' + qs({ q: q.trim(), limit: 10, warehouseId })).then((d) => { setList(d.items); setActive(0); setOpen(true); }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, warehouseId]);

  const pick = (p) => { onPick(p); setQ(''); setList([]); setOpen(false); ref.current?.focus(); };

  const onKey = async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = q.trim();
      if (!code) return;
      try { pick(await api('/products/lookup/' + encodeURIComponent(code))); }
      catch {
        if (open && list[active]) pick(list[active]);
        else toast(`Товар «${code}» не найден`, 'error');
      }
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <ScanBarcode size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input ref={ref} autoFocus={autoFocus} className="input py-2.5 pl-10" placeholder={placeholder} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => list.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {list.length === 0 && <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500"><Search size={16} /> Ничего не найдено</div>}
          {list.map((p, i) => (
            <button type="button" key={p.id} onMouseDown={() => pick(p)} onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-indigo-50' : ''}`}>
              <Thumb src={p.images?.[0]?.path} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{p.sku || '—'} · {p.barcodes?.[0]?.code}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{money(p.price)}</div>
                <div className={`text-xs ${p.totalStock > 0 ? 'text-slate-500' : 'text-rose-500'}`}>ост. {fmtNum(p.totalStock)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
