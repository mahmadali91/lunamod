import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, ImagePlus, Phone, ArrowLeft, CheckCheck, RotateCcw, Loader2, Search, Package } from 'lucide-react';
import { api, getToken, qs } from '../api';
import { Badge, Button, Empty, PageHeader, Spinner, fmtDate, useMoney, useToast } from '../ui';
import PushToggle from '../components/PushToggle';
import { ORDER_STATUS, PAY_STATUS } from './Orders';

const fmtPhone = (p) => (p ? `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}` : '');
const who = (c) => c.name || c.customer?.name || (c.phone ? fmtPhone(c.phone) : `Посетитель #${c.id}`);
const time = (d) => { const x = new Date(d); return x.toDateString() === new Date().toDateString() ? x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };

async function sendMessage(id, text, image) {
  const fd = new FormData();
  if (text) fd.append('text', text);
  if (image) fd.append('image', image);
  const res = await fetch(`/api/chats/${id}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не отправлено');
  return data;
}

function Thread({ id, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const last = useRef(0);
  const box = useRef(null);
  const file = useRef(null);
  const money = useMoney();
  const toast = useToast();

  const load = async (reset) => {
    const r = await api(`/chats/${id}?after=${reset ? 0 : last.current}`);
    if (r.messages.length) last.current = r.messages[r.messages.length - 1].id;
    setData((d) => (reset || !d ? r : { ...r, messages: [...d.messages, ...r.messages.filter((m) => !d.messages.some((x) => x.id === m.id))] }));
    if (r.conversation.unreadAdmin) { await api(`/chats/${id}/read`, { method: 'POST' }); onChanged(); }
  };
  useEffect(() => { last.current = 0; setData(null); load(true); const t = setInterval(() => load(false).catch(() => {}), 4000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [data?.messages.length]);

  const send = async (image) => {
    if (!text.trim() && !image) return;
    setBusy(true);
    try {
      const m = await sendMessage(id, text.trim(), image);
      last.current = Math.max(last.current, m.id);
      setData((d) => ({ ...d, messages: [...d.messages, m] })); setText(''); onChanged();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); send(f); } };
  const setStatus = async (status) => { await api(`/chats/${id}/status`, { method: 'POST', body: { status } }); onChanged(); toast(status === 'closed' ? 'Диалог закрыт' : 'Диалог открыт'); load(true); };

  if (!data) return <Spinner />;
  const c = data.conversation;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"><ArrowLeft size={20} /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{who(c)}</div>
            <div className="text-xs text-slate-500">{c.phone ? <a href={`tel:+${c.phone}`} className="inline-flex items-center gap-1 text-indigo-600"><Phone size={11} />{fmtPhone(c.phone)}</a> : 'не вошёл на сайт — телефон неизвестен'}</div>
          </div>
          {c.status === 'open'
            ? <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => setStatus('closed')}>Закрыть</Button>
            : <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setStatus('open')}>Открыть</Button>}
        </div>
        <div ref={box} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
          {data.messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-end' : ''}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${m.sender === 'admin' ? 'rounded-tr-md bg-indigo-600 text-white' : 'rounded-tl-md bg-white'}`}>
                {m.image && <img src={m.image} alt="" onClick={() => setZoom(m.image)} className="mb-1 max-h-64 cursor-zoom-in rounded-xl" />}
                {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                <div className={`mt-1 text-[10px] ${m.sender === 'admin' ? 'text-indigo-200' : 'text-slate-400'}`}>{fmtDate(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-end gap-2">
            <button onClick={() => file.current.click()} title="Отправить фото или скриншот" className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"><ImagePlus size={20} /></button>
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="Ответ… (Enter — отправить, скриншот можно вставить Ctrl+V)"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="input max-h-32 min-h-[42px] flex-1 resize-none" />
            <Button onClick={() => send()} disabled={!text.trim()} loading={busy} icon={Send} />
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f); }} />
        </div>
      </div>
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-slate-100 p-4 xl:block">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Package size={16} /> Заказы покупателя</h3>
        {data.orders.length === 0 ? <p className="text-sm text-slate-500">{c.phone ? 'Заказов нет' : 'Покупатель не вошёл на сайт — заказы появятся, когда он войдёт по телефону.'}</p> : (
          <div className="space-y-3">
            {data.orders.map((o) => (
              <a key={o.id} href={`/admin/orders?open=${o.id}`} className="block rounded-xl border border-slate-200 p-3 hover:border-indigo-300">
                <div className="flex items-center justify-between text-sm"><b>{o.number}</b><Badge color={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></div>
                <div className="mt-1 text-xs text-slate-500">{fmtDate(o.createdAt, false)} · {money(o.total)} · <span className={o.paymentStatus === 'paid' ? 'text-emerald-600' : ''}>{PAY_STATUS[o.paymentStatus][0]}</span></div>
                <div className="mt-1 text-xs text-slate-500">{o.deliveryName}{o.address ? ': ' + o.address : ''}</div>
                <div className="mt-2 flex gap-1">{o.items.slice(0, 5).map((i) => <div key={i.id} className="h-10 w-10 overflow-hidden rounded-lg bg-slate-100">{i.product.images[0] && <img src={i.product.images[0].path} alt="" className="h-full w-full object-cover" />}</div>)}</div>
              </a>
            ))}
          </div>
        )}
      </aside>
      {zoom && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}
    </div>
  );
}

export default function Chats() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const active = Number(params.get('c')) || null;
  const load = () => api('/chats' + qs({ status, q })).then(setList).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [status, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id) => setParams(id ? { c: String(id) } : {});

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Чаты" subtitle="Сообщения покупателей с сайта"><PushToggle compact /></PageHeader>
      <div className="card flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden">
        <div className={`flex w-full shrink-0 flex-col border-r border-slate-100 lg:w-80 ${active ? 'hidden lg:flex' : 'flex'}`}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex gap-1 text-sm">
              {[['open', 'Открытые'], ['closed', 'Закрытые'], ['all', 'Все']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 ${status === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>)}
            </div>
            <div className="relative"><Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" /><input className="input py-1.5 pl-8" placeholder="Имя, телефон, текст" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!list ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div> : list.length === 0 ? <Empty icon={MessageCircle} title="Сообщений нет" text="Когда покупатель напишет в чат на сайте, диалог появится здесь" /> : list.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${active === c.id ? 'bg-indigo-50' : ''}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600">{who(c)[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className={`truncate text-sm ${c.unreadAdmin ? 'font-bold' : 'font-medium'}`}>{who(c)}</span><span className="shrink-0 text-xs text-slate-400">{time(c.lastMessageAt)}</span></div>
                  <div className="flex justify-between gap-2"><span className="truncate text-xs text-slate-500">{c.lastText}</span>{c.unreadAdmin > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{c.unreadAdmin}</span>}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className={`min-w-0 flex-1 ${active ? 'block' : 'hidden lg:block'}`}>
          {active ? <Thread key={active} id={active} onBack={() => open(null)} onChanged={load} /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Выберите диалог слева</div>}
        </div>
      </div>
    </div>
  );
}
