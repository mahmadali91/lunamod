import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Check, X, Trash2, MessageSquareReply, BadgeCheck } from 'lucide-react';
import { api } from '../api';
import { Badge, Button, Empty, PageHeader, Spinner, Thumb, fmtDate, useLoad, useToast } from '../ui';

const TABS = [['pending', 'На проверке'], ['published', 'Опубликованы'], ['rejected', 'Отклонены'], ['', 'Все']];
const FIT = { small: 'маломерит', ok: 'в размер', large: 'большемерит' };

function Item({ r, onChanged }) {
  const toast = useToast();
  const [reply, setReply] = useState(r.reply || '');
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(null);
  const put = async (body, msg) => { try { await api('/reviews/' + r.id, { method: 'PUT', body }); toast(msg); onChanged(); } catch (e) { toast(e.message, 'error'); } };
  const remove = async () => { if (!confirm('Удалить отзыв навсегда?')) return; await api('/reviews/' + r.id, { method: 'DELETE' }); toast('Отзыв удалён'); onChanged(); };
  return (
    <div className="flex gap-4 p-4">
      <Link to={`/products/${r.product.id}`}><Thumb src={r.product.images[0]?.path} size={56} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to={`/products/${r.product.id}`} className="font-medium hover:text-indigo-600">{r.product.name}</Link>
          <span className="flex text-amber-500" aria-label={`${r.rating} из 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} fill={r.rating >= i ? 'currentColor' : 'none'} className={r.rating >= i ? '' : 'text-slate-300'} />)}</span>
          {r.status === 'pending' && <Badge color="amber">на проверке</Badge>}{r.status === 'rejected' && <Badge color="red">отклонён</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {r.customer.name || 'Покупатель'} · +{r.customer.phone} · {fmtDate(r.createdAt)}
          {r.purchased && <span className="ml-2 inline-flex items-center gap-0.5 text-emerald-700"><BadgeCheck size={13} /> покупал</span>}
          {r.size && <> · размер {r.size}</>}{r.fit && <> · {FIT[r.fit]}</>}
        </div>
        {r.text && <p className="mt-2 text-sm whitespace-pre-line">{r.text}</p>}
        {r.photos.length > 0 && <div className="mt-2 flex gap-2">{r.photos.map((p) => <button key={p} onClick={() => setZoom(p)} className="h-16 w-16 overflow-hidden rounded-lg"><img src={p} alt="" className="h-full w-full object-cover" /></button>)}</div>}
        {r.reply && !open && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm"><b>Ответ магазина:</b> {r.reply}</div>}
        {open && (
          <div className="mt-2 flex gap-2">
            <textarea className="input min-h-[60px] flex-1" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ответ увидят все покупатели" />
            <Button size="sm" onClick={() => { put({ reply }, 'Ответ сохранён'); setOpen(false); }}>Сохранить</Button>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {r.status !== 'published' && <Button size="sm" icon={Check} onClick={() => put({ status: 'published' }, 'Отзыв опубликован')}>Опубликовать</Button>}
          {r.status !== 'rejected' && <Button size="sm" variant="secondary" icon={X} onClick={() => put({ status: 'rejected' }, 'Отзыв отклонён')}>Отклонить</Button>}
          <Button size="sm" variant="ghost" icon={MessageSquareReply} onClick={() => setOpen(!open)}>{r.reply ? 'Изменить ответ' : 'Ответить'}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600">Удалить</Button>
        </div>
      </div>
      {zoom && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}
    </div>
  );
}

export default function Reviews() {
  const [tab, setTab] = useState('pending');
  const { data, reload } = useLoad('/reviews' + (tab ? '?status=' + tab : ''));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Отзывы" subtitle="Отзывы покупателей из интернет-магазина. Публикуются после вашей проверки." />
      <div className="card">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 p-3">
          {TABS.map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === v ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}{v && data?.counts?.[v] ? ` · ${data.counts[v]}` : ''}</button>)}
        </div>
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={Star} title="Отзывов нет" text={tab === 'pending' ? 'Новые отзывы появятся здесь — придёт уведомление' : ''} />
          : <div className="divide-y divide-slate-100">{data.items.map((r) => <Item key={r.id} r={r} onChanged={reload} />)}</div>}
      </div>
    </div>
  );
}
