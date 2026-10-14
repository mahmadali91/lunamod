import { Trash2, Package } from 'lucide-react';
import ProductPicker from './ProductPicker';
import { Thumb, fmtNum } from '../ui';

/**
 * Таблица позиций документа. columns: [{ key, label, width }] — редактируемые числовые поля.
 * При повторном сканировании того же товара количество увеличивается на 1.
 */
export default function ItemsEditor({ items, setItems, columns, makeItem, hint, extra }) {
  const add = (p) => {
    setItems((list) => {
      const ex = list.find((i) => i.productId === p.id);
      if (ex) return list.map((i) => (i.productId === p.id ? { ...i, quantity: Number(i.quantity || 0) + 1 } : i));
      return [...list, { productId: p.id, name: p.name, sku: p.sku, image: p.images?.[0]?.path, unit: p.unit, quantity: 1, ...makeItem(p) }];
    });
  };
  const update = (idx, k, v) => setItems((list) => list.map((i, j) => (j === idx ? { ...i, [k]: v } : i)));

  return (
    <div>
      <ProductPicker onPick={add} autoFocus />
      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-xl border-2 border-dashed border-slate-200 py-10 text-sm text-slate-400">
          <Package className="mb-2" /> {hint || 'Отсканируйте штрихкод или найдите товар'}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th>{columns.map((c) => <th key={c.key} className="th text-right" style={{ width: c.width || 120 }}>{c.label}</th>)}{extra && <th className="th text-right">{extra.label}</th>}<th className="w-8" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it, idx) => (
                <tr key={it.productId}>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-3">
                      <Thumb src={it.image} size={36} />
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{it.name}</div><div className="text-xs text-slate-500">{it.sku || ''}{it.info ? ' · ' + it.info : ''}</div></div>
                    </div>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="px-1 py-2"><input type="number" step="any" min={c.min ?? 0} className="input text-right" value={it[c.key]} onChange={(e) => update(idx, c.key, e.target.value)} /></td>
                  ))}
                  {extra && <td className="px-2 py-2 text-right text-sm font-semibold whitespace-nowrap">{extra.render(it)}</td>}
                  <td className="py-2 text-right"><button type="button" onClick={() => setItems(items.filter((_, j) => j !== idx))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-right text-xs text-slate-500">Позиций: {items.length} · Кол-во: {fmtNum(items.reduce((s, i) => s + Number(i.quantity || 0), 0))}</div>
        </div>
      )}
    </div>
  );
}
