import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, X, Search, Pin, ExternalLink } from 'lucide-react';
import { api, fileUrl } from '../api';
import { Button, Modal, Spinner, useToast } from '../ui';

export const MAX_FEATURED = 20;

/** «Первые в каталоге»: до 20 товаров, которые показываются в начале каталога по порядку (дальше — новые) */
export default function FeaturedEditor({ onClose }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api('/products/featured').then(setList).catch((e) => toast(e.message, 'error')); }, [toast]);
  useEffect(() => {
    if (!q.trim()) { setFound([]); return undefined; }
    const t = setTimeout(() => api('/products?limit=8&q=' + encodeURIComponent(q.trim())).then((d) => setFound(d.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const move = (i, d) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toPos = (i, pos) => setList((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(Math.max(0, Math.min(n.length, pos - 1)), 0, x); return n; });
  const add = (p) => {
    if (list.some((x) => x.id === p.id)) return toast('Уже в списке', 'error');
    if (list.length >= MAX_FEATURED) return toast(`Не больше ${MAX_FEATURED} товаров`, 'error');
    setList([...list, { id: p.id, article: p.article, name: p.name, color: p.color, image: p.images?.[0]?.path, price: p.price, totalStock: p.totalStock }]); setQ('');
  };
  const save = async () => {
    setSaving(true);
    try { await api('/products/featured', { method: 'PUT', body: { ids: list.map((x) => x.id) } }); toast('Порядок сохранён — так товары будут идти в начале каталога'); onClose(); } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} wide title="Первые в каталоге"
      footer={<><a href="/" target="_blank" rel="noreferrer" className="mr-auto"><Button variant="ghost" icon={ExternalLink}>Каталог на сайте</Button></a><Button variant="secondary" onClick={onClose}>Отмена</Button><Button onClick={save} loading={saving} disabled={!list}>Сохранить</Button></>}>
      <p className="mb-4 text-sm text-slate-500">До {MAX_FEATURED} товаров показываются в начале каталога в этом порядке (сортировка «Рекомендуемые»). Остальные идут после них — сначала новые поступления.</p>
      <div className="relative mb-4">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добавить: название или артикул" />
        {found.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {found.map((p) => <button type="button" key={p.id} onClick={() => add(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"><Pin size={14} className="text-slate-400" /><span className="truncate">{p.name}</span><span className="ml-auto shrink-0 font-mono text-xs text-slate-400">{p.article}</span></button>)}
          </div>
        )}
      </div>
      {!list ? <Spinner /> : list.length === 0 ? <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Пока ничего не закреплено — каталог начинается с новых товаров.</p> : (
        <ol className="space-y-1.5">
          {list.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
              <input className="input w-14 py-1 text-center font-semibold" type="number" min="1" max={list.length} value={i + 1} onChange={(e) => toPos(i, Number(e.target.value) || 1)} title="Место в каталоге" />
              <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">{p.image && <img src={fileUrl(p.image)} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-slate-500"><span className="font-mono">{p.article}</span>{p.color ? ` · ${p.color}` : ''}{p.totalStock <= 0 && <span className="text-amber-600"> · нет в наличии</span>}{p.showInShop === false && <span className="text-rose-600"> · скрыт в магазине</span>}</div>
              </div>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" title="Выше"><ArrowUp size={16} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" title="Ниже"><ArrowDown size={16} /></button>
              <button type="button" onClick={() => setList(list.filter((x) => x.id !== p.id))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Убрать"><X size={16} /></button>
            </li>
          ))}
        </ol>
      )}
      {list && <p className="mt-3 text-xs text-slate-400">{list.length} из {MAX_FEATURED}</p>}
    </Modal>
  );
}
