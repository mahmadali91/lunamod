import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, ImagePlus, Loader2, BellRing } from 'lucide-react';
import { shopToken } from './api';
import { useShop } from './store';

// Ключ посетителя (32 hex) — по нему сервер находит переписку
function visitorKey() {
  try {
    let k = localStorage.getItem('chat_visitor');
    if (!/^[a-f0-9]{32}$/.test(k || '')) { k = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('chat_visitor', k); }
    return k;
  } catch { return null; }
}

async function chatApi(path, { method = 'GET', body, form } = {}) {
  const headers = { 'X-Visitor': visitorKey() };
  const t = shopToken.get(); if (t) headers.Authorization = 'Bearer ' + t;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api/shop' + path, { method, headers, body: form || (body && JSON.stringify(body)) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

const urlB64 = (b) => { const p = '='.repeat((4 - (b.length % 4)) % 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map((c) => c.charCodeAt(0))); };

async function subscribePush(vapidKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidKey) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(vapidKey) }));
  await chatApi('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return true;
}

export default function ChatWidget() {
  const { config, auth } = useShop();
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has('chat'));
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askPush, setAskPush] = useState(false);
  const [zoom, setZoom] = useState(null);
  const last = useRef(0);
  const box = useRef(null);
  const file = useRef(null);

  const load = async (reset) => {
    try {
      const r = await chatApi('/chat?after=' + (reset ? 0 : last.current));
      if (r.messages.length) {
        last.current = r.messages[r.messages.length - 1].id;
        setMsgs((m) => (reset ? r.messages : [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]));
      }
      setUnread(r.conversation?.unread || 0);
    } catch { /* нет сети — попробуем позже */ }
  };
  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // открыт — проверяем часто, закрыт — редко (для значка непрочитанных)
  useEffect(() => { const t = setInterval(() => load(false), open ? 4000 : 30000); return () => clearInterval(t); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && unread) { chatApi('/chat/read', { method: 'POST' }).catch(() => {}); setUnread(0); } }, [open, unread]);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [msgs, open]);

  const send = async (image) => {
    if (!text.trim() && !image) return;
    setBusy(true); setError('');
    try {
      let msg;
      if (image) { const fd = new FormData(); fd.append('image', image); if (text.trim()) fd.append('text', text); if (name) fd.append('name', name); msg = await chatApi('/chat', { method: 'POST', form: fd }); }
      else msg = await chatApi('/chat', { method: 'POST', body: { text, name } });
      last.current = Math.max(last.current, msg.id);
      setMsgs((m) => [...m, msg]); setText('');
      if (msgs.length === 0 && 'Notification' in window && Notification.permission === 'default') setAskPush(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); send(f); } };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Чат с магазином" className="fixed right-4 bottom-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl hover:bg-slate-800">
          <MessageCircle size={26} />
          {unread > 0 && <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold">{unread}</span>}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[560px] sm:w-[380px] sm:rounded-3xl sm:shadow-2xl sm:ring-1 sm:ring-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white"><MessageCircle size={20} /></div>
            <div className="flex-1"><div className="font-semibold">{config.title}</div><div className="text-xs text-slate-500">Обычно отвечаем в течение дня</div></div>
            <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-slate-100" aria-label="Закрыть"><X size={20} /></button>
          </div>
          <div ref={box} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm shadow-sm">{config.chat.greeting}</div>
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-end' : ''}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${m.sender === 'customer' ? 'rounded-tr-md bg-slate-900 text-white' : 'rounded-tl-md bg-white'}`}>
                  {m.image && <img src={m.image} alt="" onClick={() => setZoom(m.image)} className="mb-1 max-h-60 cursor-zoom-in rounded-xl" />}
                  {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                  <div className={`mt-1 text-[10px] ${m.sender === 'customer' ? 'text-slate-400' : 'text-slate-400'}`}>{new Date(m.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
          </div>
          {askPush && (
            <div className="flex items-center gap-2 border-t border-slate-100 bg-indigo-50 px-4 py-2 text-xs">
              <BellRing size={16} className="shrink-0 text-indigo-600" /><span className="flex-1">Сообщить вам, когда магазин ответит?</span>
              <button className="font-semibold text-indigo-700" onClick={async () => { setAskPush(false); await subscribePush(config.vapidKey).catch(() => {}); }}>Да</button>
              <button className="text-slate-500" onClick={() => setAskPush(false)}>Нет</button>
            </div>
          )}
          <div className="border-t border-slate-100 p-3">
            {!auth.me && msgs.length === 0 && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться?" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900" />}
            {error && <div className="mb-2 text-xs text-rose-600">{error}</div>}
            <div className="flex items-end gap-2">
              <button onClick={() => file.current.click()} className="rounded-full p-2.5 text-slate-500 hover:bg-slate-100" title="Прикрепить фото или скриншот" aria-label="Прикрепить фото"><ImagePlus size={20} /></button>
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="Сообщение…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="max-h-28 flex-1 resize-none rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none" />
              <button onClick={() => send()} disabled={busy || !text.trim()} className="rounded-full bg-slate-900 p-2.5 text-white disabled:opacity-40" aria-label="Отправить">{busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}</button>
            </div>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f); }} />
          </div>
        </div>
      )}
      {zoom && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}
    </>
  );
}
