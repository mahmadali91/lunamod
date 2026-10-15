import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, KeyRound, CheckCircle2, AlertTriangle, Loader2, ShieldCheck, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { Button, Field, PageHeader, Spinner, useToast } from '../ui';

export default function Wildberries() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const load = () => api('/wb').then(setD).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const running = d?.status.state === 'running';
  useEffect(() => { if (!running) return; const t = setInterval(load, 2500); return () => clearInterval(t); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api('/wb/token', { method: 'PUT', body: { token } }); setToken(''); toast('Токен проверен и сохранён'); load(); } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  const start = async (photos) => { try { await api('/wb/import', { method: 'POST', body: { photos } }); load(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async () => { if (!confirm('Отключить Wildberries? Токен будет удалён с сервера, загруженные товары останутся.')) return; await api('/wb/token', { method: 'PUT', body: { token: '' } }); load(); };
  if (!d) return <Spinner />;
  const r = d.status.report;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Wildberries" subtitle="Загрузка карточек из кабинета продавца: модели, цвета, размеры, баркоды, цены, характеристики, фото и видео" />

      <div className="card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><KeyRound size={18} /> Токен API</h2>
        {d.connected ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><CheckCircle2 size={18} className="text-emerald-500" /> Подключено · <span className="font-mono text-slate-500">{d.token}</span>
              {d.info?.readOnly && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">только чтение</span>}</div>
            {d.info && <p className="text-slate-500">Доступ: {d.info.scopes.join(', ')}. Действует до {new Date(d.info.expires).toLocaleDateString('ru-RU')}.</p>}
            <p className="flex items-start gap-1.5 text-xs text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Токен хранится только на сервере и не показывается в админке. Заменить — вставьте новый ниже.</p>
          </div>
        ) : <p className="text-sm text-slate-500">Кабинет WB → профиль → Настройки → <b>Доступ к API</b> → «Создать новый токен». Отметьте «Контент» и «Цены и скидки» (для загрузки достаточно «Только на чтение»).</p>}
        <form onSubmit={save} className="mt-4 flex flex-wrap gap-2">
          <input className="input min-w-0 flex-1 font-mono text-xs" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={d.connected ? 'Новый токен (заменит текущий)' : 'Вставьте токен'} />
          <Button type="submit" loading={saving} disabled={!token.trim()}>Проверить и сохранить</Button>
          {d.connected && <Button type="button" variant="ghost" onClick={remove} className="text-rose-600">Отключить</Button>}
        </form>
      </div>

      {d.connected && (
        <div className="card p-6">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Download size={18} /> Загрузка карточек</h2>
          <p className="mb-4 text-sm text-slate-500">
            Модель WB → модель (объединённая карточка), каждый цвет — карточка со своим артикулом продавца и артикулом WB, внутри — размеры (размер продавца и рос. размер) со штрихкодами WB и ценой со скидкой.
            Карточки, загруженные раньше, обновляются (поиск по артикулу WB, затем по артикулу продавца). Остатки и закупочные цены в нашем учёте не меняются.
          </p>
          <p className="mb-4 text-sm">Связано сейчас: <b>{d.linked.cards}</b> карточек, <b>{d.linked.models}</b> моделей{d.linked.cards > 0 && <> · <Link to="/products" className="text-indigo-600 underline">открыть товары</Link></>}</p>
          {running ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />{d.status.step}</span><span>{d.status.progress || 0}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-fuchsia-600 transition-all" style={{ width: (d.status.progress || 0) + '%' }} /></div>
              <p className="mt-2 text-xs text-slate-500">Фото скачиваются на наш сервер — это может занять несколько минут. Страницу можно закрыть.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button icon={Download} onClick={() => start('missing')}>{d.linked.cards ? 'Обновить из Wildberries' : 'Загрузить карточки'}</Button>
              {d.linked.cards > 0 && <Button variant="secondary" onClick={() => start('all')}>Обновить и перекачать все фото</Button>}
            </div>
          )}
          {d.status.state === 'error' && <p className="mt-4 flex items-center gap-2 text-sm text-rose-600"><AlertTriangle size={16} /> {d.status.error}</p>}
          {d.status.state === 'done' && r && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="font-medium">Последняя загрузка: {new Date(d.status.at).toLocaleString('ru-RU')}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[['Моделей', r.models], ['Карточек', r.cards], ['Новых', r.created], ['Обновлено', r.updated], ['Размеров', r.sizes], ['Фото скачано', r.photos], ['Видео', r.videos]].map(([l, v]) => <div key={l}><div className="text-xs text-slate-500">{l}</div><div className="text-lg font-semibold">{v}</div></div>)}
              </div>
              {r.warnings.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-amber-700">Предупреждения: {r.warnings.length}</summary><ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-400">Документация API: <a className="underline" href="https://dev.wildberries.ru" target="_blank" rel="noreferrer">dev.wildberries.ru <ExternalLink size={11} className="inline" /></a>. Следующие шаги: остатки на складах WB, продажи WB в статистике, выгрузка цен.</p>
    </div>
  );
}
