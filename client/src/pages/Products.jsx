import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Package, Tags, Pencil, Archive, List, LayoutGrid, FileSpreadsheet, ZoomIn, Download, ExternalLink } from 'lucide-react';
import { api, fileUrl, qs } from '../api';
import { Badge, Button, Empty, PageHeader, RefSelect, Spinner, Thumb, fmtNum, useLoad, useMoney } from '../ui';
import Lightbox from '../components/Lightbox';
import ImportProducts from '../components/ImportProducts';
import { CameraButton } from '../components/CameraScanner';
import { downloadXlsx, today } from '../excel';

const VIEW_KEY = 'products_view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'list'; } catch { return 'list'; } };

export default function Products() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [categoryId, setCategoryId] = useState(params.get('category') ? Number(params.get('category')) : null);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [view, setView] = useState(readView);
  const [zoom, setZoom] = useState(null); // { images, title }
  const [importOpen, setImportOpen] = useState(false);
  const changeView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* приватный режим */ } };

  // Крупный просмотр: сразу первое фото, затем подгружаем все фото товара
  const openZoom = async (p) => {
    if (!p.images[0]) return;
    setZoom({ images: [p.images[0].path], title: p.name });
    try { const full = await api('/products/' + p.id); if (full.images.length) setZoom({ images: full.images.map((i) => i.path), title: p.name }); } catch { /* оставляем одно фото */ }
  };
  const navigate = useNavigate();
  const money = useMoney();

  useEffect(() => { setQ(params.get('q') || ''); }, [params]);
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);

  const { data, loading, reload } = useLoad('/products' + qs({ q: debounced, categoryId, page, limit: 50, archived }));

  const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => {
    setExporting(true);
    try {
      const list = await api('/products/export' + qs({ categoryId }));
      const attrs = [...new Set(list.flatMap((p) => p.attributes.map((a) => a.name)))].filter((a) => !['Размер', 'Цвет'].includes(a));
      const order = ['Материал', 'Бренд'];
      attrs.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
      await downloadXlsx(`tovary-${today()}.xlsx`, [
        { title: 'ID', value: (p) => p.id, width: 7 },
        { title: 'Название', value: (p) => p.name, width: 42 },
        { title: 'Артикул', value: (p) => p.sku, width: 18 },
        { title: 'Числовой артикул', value: (p) => p.article, width: 14 },
        { title: 'Штрихкод', value: (p) => p.barcodes[0]?.code, width: 16 },
        { title: 'Доп. штрихкоды', value: (p) => p.barcodes.slice(1).map((b) => b.code).join(', '), width: 16 },
        { title: 'Категория', value: (p) => p.category?.name, width: 28 },
        { title: 'Цена', value: (p) => p.price, width: 11 },
        { title: 'Старая цена', value: (p) => p.oldPrice, width: 12 },
        { title: 'Закупочная цена', value: (p) => p.costPrice, width: 15 },
        { title: 'Ед. изм.', value: (p) => p.unit, width: 9 },
        { title: 'Мин. остаток', value: (p) => p.minStock, width: 12 },
        { title: 'Цвет', value: (p) => p.color || p.parent?.color, width: 14 },
        { title: 'Размер', value: (p) => p.size, width: 10 },
        ...attrs.map((a) => ({ title: a, value: (p) => p.attributes.find((x) => x.name === a)?.value, width: 16 })),
        { title: 'Описание', value: (p) => p.description, width: 40 },
        { title: 'Всего на складах', value: (p) => p.totalStock, width: 16 },
      ], list);
    } catch (e) { alert(e.message); } finally { setExporting(false); }
  };

  const openCode = async (code) => {
    try { const p = await api('/products/lookup/' + encodeURIComponent(code)); navigate('/products/' + (p.parentId || p.id)); } catch { setQ(code); }
  };
  const onKeyDown = (e) => { if (e.key === 'Enter' && q.trim()) openCode(q.trim()); };

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const items = data?.items || [];
  const allChecked = items.length > 0 && items.every((p) => selected.includes(p.id));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Товары" subtitle={data ? `Всего: ${data.total}` : ''}>
        {selected.length > 0 && (
          <Button variant="secondary" icon={Tags} onClick={() => navigate('/labels?ids=' + selected.join(','))}>Печать этикеток ({selected.length})</Button>
        )}
        <Button variant="secondary" icon={Download} loading={exporting} onClick={exportXlsx}>Выгрузить в Excel</Button>
        <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImportOpen(true)}>Загрузить из Excel</Button>
        <Button icon={Plus} onClick={() => navigate('/products/new')}>Добавить товар</Button>
      </PageHeader>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-60 flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <CameraButton onResult={openCode} className="absolute top-1/2 right-2 -translate-y-1/2" />
            <input className="input pr-11 pl-9" placeholder="Название, артикул или штрихкод (Enter — открыть)" value={q}
              onChange={(e) => { setQ(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }); }} onKeyDown={onKeyDown} autoFocus />
          </div>
          <RefSelect path="/categories" value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} placeholder="Все категории" className="w-48" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Архив</label>
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 p-0.5">
            {[['list', List, 'Список'], ['grid', LayoutGrid, 'Плитка']].map(([v, Icon, l]) => (
              <button key={v} title={l} onClick={() => changeView(v)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === v ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={16} /><span className="hidden sm:inline">{l}</span></button>
            ))}
          </div>
        </div>

        {!data ? <Spinner /> : items.length === 0 ? (
          <Empty icon={Package} title="Товары не найдены" text="Добавьте первый товар или измените условия поиска">
            <Button icon={Plus} onClick={() => navigate('/products/new')}>Добавить товар</Button>
          </Empty>
        ) : view === 'grid' ? (
          <div className={`grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${loading ? 'opacity-60' : ''}`}>
            {items.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-indigo-200 hover:shadow-md">
                <Link to={`/products/${p.id}`} className="block">
                  <div className="aspect-square bg-slate-50">
                    {p.images[0] ? <img src={fileUrl(p.images[0].path)} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><Package size={40} /></div>}
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-slate-900">{p.name}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-slate-400"><b className="text-slate-600">{p.article}</b>{p.sku ? ' · ' + p.sku : ''}</div>
                    {p.color && <div className="mt-0.5 truncate text-xs text-slate-600">{p.color}{p.group?._count.products > 1 && <span className="text-slate-400"> · +{p.group._count.products - 1} цв.</span>}</div>}
                    {p.hasVariants && <VariantChips p={p} />}
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <div className="font-bold">{money(p.price)}</div>
                        {p.oldPrice > p.price && <div className="text-xs text-slate-400 line-through">{money(p.oldPrice)}</div>}
                      </div>
                      <Badge color={p.totalStock <= 0 ? 'red' : p.totalStock <= p.minStock ? 'amber' : 'green'}>{fmtNum(p.totalStock)} {p.unit}</Badge>
                    </div>
                  </div>
                </Link>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="absolute top-2 left-2 h-4 w-4" title="Выбрать для печати этикеток" />
                {p.images[0] && <button type="button" onClick={() => openZoom(p)} title="Увеличить фото" className="absolute top-2 right-2 rounded-lg bg-white/90 p-1.5 text-slate-600 opacity-0 shadow transition group-hover:opacity-100 hover:text-indigo-600 max-sm:opacity-100"><ZoomIn size={16} /></button>}
              </div>
            ))}
          </div>
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
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => openZoom(p)} title={p.images[0] ? 'Увеличить фото' : ''} className={`group relative shrink-0 ${p.images[0] ? 'cursor-zoom-in' : 'cursor-default'}`}>
                          <Thumb src={p.images[0]?.path} size={52} />
                          {p.images[0] && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/40 text-white opacity-0 transition group-hover:opacity-100"><ZoomIn size={18} /></span>}
                        </button>
                        <Link to={`/products/${p.id}`} className="min-w-0">
                          <div className="font-medium text-slate-900 hover:text-indigo-600">{p.name}</div>
                          {p.category && <div className="text-xs text-slate-500">{p.category.name}</div>}
                          {p.color && <div className="text-xs text-slate-600">{p.color}{p.group?._count.products > 1 && <span className="text-slate-400"> · модель: {p.group._count.products} цв.</span>}</div>}
                          {p.hasVariants && <VariantChips p={p} />}
                        </Link>
                      </div>
                    </td>
                    <td className="td font-mono text-xs"><div className="font-semibold text-slate-800">{p.article}</div><div className="text-slate-400">{p.sku || ''}</div></td>
                    <td className="td font-mono text-xs text-slate-600">{p.hasVariants ? <span className="font-sans text-slate-500">{p.variants.length} штрихкод.</span> : p.barcodes[0]?.code}</td>
                    <td className="td text-right font-semibold">{money(p.price)}</td>
                    <td className="td text-right">
                      <Badge color={p.totalStock <= 0 ? 'red' : p.totalStock <= p.minStock ? 'amber' : 'green'}>{fmtNum(p.totalStock)} {p.unit}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {p.showInShop && <a href={`/product/${p.id}`} target="_blank" rel="noreferrer" title="Открыть на сайте" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><ExternalLink size={16} /></a>}
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
      {zoom && <Lightbox images={zoom.images} title={zoom.title} onClose={() => setZoom(null)} />}
      <ImportProducts open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
      {archived && <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><Archive size={12} /> Показаны архивные товары (удалённые, по которым были документы)</p>}
    </div>
  );
}

// Размеры карточки: зачёркнут — нет в наличии
function VariantChips({ p }) {
  const sizes = {};
  p.variants.forEach((v) => { const k = v.size || v.color; const q = v.stocks.reduce((a, x) => a + x.quantity, 0); sizes[k] = (sizes[k] || 0) + q; });
  const colors = new Set(p.variants.map((v) => v.color).filter(Boolean)).size;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {Object.entries(sizes).slice(0, 8).map(([k, q]) => <span key={k} className={`rounded border px-1 text-[10px] ${q > 0 ? 'border-slate-300 text-slate-600' : 'border-slate-200 text-slate-300 line-through'}`}>{k}</span>)}
      {colors > 1 && <span className="text-[10px] text-slate-400">{colors} цв.</span>}
    </div>
  );
}
