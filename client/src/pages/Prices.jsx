import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Save, Percent, ChevronRight, ChevronDown, Undo2, BadgePercent, Download, Upload, Tags } from 'lucide-react';
import { api, qs } from '../api';
import { Button, PageHeader, RefSelect, Spinner, Thumb, fmtNum, useMoney, useSettings, useToast } from '../ui';
import { downloadXlsx, readTable, norm, today } from '../excel';
import { defaults as labelDefaults } from './Labels';

const r2 = (v) => Math.round(Number(v) * 100) / 100;
const nice = (v) => (v >= 300 ? Math.max(90, Math.round(v / 100) * 100 - 10) : Math.round(v)); // 1 990, 2 490…
// массовые действия: проценты или рубли
const BULK = {
  discount: ['Установить скидку', '%'], clear: ['Убрать скидку', ''], change: ['Изменить цену на ±%', '%'], changeRub: ['Изменить цену на ± ₽', '₽'],
  setPrice: ['Установить цену продажи', '₽'], setBase: ['Установить цену до скидки', '₽'], markup: ['Наценка от себестоимости', '%'], setCost: ['Установить закупочную цену', '₽'],
};
// колонки Excel: ID нужен, чтобы при загрузке найти товар
const XLS = ['ID', 'Артикул', 'Название', 'Цвет', 'Размер', 'Закупка', 'Цена до скидки', 'Скидка, %', 'Цена продажи', 'Остаток'];
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
  const { storeName } = useSettings();
  const [busy, setBusy] = useState('');
  const file = useRef(null);
  const skip = useRef(false);
  const load = () => api('/products/prices' + qs({ q: q.trim(), categoryId })).then((d) => { setList(d); setEdit({}); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { if (skip.current) { skip.current = false; return; } const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // текущие значения строки с учётом несохранённых правок
  const cur = (it) => { const e = edit[it.id] || {}; return { price: e.price ?? it.price, oldPrice: e.oldPrice !== undefined ? e.oldPrice : it.oldPrice, costPrice: e.costPrice ?? it.costPrice }; };

  const exportXlsx = async () => {
    setBusy('xls');
    try {
      const all = await api('/products/prices' + qs({ q: q.trim(), categoryId, limit: 5000 }));
      const rows = all.flatMap((c) => [{ ...c, size: '' }, ...c.variants.map((v) => ({ ...v, article: c.article, name: c.name, color: c.color }))]);
      const col = (title, value, width, money) => ({ title, value, width, money });
      await downloadXlsx(`цены-${today()}.xlsx`, [
        col('ID', (r) => r.id, 8), col('Артикул', (r) => r.article, 11), col('Название', (r) => r.name, 36), col('Цвет', (r) => r.color || '', 12), col('Размер', (r) => r.size || '', 9),
        col('Закупка', (r) => r.costPrice || 0, 11, true), col('Цена до скидки', (r) => (r.oldPrice > r.price ? r.oldPrice : r.price), 15, true),
        col('Скидка, %', (r) => disc(r.price, r.oldPrice) || 0, 10), col('Цена продажи', (r) => r.price, 14, true), col('Остаток', (r) => r.stock, 10),
      ], rows);
      toast(`Выгружено строк: ${rows.length}. Поменяйте цены в Excel и загрузите файл обратно`);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };

  // загрузка из Excel: изменения попадают в таблицу (подсвечены) — проверить и «Сохранить»
  const importXlsx = async (f) => {
    if (!f) return;
    setBusy('imp');
    try {
      const t = await readTable(f);
      const head = (t[0] || []).map(norm);
      const ix = (name) => head.indexOf(norm(name));
      if (ix('ID') < 0 || ix('Цена продажи') < 0) throw new Error('В файле нет колонок «ID» и «Цена продажи». Сначала скачайте файл кнопкой «Excel»');
      const all = await api('/products/prices' + qs({ limit: 5000 }));
      const map = Object.fromEntries(all.flatMap((c) => [[c.id, c], ...c.variants.map((v) => [v.id, v])]));
      const numOf = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/\s/g, '').replace(',', '.')));
      const next = {}; let bad = 0, miss = 0;
      for (const row of t.slice(1)) {
        const id = Number(row[ix('ID')]); if (!id) continue;
        const it = map[id]; if (!it) { miss++; continue; }
        let price = numOf(row[ix('Цена продажи')]), base = ix('Цена до скидки') >= 0 ? numOf(row[ix('Цена до скидки')]) : null;
        const d = ix('Скидка, %') >= 0 ? numOf(row[ix('Скидка, %')]) : null, cost = ix('Закупка') >= 0 ? numOf(row[ix('Закупка')]) : null;
        if ([price, base, d, cost].some((x) => x !== null && (isNaN(x) || x < 0))) { bad++; continue; }
        // скидка поменялась, а цена продажи нет — пересчитываем цену от «до скидки»
        if (base && d !== null && d !== disc(it.price, it.oldPrice) && price === it.price) price = r2(base * (1 - Math.min(95, d) / 100));
        if (price === null) price = base ?? it.price;
        const oldPrice = base && base > price ? r2(base) : null;
        const e = {};
        if (r2(price) !== it.price) e.price = r2(price);
        if (oldPrice !== (it.oldPrice > it.price ? it.oldPrice : null)) e.oldPrice = oldPrice;
        if (cost !== null && r2(cost) !== it.costPrice) e.costPrice = r2(cost);
        if (Object.keys(e).length) next[id] = { price: r2(price), oldPrice, ...e };
      }
      skip.current = q.trim() !== '' || categoryId !== null;
      setQ(''); setCategoryId(null);
      setList(all); setEdit(next);
      setOpen(new Set(all.filter((c) => c.variants.some((v) => next[v.id])).map((c) => c.id)));
      const n = Object.keys(next).length;
      toast(n ? `Из файла изменено цен: ${n}${bad ? `, пропущено строк с ошибкой: ${bad}` : ''}${miss ? `, не найдено: ${miss}` : ''}. Проверьте и нажмите «Сохранить»` : 'В файле нет изменений', n ? 'success' : 'error');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  };

  // ценники 58×40 в PDF для отмеченных товаров (каждый размер — свой ценник)
  const [labelQty, setLabelQty] = useState('one');
  const labelsPdf = async () => {
    if (!sel.size) return toast('Отметьте товары галочками', 'error');
    setBusy('pdf');
    try {
      let saved = {}; try { saved = JSON.parse(localStorage.getItem('label_options') || '{}'); } catch { /* нет настроек */ }
      const o = { ...labelDefaults, ...saved, template: 'price', w: 58, h: 40 };
      const out = [];
      for (const id of sel) {
        const c = byId[id]; if (!c) continue;
        for (const v of c.variants.length ? c.variants : [c]) {
          const x = cur(v);
          const one = { name: c.name, variant: [c.color, v.size].filter(Boolean).join(' · '), price: x.price, oldPrice: x.oldPrice, barcode: v.barcode, sku: c.sku || c.article };
          const n = labelQty === 'stock' ? Math.max(0, Math.round(v.stock)) : 1;
          for (let i = 0; i < n; i++) out.push(one);
        }
      }
      if (!out.length) throw new Error('Нет остатка у выбранных товаров');
      const { labelsPdf: make } = await import('../pdf');
      await make(out, o, { money, storeName, fileName: `ценники-58x40-${today()}.pdf` });
      if (changes) toast('В ценниках новые цены, но они ещё не сохранены — не забудьте «Сохранить»');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };

  const byId = useMemo(() => Object.fromEntries((list || []).flatMap((c) => [[c.id, c], ...c.variants.map((v) => [v.id, v])])), [list]);
  const changes = Object.keys(edit).length;
  const allSel = list?.length > 0 && list.every((c) => sel.has(c.id));

  // массовое действие над выбранными карточками (и их размерами)
  const applyBulk = () => {
    const v = Number(bulk.value);
    if (!sel.size) return toast('Отметьте товары галочками', 'error');
    if (bulk.kind !== 'clear' && (bulk.value === '' || isNaN(v))) return toast('Укажите значение', 'error');
    if (['setPrice', 'setBase', 'setCost'].includes(bulk.kind) && v < 0) return toast('Значение не может быть отрицательным', 'error');
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
        if (bulk.kind === 'changeRub') { const np = Math.max(0, r2(price + v)); next[it.id] = { ...e, price: np, oldPrice: old > np ? old : null }; }
        if (bulk.kind === 'setPrice') next[it.id] = { ...e, price: r2(v), oldPrice: old > v ? old : null };
        if (bulk.kind === 'setBase') { const d = disc(price, old); next[it.id] = { ...e, oldPrice: d ? r2(v) : null, price: d ? round(v * (1 - d / 100)) : r2(v) }; }
        if (bulk.kind === 'setCost') next[it.id] = { ...e, costPrice: r2(v) };
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
        <Button variant="secondary" icon={Download} loading={busy === 'xls'} onClick={exportXlsx}>Excel</Button>
        <Button variant="secondary" icon={Upload} loading={busy === 'imp'} onClick={() => file.current?.click()}>Загрузить</Button>
        <input ref={file} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => importXlsx(e.target.files[0])} />
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
            {Object.entries(BULK).map(([k, [l, u]]) => <option key={k} value={k}>{l}{u ? `, ${u}` : ''}</option>)}
          </select>
          {bulk.kind !== 'clear' && <div className="relative"><input className="input w-28 py-1.5 pr-6" type="number" step="any" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} placeholder={bulk.kind.startsWith('change') ? '+10' : BULK[bulk.kind][1] === '₽' ? '1990' : '30'} />{BULK[bulk.kind][1] === '%' ? <Percent size={12} className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400" /> : <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">₽</span>}</div>}
          {!['setCost', 'clear'].includes(bulk.kind) && <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={bulk.nice} onChange={(e) => setBulk({ ...bulk, nice: e.target.checked })} /> красивые цены (…90)</label>}
          <Button size="sm" variant="secondary" onClick={applyBulk}>Применить</Button>
          <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <select className="input w-auto py-1.5" value={labelQty} onChange={(e) => setLabelQty(e.target.value)} title="Сколько ценников на каждый размер">
            <option value="one">по 1 ценнику</option>
            <option value="stock">по остатку</option>
          </select>
          <Button size="sm" variant="secondary" icon={Tags} loading={busy === 'pdf'} onClick={labelsPdf}>Ценники 58×40, PDF</Button>
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
