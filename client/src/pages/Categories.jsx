import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderTree, Pencil, Plus, Trash2, Search, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { Button, Empty, Field, Modal, PageHeader, Spinner, Thumb, fmtNum, useLoad, useToast } from '../ui';
import SizeCharts from '../components/SizeCharts';

export default function Categories() {
  const { data, reload } = useLoad('/categories');
  const { data: charts } = useLoad('/size-charts');
  const [edit, setEdit] = useState(null); // { id?, name }
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: edit.name, sizeChartId: edit.sizeChartId || null };
      if (edit.id) await api('/categories/' + edit.id, { method: 'PUT', body });
      else await api('/categories', { method: 'POST', body });
      toast(edit.id ? 'Категория сохранена' : 'Категория добавлена'); setEdit(null); reload();
    } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  const remove = async (c) => {
    const n = c._count.products;
    if (!confirm(n ? `Удалить категорию «${c.name}»? ${n} товаров останутся без категории.` : `Удалить категорию «${c.name}»?`)) return;
    try { await api('/categories/' + c.id, { method: 'DELETE' }); toast('Категория удалена'); reload(); } catch (err) { toast(err.message, 'error'); }
  };

  const list = (data || []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const total = (data || []).reduce((a, c) => a + c._count.products, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Категории" subtitle={data ? `${data.length} категорий · ${fmtNum(total)} товаров` : ''}>
        <Button icon={Plus} onClick={() => setEdit({ name: '' })}>Добавить категорию</Button>
      </PageHeader>
      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-md">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Поиск категории" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!data ? <Spinner /> : list.length === 0 ? (
          <Empty icon={FolderTree} title="Категорий нет" text="Добавьте категорию — потом выберите её в карточке товара"><Button icon={Plus} onClick={() => setEdit({ name: '' })}>Добавить</Button></Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/70">
                <Thumb src={c.products[0]?.images[0]?.path} size={48} />
                <div className="min-w-0 flex-1">
                  <Link to={`/products?category=${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{c.name}</Link>
                  <div className="text-sm text-slate-500">{c._count.products ? `${fmtNum(c._count.products)} товаров` : 'Нет товаров'}</div>
                </div>
                <div className="hidden w-48 sm:block">
                  <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${total ? (c._count.products / Math.max(...data.map((x) => x._count.products))) * 100 : 0}%` }} /></div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link to={`/products?category=${c.id}`} title="Открыть товары" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><ArrowRight size={16} /></Link>
                  <button onClick={() => setEdit({ id: c.id, name: c.name, sizeChartId: c.sizeChartId })} title="Изменить" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><Pencil size={16} /></button>
                  <button onClick={() => remove(c)} title="Удалить" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Категория' : 'Новая категория'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Отмена</Button><Button form="cat-form" type="submit" loading={saving}>Сохранить</Button></>}>
        {edit && <form id="cat-form" onSubmit={save} className="space-y-4"><Field label="Название"><input className="input" autoFocus required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Таблица размеров для товаров категории"><select className="input" value={edit.sizeChartId || ''} onChange={(e) => setEdit({ ...edit, sizeChartId: e.target.value ? Number(e.target.value) : null })}><option value="">— нет —</option>{(charts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></form>}
      </Modal>
      <SizeCharts />
    </div>
  );
}
