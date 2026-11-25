import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Warehouse, Radio, Users } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, Button, Empty, Field, Modal, PageHeader, Spinner, fmtDate, useLoad, useToast } from '../ui';

// Палитра для каналов (проверенная на различимость, в т.ч. для дальтоников)
const CHANNEL_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

/** Универсальная страница справочника: таблица + форма в модальном окне */
function RefPage({ title, subtitle, path, icon, fields, columns, defaults, searchable, filters }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const { data, reload } = useLoad(path + qs({ q, type }));
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (edit.id) await api(`${path}/${edit.id}`, { method: 'PUT', body: edit });
      else await api(path, { method: 'POST', body: edit });
      toast('Сохранено'); setEdit(null); reload();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const remove = async (row) => {
    if (!confirm(`Удалить «${row.name}»?`)) return;
    try { await api(`${path}/${row.id}`, { method: 'DELETE' }); toast('Удалено'); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={title} subtitle={subtitle}><Button icon={Plus} onClick={() => setEdit({ ...defaults })}>Добавить</Button></PageHeader>
      <div className="card">
        {(searchable || filters) && (
          <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
            {searchable && (
              <div className="relative min-w-60 flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            )}
            {filters && (
              <select className="input w-48" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Все типы</option>
                {filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
          </div>
        )}
        {!data ? <Spinner /> : data.length === 0 ? (
          <Empty icon={icon} title="Пока пусто" text="Добавьте первую запись"><Button icon={Plus} onClick={() => setEdit({ ...defaults })}>Добавить</Button></Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr>{columns.map((c) => <th key={c.label} className="th">{c.label}</th>)}<th className="th w-24" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    {columns.map((c) => <td key={c.label} className="td">{c.render(row)}</td>)}
                    <td className="td text-right whitespace-nowrap">
                      <button onClick={() => setEdit({ ...row })} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil size={16} /></button>
                      <button onClick={() => remove(row)} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Редактирование' : 'Новая запись'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Отмена</Button><Button form="ref-form" type="submit" loading={saving}>Сохранить</Button></>}>
        {edit && (
          <form id="ref-form" onSubmit={save} className="grid grid-cols-2 gap-4">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} className={f.half ? '' : 'col-span-2'}>
                {f.render ? f.render(edit[f.key], (v) => setEdit({ ...edit, [f.key]: v })) :
                  f.options ? (
                    <select className="input" value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  ) : f.textarea ? (
                    <textarea className="input" rows={3} value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                  ) : f.checkbox ? (
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.checked })} /> {f.checkbox}</label>
                  ) : (
                    <input className="input" required={f.required} autoFocus={f.key === 'name'} value={edit[f.key] ?? ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                  )}
              </Field>
            ))}
          </form>
        )}
      </Modal>
    </div>
  );
}

const active = (r) => (r.active ? <Badge color="green">Активен</Badge> : <Badge>Отключён</Badge>);

export function Warehouses() {
  return (
    <RefPage title="Склады" subtitle="Места хранения товара" path="/warehouses" icon={Warehouse} defaults={{ active: true }}
      fields={[{ key: 'name', label: 'Название *', required: true }, { key: 'address', label: 'Адрес' }, { key: 'note', label: 'Примечание', textarea: true }, { key: 'active', label: '', checkbox: 'Активен' }]}
      columns={[
        { label: 'Название', render: (r) => <span className="font-medium">{r.name}</span> },
        { label: 'Адрес', render: (r) => r.address || '—' },
        { label: 'Товаров', render: (r) => r._count?.stocks ?? 0 },
        { label: 'Статус', render: active },
      ]} />
  );
}

const channelTypes = [['retail', 'Розница'], ['online', 'Интернет / соцсети'], ['marketplace', 'Маркетплейс'], ['wholesale', 'Опт'], ['other', 'Другое']];
export function Channels() {
  return (
    <RefPage title="Каналы продаж" subtitle="Откуда приходят продажи" path="/channels" icon={Radio} defaults={{ active: true, type: 'retail', color: CHANNEL_COLORS[0] }}
      fields={[
        { key: 'name', label: 'Название *', required: true },
        { key: 'type', label: 'Тип', options: channelTypes, half: true },
        { key: 'color', label: 'Цвет на графиках', half: true, render: (v, set) => (
          <div className="flex flex-wrap gap-2 pt-1">{CHANNEL_COLORS.map((c) => <button type="button" key={c} onClick={() => set(c)} className={`h-7 w-7 rounded-full ring-offset-2 ${v === c ? 'ring-2 ring-slate-900' : ''}`} style={{ background: c }} />)}</div>
        ) },
        { key: 'active', label: '', checkbox: 'Активен' },
      ]}
      columns={[
        { label: 'Название', render: (r) => <span className="inline-flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.name}</span> },
        { label: 'Тип', render: (r) => channelTypes.find((t) => t[0] === r.type)?.[1] },
        { label: 'Статус', render: active },
      ]} />
  );
}

const cpTypes = [['customer', 'Покупатель'], ['supplier', 'Поставщик'], ['both', 'Покупатель и поставщик']];
export function Counterparties() {
  return (
    <RefPage title="Контрагенты" subtitle="Покупатели и поставщики" path="/counterparties" icon={Users} searchable filters={cpTypes} defaults={{ type: 'customer' }}
      fields={[
        { key: 'name', label: 'Наименование / ФИО *', required: true },
        { key: 'type', label: 'Тип', options: cpTypes, half: true },
        { key: 'inn', label: 'ИНН / БИН', half: true },
        { key: 'phone', label: 'Телефон', half: true },
        { key: 'email', label: 'Email', half: true },
        { key: 'address', label: 'Адрес' },
        { key: 'note', label: 'Примечание', textarea: true },
      ]}
      columns={[
        { label: 'Наименование', render: (r) => <span className="font-medium">{r.name}</span> },
        { label: 'Тип', render: (r) => <Badge color={r.type === 'supplier' ? 'amber' : r.type === 'both' ? 'indigo' : 'blue'}>{cpTypes.find((t) => t[0] === r.type)?.[1]}</Badge> },
        { label: 'Телефон', render: (r) => r.phone || '—' },
        { label: 'ИНН', render: (r) => r.inn || '—' },
        { label: 'Добавлен', render: (r) => <span className="text-slate-500">{fmtDate(r.createdAt, false)}</span> },
      ]} />
  );
}
