import { useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { api } from '../api';
import { Button, fmtNum } from '../ui';
import { CameraButton } from './CameraScanner';

export const SIZE_PRESETS = [
  ['XS–XL', ['XS', 'S', 'M', 'L', 'XL']],
  ['42–52', ['42', '44', '46', '48', '50', '52']],
  ['Обувь 36–41', ['36', '37', '38', '39', '40', '41']],
  ['Детские', ['92', '98', '104', '110', '116', '122', '128']],
  ['Oversize', ['oversize']],
  ['Единый', ['Единый']],
];
export const COLOR_PRESETS = ['Чёрный', 'Белый', 'Серый', 'Бежевый', 'Тёмно-синий', 'Синий', 'Голубой', 'Красный', 'Бордовый', 'Розовый', 'Зелёный', 'Хаки', 'Коричневый', 'Молочный'];

/**
 * «Баркод, размер и цена» — как на WB: у каждого размера карточки свой штрихкод, цена и остаток.
 * value — [{ id?, size, barcode, price, costPrice, quantity, stock }]. Новым размерам штрихкод EAN-13 создаётся при сохранении.
 */
export default function VariantsEditor({ value, onChange, price, costPrice, isNew, unit = 'шт', warehouseId }) {
  // остаток размера на выбранном складе (редактируется прямо в таблице)
  const [showCost, setShowCost] = useState(false);
  const whStock = (v) => (v.stocks || []).find((x) => String(x.warehouseId) === String(warehouseId))?.quantity || 0;
  const set = (i, patch) => onChange(value.map((v, j) => (i === j ? { ...v, ...patch } : v)));
  const addSizes = (list) => {
    const have = new Set(value.map((v) => String(v.size).toLowerCase()));
    onChange([...value, ...list.filter((x) => !have.has(x.toLowerCase())).map((size) => ({ size, barcode: '', price: '', costPrice: '', quantity: '' }))]);
  };
  const gen = async (i) => { const { code } = await api('/products/generate-barcode', { method: 'POST' }); set(i, { barcode: code }); };
  const genAll = async () => {
    const out = [...value];
    for (let i = 0; i < out.length; i++) if (!out[i].barcode) out[i] = { ...out[i], barcode: (await api('/products/generate-barcode', { method: 'POST' })).code };
    onChange(out);
  };
  const fillAll = (k, v) => onChange(value.map((x) => ({ ...x, [k]: v })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">Быстро добавить:</span>
        {SIZE_PRESETS.map(([n, list]) => <button type="button" key={n} onClick={() => addSizes(list)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600">+ {n}</button>)}
      </div>

      {value.length > 0 && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[470px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-2 font-medium">Размер</th>
                <th className="py-2 pr-2 font-medium">Рос. размер</th>
                <th className="py-2 pr-2 font-medium">Штрихкод</th>
                <th className="py-2 pr-2 font-medium">Цена <button type="button" className="text-indigo-600" onClick={() => fillAll('price', price)} title="Всем — цена карточки">↓</button></th>
                {showCost && <th className="py-2 pr-2 font-medium">Закупка <button type="button" className="text-indigo-600" onClick={() => fillAll('costPrice', costPrice)} title="Всем — закупочная карточки">↓</button></th>}
                <th className="py-2 pr-2 text-right font-medium">Остаток</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.map((v, i) => (
                <tr key={v.id || 'n' + i}>
                  <td className="py-1.5 pr-2"><input className="input w-16 py-1.5 font-medium" value={v.size || ''} onChange={(e) => set(i, { size: e.target.value })} placeholder="M" list="size-presets" /></td>
                  <td className="py-1.5 pr-2"><input className="input w-16 py-1.5" value={v.sizeRu || ''} onChange={(e) => set(i, { sizeRu: e.target.value })} placeholder="42-44" /></td>
                  <td className="py-1.5 pr-2">
                    <div className="relative flex items-center gap-1">
                      <input className="input w-[8.5rem] py-1.5 pr-8 font-mono text-[11px]" value={v.barcode || ''} onChange={(e) => set(i, { barcode: e.target.value.replace(/\s/g, '') })} placeholder="авто EAN-13" />
                      <CameraButton onResult={(code) => set(i, { barcode: code })} className="absolute top-1/2 right-9 -translate-y-1/2" />
                      <button type="button" onClick={() => gen(i)} className="rounded p-1 text-slate-400 hover:text-indigo-600" title="Сгенерировать"><Wand2 size={14} /></button>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2"><input className="input w-20 py-1.5" type="number" step="any" min="0" value={v.price ?? ''} onChange={(e) => set(i, { price: e.target.value })} placeholder={price || '0'} /></td>
                  {showCost && <td className="py-1.5 pr-2"><input className="input w-[5.5rem] py-1.5" type="number" step="any" min="0" value={v.costPrice ?? ''} onChange={(e) => set(i, { costPrice: e.target.value })} placeholder={costPrice || '0'} /></td>}
                  <td className="py-1.5 pr-2 text-right">
                    {v.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input className={`input w-16 py-1.5 text-right ${v.newStock !== undefined && Number(v.newStock) !== whStock(v) ? 'border-amber-400 bg-amber-50' : ''}`} type="number" step="any" value={v.newStock ?? whStock(v)} onChange={(e) => set(i, { newStock: e.target.value })} title={`Всего на всех складах: ${fmtNum(v.stock || 0)} ${unit}`} />
                      </div>
                    ) : <input className="input ml-auto w-20 py-1.5 text-right" type="number" step="any" min="0" value={v.quantity ?? ''} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="0" />}
                  </td>
                  <td><button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Удалить размер"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="size-presets">{SIZE_PRESETS.flatMap(([, l]) => l).map((x) => <option key={x} value={x} />)}</datalist>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...value, { size: '', barcode: '', price: '', costPrice: '', quantity: '' }])}>Добавить размер</Button>
        {value.some((v) => !v.barcode) && <Button type="button" size="sm" variant="ghost" icon={Wand2} onClick={genAll}>Сгенерировать баркоды</Button>}
        {value.length > 0 && <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> закупочная цена по размерам</label>}
      </div>
    </div>
  );
}
