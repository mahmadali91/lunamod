import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LogOut, Package, MessageCircle, UserRound, Upload, BadgeCheck, Mail, Loader2 } from 'lucide-react';
import { shopApi, shopToken, fmtPhone } from '../api';
import { useShop } from '../store';
import { STATUS, PAY } from './Order';
import Img from '../Img';


// Телефон: в состоянии храним только цифры, показываем маской.
// Так курсор не «залипает» на дефисах и удаление работает в любом месте.
function digitsPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  return d.slice(0, 11);
}
function formatPhone(digits) {
  const d = digitsPhone(digits);
  if (!d) return '';
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' (' + p.slice(0, 3);
  if (p.length >= 3) out += ') ' + p.slice(3, 6);
  if (p.length >= 6) out += '-' + p.slice(6, 8);
  if (p.length >= 8) out += '-' + p.slice(8, 10);
  return out;
}
// позиция курсора после n-й цифры в отформатированной строке
function caretAfterDigits(formatted, n) {
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (seen >= n) return i;
    if (/\d/.test(formatted[i])) seen++;
  }
  return formatted.length;
}

const inputCls = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900';

export default function Account() {
  const { auth, money, notify, config } = useShop();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visits, setVisits] = useState(null);
  const [chats, setChats] = useState(null);
  const [chatMore, setChatMore] = useState(false);
  const [emailStep, setEmailStep] = useState(null); // { email, sent, code }
  const [uploading, setUploading] = useState(false);
  const [emailEdit, setEmailEdit] = useState(false);
  const fileRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => {
    if (!auth.me) return;
    shopApi('/orders').then(setOrders).catch(() => setOrders([]));
    shopApi('/me/visits').then(setVisits).catch(() => {});
    setF({
      name: auth.me.name || '', email: auth.me.email || '', address: auth.me.address || '',
      phone: digitsPhone(auth.me.phone || ''),
      marketingPush: auth.me.marketingPush !== false,
    });
  }, [auth.me]);
  if (!auth.me) {
    // токен есть, профиль ещё грузится — не выкидываем на главную
    if (shopToken.get()) return <div className="mx-auto max-w-5xl px-4 pt-16 text-center text-slate-400">Загрузка кабинета…</div>;
    return <Navigate to="/" replace />;
  }

  const saveProfile = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const body = { ...f };
      if (body.email !== (auth.me.email || '')) delete body.email; // email меняется только через подтверждение
      await shopApi('/me', { method: 'PUT', body });
      await auth.refresh();
      notify('Профиль сохранён');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };

  const toggleMarketing = async (key, value) => {
    setF((s) => ({ ...s, [key]: value }));
    try { await shopApi('/me', { method: 'PUT', body: { [key]: value } }); await auth.refresh(); } catch (err) { notify(err.message, 'error'); }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await shopApi('/me/avatar', { method: 'POST', body: fd });
      await auth.refresh();
      notify('Фото обновлено');
    } catch (err) { notify(err.message, 'error'); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeAvatar = async () => {
    try { await shopApi('/me/avatar', { method: 'DELETE' }); await auth.refresh(); notify('Фото удалено'); } catch (err) { notify(err.message, 'error'); }
  };

  const requestEmail = async () => {
    try {
      const r = await shopApi('/me/email/request-code', { method: 'POST', body: { email: (emailStep?.email || f.email || '').trim().toLowerCase() } });
      setEmailStep({ email: r.email, sent: true, code: '', via: r.channel, test: r.testCode || null });
      notify('Код отправлен на email');
    } catch (err) { notify(err.message, 'error'); }
  };
  const verifyEmail = async () => {
    try {
      await shopApi('/me/email/verify', { method: 'POST', body: { email: emailStep.email, code: emailStep.code } });
      setEmailStep(null);
      setEmailEdit(false);
      await auth.refresh();
      notify('Email подтверждён');
    } catch (err) { notify(err.message, 'error'); }
  };


  const loadChats = async (before) => {
    try {
      const r = await shopApi('/chat/history' + (before ? `?before=${before}` : ''));
      setChats((cur) => ({ messages: before ? [...r.messages, ...(cur?.messages || [])] : r.messages, hasMore: r.hasMore }));
    } catch { setChats({ messages: [], hasMore: false }); }
  };
  const emailVerified = Boolean(auth.me.emailVerifiedAt);
  const emailDraft = emailStep?.email ?? (f?.email || '');

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-100">
            {auth.me.avatar ? <Img src={auth.me.avatar} icon={20} /> : <div className="flex h-full items-center justify-center text-slate-300"><UserRound size={24} /></div>}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Личный кабинет</h1>
            <p className="text-sm text-slate-500">{auth.me.name || 'Покупатель'} · {fmtPhone(auth.me.phone) || 'телефон не указан'}</p>
          </div>
        </div>
        <button onClick={auth.logout} className="flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm"><LogOut size={16} /> Выйти</button>
      </div>

      <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1 text-sm">
        {[['orders', 'Мои заказы', Package], ['chats', 'Чаты', MessageCircle], ['profile', 'Профиль', UserRound]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setTab(id); if (id === 'chats' && !chats) loadChats(0); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 ${tab === id ? 'bg-white font-semibold shadow' : 'text-slate-600'}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-3">
          {!orders ? <div className="text-slate-400">Загрузка…</div> : orders.length === 0 ? (
            <div className="rounded-3xl bg-slate-50 p-10 text-center"><Package className="mx-auto text-slate-300" size={40} /><p className="mt-3 text-slate-500">Заказов пока нет</p><Link to="/" className="mt-4 inline-block underline">В каталог</Link></div>
          ) : orders.map((o) => (
            <Link key={o.id} to={`/order/${o.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:border-slate-400">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Заказ {o.number}</div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
              </div>
              <div className="mt-1 text-sm text-slate-500">{new Date(o.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {o.items.length} поз. · <b className="text-slate-900">{money(o.total)}</b> · {PAY[o.paymentStatus]}</div>
              <div className="mt-3 flex gap-2">{o.items.slice(0, 5).map((i) => <div key={i.id} className="h-14 w-11 overflow-hidden rounded-lg bg-slate-100"><Img src={i.product.images[0]?.path} icon={16} /></div>)}</div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'chats' && (
        <div className="rounded-3xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Переписка с поддержкой</h2>
            <button onClick={() => { setChats(null); loadChats(0); }} className="text-sm text-slate-500 underline">Обновить</button>
          </div>
          {!chats ? <div className="text-slate-400">Загрузка…</div> : chats.messages.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Переписки ещё не было. Напишите нам через кнопку чата на сайте.</p>
          ) : (
            <div className="space-y-2">
              {chats.hasMore && <button onClick={() => loadChats(chats.messages[0].id)} className="mb-2 text-sm text-slate-500 underline">Показать более ранние</button>}
              {chats.messages.map((m) => (
                <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === 'customer' ? 'ml-auto bg-slate-900 text-white' : 'bg-slate-100'}`}>
                  {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                  {m.image && <img src={m.image} alt="" className="mt-1 max-h-52 rounded-xl" />}
                  {m.audio && <audio controls src={m.audio} className="mt-1 h-9" />}
                  <div className={`mt-1 text-[10px] ${m.sender === 'customer' ? 'text-slate-300' : 'text-slate-400'}`}>{new Date(m.createdAt).toLocaleString('ru-RU')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'profile' && f && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form onSubmit={saveProfile} className="space-y-3 rounded-3xl bg-slate-50 p-6 lg:col-span-2">
            <h2 className="font-semibold">Мои данные</h2>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full bg-white">
                {auth.me.avatar ? <Img src={auth.me.avatar} icon={24} /> : <div className="flex h-full items-center justify-center text-slate-300"><UserRound size={30} /></div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Загрузить фото
                </button>
                {auth.me.avatar && <button type="button" onClick={removeAvatar} className="rounded-full px-3 py-2 text-sm text-rose-600">Удалить</button>}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
              </div>
            </div>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Имя" className={inputCls} />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">Телефон</span>
              <div className="relative">
                <input ref={phoneRef} inputMode="tel" autoComplete="tel" value={formatPhone(f.phone)}
                  onChange={(e) => {
                    const el = e.target;
                    const raw = el.value;
                    const caret = el.selectionStart ?? raw.length;
                    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
                    const digits = digitsPhone(raw);
                    setF({ ...f, phone: digits });
                    requestAnimationFrame(() => {
                      const pos = caretAfterDigits(formatPhone(digits), Math.min(digitsBefore, digits.length));
                      el.setSelectionRange(pos, pos);
                    });
                  }}
                  placeholder="+7 (900) 000-00-00" className={inputCls} />
                {f.phone && <button type="button" onClick={() => { setF({ ...f, phone: '' }); phoneRef.current?.focus(); }} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full px-1 text-slate-400 hover:text-slate-900" aria-label="Очистить телефон">×</button>}
              </div>
              <span className="mt-1 block text-xs text-slate-400">Нужен для доставки и связи по заказу. Вход на сайт — по email.</span>
            </label>
            <textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Адрес доставки" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900" />
            <button disabled={busy} className="h-11 w-full rounded-full bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </form>

          <div className="space-y-4">
            <div className="rounded-3xl bg-slate-50 p-5">
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><Mail size={16} /> Email</h3>
              {emailVerified && !emailStep && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><BadgeCheck size={16} /> {auth.me.email} подтверждён</p>}
              {!emailStep ? (
                emailVerified && !emailEdit ? (
                  <button type="button" onClick={() => setEmailEdit(true)} className="mt-2 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm">Изменить email</button>
                ) : (
                <div className="mt-2 space-y-2">
                  <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="you@example.ru" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEmailStep({ email: f.email, sent: false, code: '' }); }} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)} className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm disabled:opacity-40">Подтвердить email</button>
                    {emailVerified && <button type="button" onClick={() => { setEmailEdit(false); setF({ ...f, email: auth.me.email || '' }); }} className="text-sm text-slate-500 underline">Отмена</button>}
                  </div>
                </div>
                )
              ) : emailStep.sent ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-500">Код отправлен на {emailStep.email}</p>
                  {emailStep.test && <p className="text-xs text-amber-700">Тестовый режим, код: <b>{emailStep.test}</b></p>}
                  <input value={emailStep.code} onChange={(e) => setEmailStep({ ...emailStep, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" placeholder="Код из письма" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm tracking-widest outline-none focus:border-slate-900" />
                  <div className="flex gap-2">
                    <button type="button" onClick={verifyEmail} className="rounded-full bg-slate-900 px-4 py-1.5 text-sm text-white">Подтвердить</button>
                    <button type="button" onClick={() => setEmailStep(null)} className="text-sm text-slate-500 underline">Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-500">Отправим код на {emailDraft}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={requestEmail} className="rounded-full bg-slate-900 px-4 py-1.5 text-sm text-white">Отправить код</button>
                    <button type="button" onClick={() => setEmailStep(null)} className="text-sm text-slate-500 underline">Отмена</button>
                  </div>
                </div>
              )}
            </div>


            <div className="rounded-3xl bg-slate-50 p-5">
              <h3 className="mb-2 font-semibold">Уведомления и реклама</h3>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={f.marketingPush} onChange={(e) => toggleMarketing('marketingPush', e.target.checked)} /> <span>Push-уведомления о скидках и новинках</span></label>
              <p className="mt-2 text-xs text-slate-500">Отказаться можно в любой момент. Заказы и коды входа приходят независимо от этих настроек.</p>
            </div>

            {visits && (
              <div className="rounded-3xl bg-slate-50 p-5 text-sm">
                <h3 className="mb-1 font-semibold">Статистика</h3>
                <p className="text-slate-600">Посещений за 30 дней: {visits.sessions} · время на сайте: {Math.round((visits.totalSec || 0) / 60)} мин</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
