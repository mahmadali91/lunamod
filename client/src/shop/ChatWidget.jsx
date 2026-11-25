import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, ImagePlus, Loader2, BellRing, LogIn, Timer } from 'lucide-react';
import { shopToken } from './api';
import { useShop } from './store';
import { VoicePlayer, VoiceRecorder } from '../components/Voice';
import { subscribePush } from './push';

// Чат доступен только вошедшим покупателям: переписка хранится в аккаунте и видна на любом устройстве
async function chatApi(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = shopToken.get(); if (t) headers.Authorization = 'Bearer ' + t;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api/shop' + path, { method, headers, body: form || (body && JSON.stringify(body)) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Ошибка'), { status: res.status, retryAfter: data.retryAfter });
  return data;
}

const timeOf = (d) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ChatWidget() {
  const { config, auth } = useShop();
  const me = auth.me;
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has('chat'));
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askPush, setAskPush] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [wait, setWait] = useState(0); // антиспам: сколько секунд до следующего сообщения
  const last = useRef(0);
  const box = useRef(null);
  const file = useRef(null);

  const load = async (reset) => {
    if (!shopToken.get()) return;
    try {
      const r = await chatApi('/chat?after=' + (reset ? 0 : last.current));
      if (reset) { setMsgs(r.messages); last.current = r.messages.at(-1)?.id || 0; } else if (r.messages.length) {
        last.current = r.messages.at(-1).id;
        setMsgs((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
      }
      setUnread(r.conversation?.unread || 0);
      if (reset && r.cooldown) setWait(r.cooldown);
    } catch { /* нет сети — попробуем позже */ }
  };
  // вошёл/вышел — загружаем свою историю заново
  useEffect(() => { setMsgs([]); last.current = 0; setUnread(0); if (me) load(true); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // открыт — проверяем часто, закрыт — редко (для значка непрочитанных)
  useEffect(() => { if (!me) return; const t = setInterval(() => load(false), open ? 4000 : 30000); return () => clearInterval(t); }, [open, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && unread) { chatApi('/chat/read', { method: 'POST' }).catch(() => {}); setUnread(0); } }, [open, unread]);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [msgs, open]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const post = async (fd, json) => {
    setBusy(true); setError('');
    try {
      const msg = await chatApi('/chat', fd ? { method: 'POST', form: fd } : { method: 'POST', body: json });
      last.current = Math.max(last.current, msg.id);
      setMsgs((m) => [...m, msg]);
      setWait(msg.cooldown || 10);
      if (msgs.length === 0 && 'Notification' in window && Notification.permission === 'default') setAskPush(true);
      return true;
    } catch (e) {
      if (e.retryAfter) setWait(e.retryAfter);
      if (e.status === 401) auth.logout();
      setError(e.message);
      return false;
    } finally { setBusy(false); }
  };
  const send = async (image) => {
    if ((!text.trim() && !image) || wait > 0) return;
    let ok;
    if (image) { const fd = new FormData(); fd.append('image', image); if (text.trim()) fd.append('text', text); ok = await post(fd); }
    else ok = await post(null, { text });
    if (ok) setText('');
  };
  const sendVoice = async (blob, sec) => {
    if (wait > 0) return false;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const fd = new FormData(); fd.append('audio', blob, 'voice.' + ext); fd.append('duration', String(sec));
    return post(fd);
  };
  const onPaste = (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); send(f); } };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Чат с магазином" className="fixed right-4 bottom-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl hover:bg-slate-800">
          <MessageCircle size={26} />
          {unread > 0 && <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{unread}</span>}
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Чат с магазином" className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[560px] sm:w-[380px] sm:rounded-3xl sm:shadow-2xl sm:ring-1 sm:ring-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white"><MessageCircle size={20} /></div>
            <div className="flex-1"><div className="font-semibold">{config.title}</div><div className="text-xs text-slate-500">Обычно отвечаем в течение дня</div></div>
            <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-slate-100" aria-label="Закрыть"><X size={20} /></button>
          </div>

          {!me ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm"><MessageCircle size={30} className="text-slate-700" /></div>
              <div>
                <div className="text-lg font-semibold">Войдите, чтобы написать нам</div>
                <p className="mt-1 text-sm text-slate-500">Вход по номеру телефона за минуту. Переписка сохранится в вашем профиле — продолжить её можно с любого устройства, а мы сразу увидим ваши заказы.</p>
              </div>
              <button onClick={() => auth.require(() => {})} className="flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800"><LogIn size={18} /> Войти по телефону</button>
              {config.phone && <a href={`tel:${config.phone}`} className="text-sm text-slate-500 underline">или позвоните: {config.phone}</a>}
            </div>
          ) : (
            <>
              <div ref={box} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm shadow-sm">{config.chat.greeting}</div>
                {msgs.map((m) => {
                  const mine = m.sender === 'customer';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : ''}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? 'rounded-tr-md bg-slate-900 text-white' : 'rounded-tl-md bg-white'}`}>
                        {m.image && <img src={m.image} alt="Фото в чате" onClick={() => setZoom(m.image)} className="mb-1 max-h-60 cursor-zoom-in rounded-xl" />}
                        {m.audio && <VoicePlayer src={m.audio} duration={m.duration} dark={mine} />}
                        {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                        <div className="mt-1 text-[10px] text-slate-400">{timeOf(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {askPush && (
                <div className="flex items-center gap-2 border-t border-slate-100 bg-indigo-50 px-4 py-2 text-xs">
                  <BellRing size={16} className="shrink-0 text-indigo-600" /><span className="flex-1">Сообщить вам, когда магазин ответит?</span>
                  <button className="font-semibold text-indigo-700" onClick={async () => { setAskPush(false); await subscribePush(config.vapidKey).catch(() => {}); }}>Да</button>
                  <button className="text-slate-500" onClick={() => setAskPush(false)}>Нет</button>
                </div>
              )}
              <div className="border-t border-slate-100 p-3">
                {error && !wait && <div className="mb-2 text-xs text-rose-600">{error}</div>}
                {wait > 0 && <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500"><Timer size={14} /> Следующее сообщение можно отправить через {wait} с</div>}
                <div className="relative flex items-end gap-1">
                  <button onClick={() => file.current.click()} disabled={wait > 0} className="rounded-full p-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" title="Прикрепить фото или скриншот" aria-label="Прикрепить фото"><ImagePlus size={20} /></button>
                  <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="Сообщение…" maxLength={4000}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    className="max-h-28 flex-1 resize-none rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none" />
                  {text.trim()
                    ? <button onClick={() => send()} disabled={busy || wait > 0} className="rounded-full bg-slate-900 p-2.5 text-white disabled:opacity-40" aria-label="Отправить">{busy ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}</button>
                    : <VoiceRecorder onSend={sendVoice} disabled={busy || wait > 0} onError={setError} />}
                </div>
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) send(f); }} />
              </div>
            </>
          )}
        </div>
      )}
      {zoom && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="" className="max-h-full max-w-full rounded-xl" /></div>}
    </>
  );
}
