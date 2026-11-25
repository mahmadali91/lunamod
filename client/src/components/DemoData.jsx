import { useEffect, useState } from 'react';
import { Database, Trash2, Loader2 } from 'lucide-react';
import { api } from '../api';
import { Button, useToast } from '../ui';

/** Настройки → демо-данные: загрузка в фоне с прогрессом и удаление одной кнопкой */
export default function DemoData() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = () => api('/admin/demo').then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (st?.state !== 'running') return;
    const t = setTimeout(load, 1000);
    return () => clearTimeout(t);
  }, [st]);

  const start = async () => {
    if (!confirm('Загрузить демо-данные? Будут добавлены 20 категорий, 100 товаров, продажи и реализация за год. Потом их можно удалить одной кнопкой.')) return;
    setBusy(true);
    try { await api('/admin/demo', { method: 'POST', body: {} }); await load(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Удалить все демо-данные? Ваши собственные товары и продажи останутся.')) return;
    setBusy(true);
    try { await api('/admin/demo', { method: 'DELETE' }); toast('Демо-данные удалены'); await load(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!st) return null;
  const running = st.state === 'running';
  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Database size={18} /> Демо-данные</h2>
      <p className="mb-4 text-sm text-slate-500">20 категорий одежды, 100 товаров с изображениями, продажи за год по всем каналам, реализация с долгами и оплатами — чтобы посмотреть, как работает программа. Демо-данные удаляются одной кнопкой, ваши данные при этом не затрагиваются.</p>
      {running && (
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2 text-sm text-slate-600"><Loader2 size={14} className="animate-spin" /> {st.step}… {st.progress || 0}%</div>
          <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-indigo-600 transition-all" style={{ width: `${st.progress || 0}%` }} /></div>
        </div>
      )}
      {st.state === 'done' && st.summary && st.loaded && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Загружено: {st.summary.products} товаров в {st.summary.categories} категориях, {st.summary.sales} продаж, из них {st.summary.consignments} под реализацию.</p>
      )}
      {st.state === 'error' && <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Ошибка загрузки: {st.error}. Нажмите «Удалить демо-данные» и попробуйте снова.</p>}
      {st.loaded || st.state === 'error'
        ? <Button variant="secondary" icon={Trash2} loading={busy} disabled={running} onClick={remove} className="text-rose-600">Удалить демо-данные</Button>
        : <Button icon={Database} loading={busy || running} onClick={start}>Загрузить демо-данные</Button>}
    </div>
  );
}
