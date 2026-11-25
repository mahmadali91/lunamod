import { useState } from 'react';
import { Plus, Pencil, Trash2, Ruler, X } from 'lucide-react';
import { api } from '../api';
import { Button, Field, Modal, useLoad, useToast } from '../ui';

const TEMPLATES = {
  'Женская одежда': { head: ['Размер', 'RU', 'Обхват груди, см', 'Обхват талии, см', 'Обхват бёдер, см'], rows: [['XS', '40-42', '80-84', '62-66', '88-92'], ['S', '42-44', '84-88', '66-70', '92-96'], ['M', '44-46', '88-92', '70-74', '96-100'], ['L', '46-48', '92-96', '74-78', '100-104'], ['XL', '48-50', '96-100', '78-82', '104-108']] },
  'Мужская одежда': { head: ['Размер', 'RU', 'Обхват груди, см', 'Обхват талии, см', 'Рост, см'], rows: [['S', '44-46', '88-92', '76-80', '170-176'], ['M', '46-48', '92-96', '80-84', '176-182'], ['L', '48-50', '96-100', '84-88', '176-182'], ['XL', '50-52', '100-104', '88-92', '182-188'], ['XXL', '52-54', '104-108', '92-96', '182-188']] },
  'Обувь': { head: ['RU', 'EU', 'Длина стопы, см'], rows: [['36', '37', '23'], ['37', '38', '23.5'], ['38', '39', '24.5'], ['39', '40', '25'], ['40', '41', '26'], ['41', '42', '26.5'], ['42', '43', '27.5']] },
};

function Editor({ chart, onClose, onSaved }) {
  const [name, setName] = useState(chart.name || '');
  const [d, setD] = useState(() => (chart.data ? JSON.parse(chart.data) : { head: ['Размер', 'Обхват груди, см'], rows: [['S', '']], note: '' }));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const setCell = (r, c, v) => setD({ ...d, rows: d.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const save = async () => {
    setSaving(true);
    try {
      const body = { name, data: d };
      if (chart.id) await api('/size-charts/' + chart.id, { method: 'PUT', body }); else await api('/size-charts', { method: 'POST', body });
      toast('Таблица размеров сохранена'); onSaved();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={chart.id ? 'Таблица размеров' : 'Новая таблица размеров'} wide
      footer={<><Button variant="secondary" onClick={onClose}>Отмена</Button><Button onClick={save} loading={saving}>Сохранить</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Название" className="flex-1"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Платья" /></Field>
          {!chart.id && <div className="flex flex-wrap gap-1">{Object.keys(TEMPLATES).map((t) => <Button key={t} size="sm" variant="secondary" onClick={() => { setD({ ...TEMPLATES[t], note: '' }); if (!name) setName(t); }}>{t}</Button>)}</div>}
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead><tr>{d.head.map((h, c) => (
              <th key={c} className="p-1"><div className="flex gap-1"><input className="input w-32 py-1 font-semibold" value={h} onChange={(e) => setD({ ...d, head: d.head.map((x, j) => (j === c ? e.target.value : x)) })} />
                {d.head.length > 1 && <button type="button" onClick={() => setD({ head: d.head.filter((_, j) => j !== c), rows: d.rows.map((r) => r.filter((_, j) => j !== c)), note: d.note })} className="text-slate-400 hover:text-rose-600"><X size={14} /></button>}</div></th>
            ))}<th><Button size="sm" variant="ghost" icon={Plus} onClick={() => setD({ ...d, head: [...d.head, ''], rows: d.rows.map((r) => [...r, '']) })} title="Колонка" /></th></tr></thead>
            <tbody>{d.rows.map((row, r) => (
              <tr key={r}>{row.map((v, c) => <td key={c} className="p-1"><input className="input w-32 py-1" value={v} onChange={(e) => setCell(r, c, e.target.value)} /></td>)}
                <td><button type="button" onClick={() => setD({ ...d, rows: d.rows.filter((_, i) => i !== r) })} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button></td></tr>
            ))}</tbody>
          </table>
        </div>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setD({ ...d, rows: [...d.rows, d.head.map(() => '')] })}>Строка</Button>
        <Field label="Как измерить (подсказка покупателю)"><textarea className="input" rows={2} value={d.note || ''} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Обхват груди — по самым выступающим точкам…" /></Field>
      </div>
    </Modal>
  );
}

export default function SizeCharts() {
  const { data, reload } = useLoad('/size-charts');
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  const remove = async (c) => { if (!confirm(`Удалить таблицу «${c.name}»?`)) return; await api('/size-charts/' + c.id, { method: 'DELETE' }).catch((e) => toast(e.message, 'error')); reload(); };
  return (
    <div className="card mt-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><Ruler size={18} /> Таблицы размеров</h2>
        <Button size="sm" icon={Plus} onClick={() => setEdit({})}>Добавить</Button>
      </div>
      <p className="mb-3 text-sm text-slate-500">Покупатель видит её в карточке товара по ссылке «Таблица размеров». Назначьте таблицу категории (кнопка «изменить» у категории) или конкретному товару.</p>
      <div className="flex flex-wrap gap-2">
        {(data || []).map((c) => (
          <div key={c.id} className="flex items-center gap-1 rounded-xl border border-slate-200 py-1 pr-1 pl-3 text-sm">
            {c.name}
            <button onClick={() => setEdit(c)} className="rounded p-1.5 text-slate-400 hover:text-indigo-600"><Pencil size={14} /></button>
            <button onClick={() => remove(c)} className="rounded p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
          </div>
        ))}
        {data?.length === 0 && <span className="text-sm text-slate-400">Пока нет таблиц</span>}
      </div>
      {edit && <Editor chart={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}
