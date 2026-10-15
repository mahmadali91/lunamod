import { useState } from 'react';
import { Plus, Trash2, Wand2, X, Grid3x3 } from 'lucide-react';
import { api } from '../api';
import { Button, fmtNum } from '../ui';
import { CameraButton } from './CameraScanner';

export const SIZE_PRESETS = [
  ['Одежда', ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']],
  ['Российские', ['40', '42', '44', '46', '48', '50', '52', '54', '56']],
  ['Обувь', ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45']],
  ['Детские', ['92', '98', '104', '110', '116', '122', '128', '134', '140']],
  ['Один размер', ['ONE SIZE']],
];
export const COLOR_PRESETS = ['Чёрный', 'Белый', 'Серый', 'Бежевый', 'Синий', 'Голубой', 'Красный', 'Розовый', 'Зелёный', 'Хаки', 'Жёлтый', 'Коричневый', 'Молочный', 'Бордовый'];

function Chips({ label, values, onChange, presets, placeholder }) {
  const [v, setV] = useState('');
  const add = (x) => { x = String(x).trim(); if (x && !values.some((y) => y.toLowerCase() === x.toLowerCase())) onChange([...values, x]); setV(''); };
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1.5">
        {values.map((x) => (
          <span key={x} className="flex items-center gap-1 rounded-md bg-indigo-50 py-0.5 pr-1 pl-2 text-sm text-indigo-800">
            {x}<button type="button" onClick={() => onChange(values.filter((y) => y !== x))} className="rounded p-0.5 hover:bg-indigo-100" aria-label={`Убрать ${x}`}><X size={12} /></button>
          </span>
        ))}
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(v); } if (e.key === 'Backspace' && !v && values.length) onChange(values.slice(0, -1)); }}
          onBlur={() => v && add(v)} className="min-w-[90px] flex-1 bg-transparent px-1 text-sm outline-none" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">{presets}</div>
    </div>
  );
}

/**
 * Варианты карточки: цвета × размеры. value — [{ id?, color, size, barcode, price, costPrice, quantity, stock }].
 * Новые строки получают штрихкод EAN-13 при сохранении (или свой — можно ввести/отсканировать).
 */
export default function VariantsEditor({ value, onChange, price, costPrice, isNew, unit = 'шт' }) {
  const [colors, setColors] = useState(() => [...new Set(value.map((v) => v.color).filter(Boolean))]);
  const [sizes, setSizes] = useState(() => [...new Set(value.map((v) => v.size).filter(Boolean))]);
  const set = (i, patch) => onChange(value.map((v, j) => (i === j ? { ...v, ...patch } : v)));
  const key = (c, s) => `${(c || '').toLowerCase()}|${(s || '').toLowerCase()}`;

  // Сетка: добавить недостающие сочетания цвет × размер (существующие строки не трогаем)
  const build = () => {
    const cs = colors.length ? colors : [null], ss = sizes.length ? sizes : [null];
    if (!colors.length && !sizes.length) return;
    const have = new Set(value.map((v) => key(v.color, v.size)));
    const add = [];
    for (const c of cs) for (const s of ss) if (!have.has(key(c, s))) add.push({ color: c || '', size: s || '', barcode: '', price: '', costPrice: '', quantity: '' });
    // порядок: по цвету, затем по размеру в порядке ввода
    const all = [...value, ...add];
    const ci = (c) => { const i = cs.findIndex((x) => (x || '') === (c || '')); return i < 0 ? 99 : i; };
    const si = (s) => { const i = ss.findIndex((x) => (x || '') === (s || '')); return i < 0 ? 99 : i; };
    onChange(all.sort((a, b) => ci(a.color) - ci(b.color) || si(a.size) - si(b.size)));
  };
  const gen = async (i) => { const { code } = await api('/products/generate-barcode', { method: 'POST' }); set(i, { barcode: code }); };
  const fillAll = (k, v) => onChange(value.map((x) => ({ ...x, [k]: v })));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Chips label="Цвета" values={colors} onChange={setColors} placeholder="Введите цвет и Enter"
          presets={COLOR_PRESETS.filter((c) => !colors.includes(c)).slice(0, 8).map((c) => <button type="button" key={c} onClick={() => setColors([...colors, c])} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">+ {c}</button>)} />
        <Chips label="Размеры" values={sizes} onChange={setSizes} placeholder="Введите размер и Enter"
          presets={SIZE_PRESETS.map(([n, list]) => <button type="button" key={n} onClick={() => setSizes([...new Set([...sizes, ...list])])} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">+ {n}</button>)} />
      </div>
      <Button type="button" variant="secondary" icon={Grid3x3} onClick={build} disabled={!colors.length && !sizes.length}>
        Создать варианты {colors.length && sizes.length ? `(${colors.length} × ${sizes.length})` : ''}
      </Button>

      {value.length > 0 && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-2 font-medium">Цвет</th><th className="py-2 pr-2 font-medium">Размер</th>
                <th className="py-2 pr-2 font-medium">Штрихкод</th>
                <th className="py-2 pr-2 font-medium">Цена <button type="button" className="text-indigo-600" onClick={() => fillAll('price', price)} title="Всем — цена карточки">↓</button></th>
                <th className="py-2 pr-2 font-medium">Закупка <button type="button" className="text-indigo-600" onClick={() => fillAll('costPrice', costPrice)} title="Всем — закупочная карточки">↓</button></th>
                <th className="py-2 pr-2 text-right font-medium">{isNew ? 'Нач. остаток' : 'Остаток'}</th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {value.map((v, i) => (
                <tr key={v.id || 'n' + i}>
                  <td className="py-1.5 pr-2"><input className="input w-24 py-1.5" value={v.color || ''} onChange={(e) => set(i, { color: e.target.value })} placeholder="—" /></td>
                  <td className="py-1.5 pr-2"><input className="input w-16 py-1.5" value={v.size || ''} onChange={(e) => set(i, { size: e.target.value })} placeholder="—" /></td>
                  <td className="py-1.5 pr-2">
                    <div className="relative flex items-center gap-1">
                      <input className="input w-36 py-1.5 pr-8 font-mono text-xs" value={v.barcode || ''} onChange={(e) => set(i, { barcode: e.target.value.replace(/\s/g, '') })} placeholder="авто EAN-13" />
                      <CameraButton onResult={(code) => set(i, { barcode: code })} className="absolute top-1/2 right-9 -translate-y-1/2" />
                      <button type="button" onClick={() => gen(i)} className="rounded p-1 text-slate-400 hover:text-indigo-600" title="Сгенерировать"><Wand2 size={14} /></button>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2"><input className="input w-20 py-1.5" type="number" step="any" min="0" value={v.price ?? ''} onChange={(e) => set(i, { price: e.target.value })} placeholder={price || '0'} /></td>
                  <td className="py-1.5 pr-2"><input className="input w-20 py-1.5" type="number" step="any" min="0" value={v.costPrice ?? ''} onChange={(e) => set(i, { costPrice: e.target.value })} placeholder={costPrice || '0'} /></td>
                  <td className="py-1.5 pr-2 text-right">
                    {v.id ? <b className={v.stock <= 0 ? 'text-rose-600' : ''}>{fmtNum(v.stock || 0)} {unit}</b>
                      : <input className="input ml-auto w-20 py-1.5" type="number" step="any" min="0" value={v.quantity ?? ''} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="0" />}
                  </td>
                  <td><button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Удалить вариант"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...value, { color: colors[0] || '', size: '', barcode: '', price: '', costPrice: '', quantity: '' }])}>Добавить строку вручную</Button>
    </div>
  );
}
