import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Printer, Trash2, Tags, RotateCw } from 'lucide-react';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker';
import { BarcodeSvg, Button, Field, PageHeader, Thumb, useMoney, useSettings, useToast } from '../ui';

const LS = 'label_options';
const defaults = { template: 'price', w: 58, h: 40, showStore: true, showSku: true, showAttrs: true, showOld: true };

/** Одна этикетка в реальных миллиметрах */
function Label({ p, o, money, storeName }) {
  const barcode = p.barcodes?.[0]?.code;
  const attrs = (p.attributes || []).slice(0, 3).map((a) => a.value).join(' · ');
  const box = { width: `${o.w}mm`, height: `${o.h}mm`, padding: '1.5mm 2mm', boxSizing: 'border-box', overflow: 'hidden', background: '#fff', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', display: 'flex', flexDirection: 'column' };

  if (o.template === 'barcode') {
    return (
      <div style={box}>
        <div style={{ fontSize: '7.5pt', fontWeight: 700, lineHeight: 1.15, maxHeight: '2.3em', overflow: 'hidden' }}>{p.name}</div>
        {o.showAttrs && attrs && <div style={{ fontSize: '6.5pt', lineHeight: 1.2 }}>{attrs}</div>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {barcode && <BarcodeSvg value={barcode} height={60} width={2} fontSize={16} className="label-barcode" />}
        </div>
        {o.showSku && p.sku && <div style={{ fontSize: '7pt', textAlign: 'center', fontWeight: 700 }}>Арт. {p.sku}</div>}
      </div>
    );
  }

  const hasOld = o.showOld && p.oldPrice && p.oldPrice > p.price;
  return (
    <div style={box}>
      {o.showStore && storeName && <div style={{ fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '0.2mm solid #000', paddingBottom: '0.5mm', marginBottom: '0.8mm' }}>{storeName}</div>}
      <div style={{ fontSize: '9.5pt', fontWeight: 700, lineHeight: 1.15, maxHeight: '2.3em', overflow: 'hidden' }}>{p.name}</div>
      {o.showAttrs && attrs && <div style={{ fontSize: '6.5pt', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{attrs}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm', marginTop: 'auto' }}>
        <span style={{ fontSize: hasOld ? '17pt' : '20pt', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>{money(p.price)}</span>
        {hasOld && <span style={{ fontSize: '8pt', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{money(p.oldPrice)}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1mm', marginTop: '0.8mm' }}>
        <div style={{ height: '13mm', display: 'flex', minWidth: 0 }}>{barcode && <BarcodeSvg value={barcode} height={40} width={1.5} fontSize={13} className="label-barcode" />}</div>
        {o.showSku && p.sku && <div style={{ fontSize: '6pt', textAlign: 'right', lineHeight: 1.1, maxWidth: '16mm', overflow: 'hidden' }}>арт.<br /><b>{p.sku}</b></div>}
      </div>
    </div>
  );
}

export default function Labels() {
  const [params] = useSearchParams();
  const [items, setItems] = useState([]); // [{ product, qty }]
  const [o, setO] = useState(() => ({ ...defaults, ...JSON.parse(localStorage.getItem(LS) || '{}') }));
  const money = useMoney();
  const { storeName } = useSettings();
  const toast = useToast();

  useEffect(() => { localStorage.setItem(LS, JSON.stringify(o)); }, [o]);

  // Загрузка товаров из ?ids=1,2&qty=3,1
  useEffect(() => {
    const ids = (params.get('ids') || '').split(',').filter(Boolean);
    const qty = (params.get('qty') || '').split(',');
    if (!ids.length) return;
    Promise.all(ids.map((id) => api('/products/' + id).catch(() => null))).then((list) => {
      setItems(list.map((p, i) => p && { product: p, qty: Number(qty[i]) || 1 }).filter(Boolean));
    });
  }, [params]);

  const add = async (p) => {
    const full = p.attributes ? p : await api('/products/' + p.id);
    setItems((s) => (s.some((x) => x.product.id === p.id) ? s.map((x) => (x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x)) : [...s, { product: full, qty: 1 }]));
  };

  const labels = useMemo(() => items.flatMap((it) => Array.from({ length: Math.max(0, Number(it.qty) || 0) }, () => it.product)), [items]);
  const set = (k, v) => setO({ ...o, [k]: v });
  const print = () => { if (!labels.length) return toast('Добавьте товары', 'error'); window.print(); };

  const printCss = `
    @page { size: ${o.w}mm ${o.h}mm; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; height: auto !important; }
      #root { display: none !important; }
      .label-print { display: block !important; }
      .label-print .lbl { page-break-after: always; break-after: page; }
      .label-print .lbl:last-child { page-break-after: auto; break-after: auto; }
    }
    .label-barcode { max-width: 100%; max-height: 100%; width: auto; height: 100%; }
  `;

  return (
    <div className="mx-auto max-w-7xl">
      <style>{printCss}</style>
      <PageHeader title="Ценники и этикетки" subtitle={`Термоэтикетки ${o.w}×${o.h} мм · ${labels.length} шт к печати`}>
        <Button icon={Printer} onClick={print} disabled={!labels.length}>Печать</Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <div className="card space-y-4 p-5">
            <h2 className="font-semibold">Параметры</h2>
            <div className="grid grid-cols-2 gap-2">
              {[['price', 'Ценник'], ['barcode', 'Штрихкод']].map(([k, l]) => (
                <button key={k} onClick={() => set('template', k)} className={`rounded-lg border py-2 text-sm font-medium ${o.template === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>{l}</button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Field label="Ширина, мм"><input className="input" type="number" value={o.w} onChange={(e) => set('w', Number(e.target.value) || 58)} /></Field>
              <Field label="Высота, мм"><input className="input" type="number" value={o.h} onChange={(e) => set('h', Number(e.target.value) || 40)} /></Field>
              <Button variant="secondary" icon={RotateCw} title="Повернуть" onClick={() => setO({ ...o, w: o.h, h: o.w })} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.showStore} onChange={(e) => set('showStore', e.target.checked)} /> Название магазина</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.showSku} onChange={(e) => set('showSku', e.target.checked)} /> Артикул</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.showAttrs} onChange={(e) => set('showAttrs', e.target.checked)} /> Характеристики</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={o.showOld} onChange={(e) => set('showOld', e.target.checked)} /> Старая цена</label>
            </div>
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">В окне печати выберите термопринтер, размер бумаги {o.w}×{o.h} мм, поля — «Нет», масштаб — 100%.</p>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Товары</h2>
            <ProductPicker onPick={add} autoFocus />
            <div className="mt-3 divide-y divide-slate-100">
              {items.map((it, i) => (
                <div key={it.product.id} className="flex items-center gap-3 py-2">
                  <Thumb src={it.product.images?.[0]?.path} size={36} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{it.product.name}</div><div className="font-mono text-xs text-slate-500">{it.product.barcodes?.[0]?.code}</div></div>
                  <input className="input w-20 text-right" type="number" min="0" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} title="Количество этикеток" />
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                </div>
              ))}
              {items.length === 0 && <div className="flex flex-col items-center py-8 text-sm text-slate-400"><Tags className="mb-2" />Добавьте товары для печати</div>}
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-3">
          <h2 className="mb-1 font-semibold">Предпросмотр</h2>
          <p className="mb-4 text-xs text-slate-500">Масштаб ×1.5 · реальный размер {o.w}×{o.h} мм</p>
          <div className="flex flex-wrap gap-4 rounded-xl bg-slate-100 p-4">
            {items.map((it) => (
              <div key={it.product.id} className="relative" style={{ width: `${o.w * 1.5}mm`, height: `${o.h * 1.5}mm` }}>
                <div className="origin-top-left shadow-md ring-1 ring-slate-300" style={{ transform: 'scale(1.5)', width: `${o.w}mm` }}>
                  <Label p={it.product} o={o} money={money} storeName={storeName} />
                </div>
                {Number(it.qty) > 1 && <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">×{it.qty}</span>}
              </div>
            ))}
            {items.length === 0 && <div className="w-full py-16 text-center text-sm text-slate-400">Здесь появится ценник</div>}
          </div>
        </div>
      </div>

      {createPortal(
        <div className="label-print" style={{ display: 'none' }}>
          {labels.map((p, i) => <div className="lbl" key={i}><Label p={p} o={o} money={money} storeName={storeName} /></div>)}
        </div>,
        document.body,
      )}
    </div>
  );
}
