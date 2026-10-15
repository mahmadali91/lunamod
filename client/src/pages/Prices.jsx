import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Save, Percent, ChevronRight, ChevronDown, Undo2, BadgePercent } from 'lucide-react';
import { api, qs } from '../api';
import { Button, PageHeader, RefSelect, Spinner, Thumb, fmtNum, useMoney, useToast } from '../ui';

const r2 = (v) => Math.round(Number(v) * 100) / 100;
const nice = (v) => (v >= 300 ? Math.max(90, Math.round(v / 100) * 100 - 10) : Math.round(v)); // 1 990, 2 490…
const disc = (price, old) => (old > price && old > 0 ? Math.round((1 - price / old) * 100) : 0);

/** Строка цены: «цена до скидки», «скидка %», «цена продажи» связаны — меняете одно, пересчитывается другое */
function useRow(item, edit, setEdit) {
  const e = edit[item.id] || {};
  const price = e.price ?? item.price;
  const old = e.oldPrice !== undefined ? e.oldPrice : item.oldPrice;
  const base = old > 0 ? old : price;
  const cost = e.costPrice ?? item.costPrice;
  const set = (patch) => setEdit((s) => ({ ...s, [item.id]: { ...s[item.id], ...patch } }));
  return {
    price, base, cost, discount: disc(price, old), changed: Object.keys(e).length > 0,
    setBase: (v) => { const b = Number(v) || 0; const d = disc(price, old); set({ oldPrice: d ? b : null, price: d ? r2(b * (1 - d / 100)) : b }); },
    setDiscount: (v) => { const d = Math.min(95, Math.max(0, Number(v) || 0)); set({ oldPrice: d ? base : null, price: d ? r2(base * (1 - d / 100)) : base }); },
    setPrice: (v) => set({ price: Number(v) || 0, oldPrice: old > (Number(v) || 0) ? old : null }),
    setCost: (v) => set({ costPrice: v === '' ? '' : Number(v) }),
  };
}

