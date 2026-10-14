import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Package, Tags, Pencil, Archive } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, Button, Empty, PageHeader, RefSelect, Spinner, Thumb, fmtNum, useLoad, useMoney } from '../ui';

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [categoryId, setCategoryId] = useState(null);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const navigate = useNavigate();
  const money = useMoney();

  useEffect(() => { setQ(params.get('q') || ''); }, [params]);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);

  const { data, loading } = useLoad('/products' + qs({ q: debounced, categoryId, page, limit: 50, archived }));

  const onKeyDown = async (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    try { const p = await api('/products/lookup/' + encodeURIComponent(q.trim())); navigate('/products/' + p.id); } catch { /* остаёмся на списке */ }
  };

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const items = data?.items || [];
  const allChecked = items.length > 0 && items.every((p) => selected.includes(p.id));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Товары" subtitle={data ? `Всего: ${data.total}` : ''}>
        {selected.length > 0 && (
          <Button variant="secondary" icon={Tags} onClick={() => navigate('/labels?ids=' + selected.join(','))}>Печать этикеток ({selected.length})</Button>
        )}
        <Button icon={Plus} onClick={() => navigate('/products/new')}>Добавить товар</Button>
      </PageHeader>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Название, артикул или штрихкод (Enter — открыть)" value={q}
              onChange={(e) => { setQ(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }); }} onKeyDown={onKeyDown} autoFocus />
          </div>
          <RefSelect path="/categories" value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} placeholder="Все категории" className="w-48" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Архив</label>
        </div>

        {!data ? <Spinner /> : items.length === 0 ? (
          <Empty icon={Package} title="Товары не найдены" text="Добавьте первый товар или измените условия поиска">
            <Button icon={Plus} onClick={() => navigate('/products/new')}>Добавить товар</Button>
          </Empty>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th w-10"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : items.map((p) => p.id))} /></th>
                  <th className="th">Товар</th>
                  <th className="th">Артикул</th>
                  <th className="th">Штрихкод</th>
                  <th className="th text-right">Цена</th>
                  <th className="th text-right">Остаток</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="td"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} /></td>
                    <td className="td">
                      <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                        <Thumb src={p.images[0]?.path} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 hover:text-indigo-600">{p.name}</div>
                          {p.category && <div className="text-xs text-slate-500">{p.category.name}</div>}
                        </div>
                      </Link>
                    </td>
                    <td className="td font-mono text-xs text-slate-600">{p.sku || '—'}</td>
                    <td className="td font-mono text-xs text-slate-600">{p.barcodes[0]?.code}</td>
                    <td className="td text-right font-semibold">{money(p.price)}</td>
                    <td className="td text-right">
                      <Badge color={p.totalStock <= 0 ? 'red' : p.totalStock <= p.minStock ? 'amber' : 'green'}>{fmtNum(p.totalStock)} {p.unit}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <Link to={`/labels?ids=${p.id}`} title="Этикетка" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Tags size={16} /></Link>
                        <Link to={`/products/${p.id}`} title="Изменить" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm text-slate-500">
            <span>Стр. {page} из {Math.ceil(data.total / data.limit)}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</Button>
              <Button size="sm" variant="secondary" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Вперёд</Button>
            </div>
          </div>
        )}
      </div>
      {archived && <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Archive size={12} /> Показаны архивные товары (удалённые, по которым были документы)</p>}
    </div>
  );
}