function Cells({ item, edit, setEdit, money, sub }) {
  const r = useRow(item, edit, setEdit);
  const realCost = item.avgCost ?? r.cost;
  const margin = r.price > 0 && realCost > 0 ? ((r.price - realCost) / r.price) * 100 : null;
  const inp = 'input w-24 py-1.5 text-right tabular-nums';
  return (
    <>
      <td className="px-2 py-2 text-right">
        <input className={inp} type="number" min="0" step="any" value={r.cost} onChange={(e) => r.setCost(e.target.value)} title="Закупочная цена — для новых партий и товаров без партий" />
        {item.avgCost !== null && Math.abs(item.avgCost - r.cost) > 0.01 && <div className="mt-0.5 text-[11px] whitespace-nowrap text-slate-400" title="Средняя себестоимость остатка по партиям">по партиям {money(item.avgCost)}</div>}
      </td>
      <td className="px-2 py-2 text-right"><input className={inp} type="number" min="0" step="any" value={r.base} onChange={(e) => r.setBase(e.target.value)} /></td>
      <td className="px-2 py-2 text-right">
        <div className="relative inline-block"><input className="input w-20 py-1.5 pr-6 text-right tabular-nums" type="number" min="0" max="95" value={r.discount || ''} placeholder="0" onChange={(e) => r.setDiscount(e.target.value)} /><span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">%</span></div>
      </td>
      <td className="px-2 py-2 text-right"><input className={`${inp} font-semibold ${r.changed ? 'border-amber-400 bg-amber-50' : ''}`} type="number" min="0" step="any" value={r.price} onChange={(e) => r.setPrice(e.target.value)} /></td>
      <td className={`px-2 py-2 text-right text-sm tabular-nums ${margin === null ? 'text-slate-300' : margin < 20 ? 'text-rose-600' : margin < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
        {margin === null ? '—' : `${fmtNum(margin, 0)}%`}
        {margin !== null && <div className="text-[11px] whitespace-nowrap text-slate-400">{money(r.price - realCost)}</div>}
      </td>
      <td className="px-2 py-2 text-right text-sm text-slate-500 tabular-nums">{sub ?? fmtNum(item.stock)}</td>
    </>
  );
}

export default function Prices() {
  const money = useMoney();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState({});
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(new Set());
  const [bulk, setBulk] = useState({ kind: 'discount', value: '', nice: true });
  const [saving, setSaving] = useState(false);
  const load = () => api('/products/prices' + qs({ q: q.trim(), categoryId })).then((d) => { setList(d); setEdit({}); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries((list || []).flatMap((c) => [[c.id, c], ...c.variants.map((v) => [v.id, v])])), [list]);
  const changes = Object.keys(edit).length;
  const allSel = list?.length > 0 && list.every((c) => sel.has(c.id));

  // массовое действие над выбранными карточками (и их размерами)
  const applyBulk = () => {
    const v = Number(bulk.value);
    if (!sel.size) return toast('Отметьте товары галочками', 'error');
    if (bulk.kind !== 'clear' && (!bulk.value || isNaN(v))) return toast('Укажите значение', 'error');
    const next = { ...edit };
    const round = (x) => (bulk.nice ? nice(x) : r2(x));
    for (const id of sel) {
      for (const it of [byId[id], ...(byId[id].variants || [])]) {
        const e = next[it.id] || {};
        const price = e.price ?? it.price, old = e.oldPrice !== undefined ? e.oldPrice : it.oldPrice, base = old > 0 ? old : price;
        const cost = it.avgCost ?? (e.costPrice ?? it.costPrice);
        if (bulk.kind === 'discount') next[it.id] = { ...e, oldPrice: v > 0 ? base : null, price: v > 0 ? round(base * (1 - v / 100)) : base };
        if (bulk.kind === 'clear') next[it.id] = { ...e, oldPrice: null, price: base };
        if (bulk.kind === 'change') { const np = round(price * (1 + v / 100)); next[it.id] = { ...e, price: np, oldPrice: old > np ? old : null }; }
        if (bulk.kind === 'markup' && cost > 0) { const np = round(cost * (1 + v / 100)); next[it.id] = { ...e, price: np, oldPrice: old > np ? old : null }; }
      }
    }
    setEdit(next);
    toast('Цены пересчитаны — проверьте и сохраните');
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = Object.entries(edit).map(([id, e]) => {
        const it = byId[id];
        return { id: Number(id), price: e.price ?? it.price, oldPrice: e.oldPrice !== undefined ? e.oldPrice : it.oldPrice, ...(e.costPrice !== undefined && e.costPrice !== '' ? { costPrice: e.costPrice } : {}),
          // цена карточки без отдельных правок размеров — применяется ко всем её размерам
          sizes: it.variants?.length > 0 && !it.variants.some((v) => edit[v.id]) };
      });
      const r = await api('/products/prices', { method: 'PUT', body: { items } });
      toast(`Сохранено: ${r.changed}`); load();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Цены и скидки" subtitle="Цена продажи, цена до скидки, скидка и себестоимость — для всех товаров на одной странице">
        {changes > 0 && <Button variant="ghost" icon={Undo2} onClick={() => setEdit({})}>Отменить</Button>}
        <Button icon={Save} loading={saving} disabled={!changes} onClick={save}>Сохранить{changes ? ` (${changes})` : ''}</Button>
      </PageHeader>

      <div className="card">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Название, артикул" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-56"><RefSelect path="/categories" value={categoryId} onChange={setCategoryId} placeholder="Все категории" /></div>
        </div>
        {/* массовые действия */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 p-3 text-sm">
          <BadgePercent size={18} className="text-indigo-600" />
          <span className="text-slate-600">Выбрано: <b>{sel.size}</b></span>
          <select className="input w-auto py-1.5" value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value })}>
            <option value="discount">Установить скидку, %</option>
            <option value="clear">Убрать скидку</option>
            <option value="change">Изменить цену на ±%</option>
            <option value="markup">Наценка от себестоимости, %</option>
          </select>
          {bulk.kind !== 'clear' && <div className="relative"><input className="input w-24 py-1.5 pr-6" type="number" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} placeholder={bulk.kind === 'change' ? '+10' : '30'} /><Percent size={12} className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400" /></div>}
          <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={bulk.nice} onChange={(e) => setBulk({ ...bulk, nice: e.target.checked })} /> красивые цены (…90)</label>
          <Button size="sm" variant="secondary" onClick={applyBulk}>Применить</Button>
        </div>

        {!list ? <Spinner /> : list.length === 0 ? <p className="p-8 text-center text-slate-500">Товары не найдены</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((c) => c.id)))} aria-label="Выбрать все" /></th>
                  <th className="px-2 py-2 text-left font-medium">Товар</th>
                  <th className="px-2 py-2 text-right font-medium">Закупка, ₽</th>
                  <th className="px-2 py-2 text-right font-medium">Цена до скидки</th>
                  <th className="px-2 py-2 text-right font-medium">Скидка</th>
                  <th className="px-2 py-2 text-right font-medium">Цена продажи</th>
                  <th className="px-2 py-2 text-right font-medium">Маржа</th>
                  <th className="px-2 py-2 text-right font-medium">Остаток</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => {
                  const diff = c.variants.length > 1 && new Set(c.variants.map((v) => v.price)).size > 1;
                  const isOpen = open.has(c.id);
                  return [
                    <tr key={c.id} className={sel.has(c.id) ? 'bg-indigo-50/40' : ''}>
                      <td className="px-3 py-2"><input type="checkbox" checked={sel.has(c.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-3">
                          {c.variants.length > 0 ? <button onClick={() => setOpen((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="rounded p-0.5 text-slate-400 hover:text-slate-700" title="Цены по размерам">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="w-5" />}
                          <Thumb src={c.image} size={40} />
                          <div className="min-w-0">
                            <Link to={`/products/${c.id}`} className="line-clamp-1 text-sm font-medium hover:text-indigo-600">{c.name}</Link>
                            <div className="text-xs text-slate-500"><span className="font-mono">{c.article}</span>{c.color ? ` · ${c.color}` : ''}{c.variants.length ? ` · ${c.variants.length} разм.` : ''}{diff && <span className="text-amber-600"> · разные цены</span>}</div>
                          </div>
                        </div>
                      </td>
                      <Cells item={c} edit={edit} setEdit={setEdit} money={money} />
                    </tr>,
                    ...(isOpen ? c.variants.map((v) => (
                      <tr key={v.id} className="bg-slate-50/60">
                        <td />
                        <td className="py-1.5 pr-2 pl-16 text-sm text-slate-600">Размер <b>{v.size}</b></td>
                        <Cells item={v} edit={edit} setEdit={setEdit} money={money} />
                      </tr>
                    )) : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Цена карточки применяется ко всем её размерам, если цены размеров не меняли отдельно (стрелка слева). «Закупка» — цена для новых партий; маржа считается по фактической себестоимости остатка (партии), если она есть.</p>
    </div>
  );
}
