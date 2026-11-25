import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, Search, MessageSquare, Send, Phone, CalendarDays, ShoppingBag, Clock, Heart, Eye, Mail, UserRound, Smartphone, RefreshCw, X } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, Button, Field, Modal, PageHeader, Spinner, useToast, fmtDate, fmtNum } from '../ui';

const GENDER = { male: 'Мужской', female: 'Женский' };
const ageOf = (birthDate) => {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
};
const fmtPhone = (p) => (p ? `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}` : '—');
const money = (v) => Number(v || 0).toLocaleString('ru-RU') + ' ₽';
const emptyFilters = { q: '', gender: '', ageFrom: '', ageTo: '', hasOrders: '', marketing: '', lastSeenDays: '', minTotal: '' };

export default function Customers() {
  const toast = useToast();
  const [filters, setFilters] = useState(emptyFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [cardId, setCardId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const query = useMemo(() => {
    const f = { ...filters };
    if (!f.q) delete f.q;
    if (!f.gender) delete f.gender;
    if (!f.ageFrom) delete f.ageFrom;
    if (!f.ageTo) delete f.ageTo;
    if (!f.hasOrders) delete f.hasOrders;
    if (!f.marketing) delete f.marketing;
    if (!f.lastSeenDays) delete f.lastSeenDays;
    if (!f.minTotal) delete f.minTotal;
    return f;
  }, [filters]);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { setData(await api('/customers?' + qs({ ...query, page, perPage: 50 }))); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [query, toast]);

  useEffect(() => { load(1); setSelected(new Set()); }, [load]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShown = data?.items || [];
  const toggleAll = () => setSelected((s) => (s.size === allShown.length ? new Set() : new Set(allShown.map((c) => c.id))));

  return (
    <div className="space-y-4">
      <PageHeader title="Клиенты" subtitle="Кто зарегистрировался в интернет-магазине: покупки, посещения, чаты и рассылки">
        <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={() => load(data?.page || 1)}>Обновить</Button>
        <Button icon={Send} onClick={() => setBulkOpen(true)}>Рассылка</Button>
      </PageHeader>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Поиск (телефон, имя, email)" className="min-w-[220px] flex-1">
            <input className="input" value={filters.q} onChange={set('q')} placeholder="+7 900… / Иван / mail@…" />
          </Field>
          <Field label="Пол">
            <select className="input w-[150px]" value={filters.gender} onChange={set('gender')}>
              <option value="">Любой</option><option value="female">Женский</option><option value="male">Мужской</option><option value="none">Не указан</option>
            </select>
          </Field>
          <Field label="Возраст от"><input className="input w-[100px]" inputMode="numeric" value={filters.ageFrom} onChange={set('ageFrom')} placeholder="18" /></Field>
          <Field label="до"><input className="input w-[100px]" inputMode="numeric" value={filters.ageTo} onChange={set('ageTo')} placeholder="60" /></Field>
          <Field label="Заказы">
            <select className="input w-[150px]" value={filters.hasOrders} onChange={set('hasOrders')}>
              <option value="">Все</option><option value="1">Есть заказы</option><option value="0">Без заказов</option>
            </select>
          </Field>
          <Field label="Сумма от, ₽"><input className="input w-[120px]" inputMode="numeric" value={filters.minTotal} onChange={set('minTotal')} placeholder="5000" /></Field>
          <Field label="Были за N дней"><input className="input w-[110px]" inputMode="numeric" value={filters.lastSeenDays} onChange={set('lastSeenDays')} placeholder="30" /></Field>
          <Field label="Согласие">
            <select className="input w-[190px]" value={filters.marketing} onChange={set('marketing')}>
              <option value="">Все</option><option value="1">Есть согласие на рекламу</option>
            </select>
          </Field>
          <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>Сбросить</Button>
        </div>
        {data && <div className="text-sm text-slate-500">Найдено: <b>{data.total}</b> · выбрано: <b>{selected.size}</b></div>}
      </div>

      <div className="card overflow-x-auto p-0">
        {loading && !data ? <div className="p-10 text-center text-slate-400">Загрузка…</div> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="w-10 p-3"><input type="checkbox" checked={allShown.length > 0 && selected.size === allShown.length} onChange={toggleAll} /></th>
                <th className="p-3 w-16">ID</th><th className="p-3">Клиент</th><th className="p-3">Возраст / пол</th><th className="p-3">Заказы</th><th className="p-3">Посещение</th><th className="p-3">Чат</th><th className="p-3">Согласия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allShown.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="p-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="p-3 text-slate-400">#{c.id}</td>
                  <td className="p-3">
                    <button onClick={() => setCardId(c.id)} className="text-left">
                      <div className="font-medium">{c.name || 'Без имени'}</div>
                      <div className="text-xs text-slate-500">{fmtPhone(c.phone)}{c.email ? ' · ' + c.email : ''}</div>
                    </button>
                  </td>
                  <td className="p-3 text-slate-600">{ageOf(c.birthDate) ?? '—'}{c.gender ? ' · ' + GENDER[c.gender] : ''}</td>
                  <td className="p-3">{c.ordersCount ? <span>{c.ordersCount} · <b>{money(c.ordersSum)}</b></span> : <span className="text-slate-400">нет</span>}</td>
                  <td className="p-3 text-slate-600">{c.lastVisitAt ? fmtDate(c.lastVisitAt) : '—'}</td>
                  <td className="p-3 text-slate-600">{c.lastChatAt ? fmtDate(c.lastChatAt) : '—'}</td>
                  <td className="p-3 text-xs">
                    {c.marketingConsentAt ? <Badge color="green">реклама</Badge> : <span className="text-slate-400">нет</span>}
                    {c.marketingPush ? <span className="ml-1 text-slate-500">push</span> : null}
                  </td>
                </tr>
              ))}
              {allShown.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">Клиентов не найдено</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > data.perPage && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => load(data.page - 1)}>Назад</Button>
          <span className="text-sm text-slate-500">стр. {data.page} из {Math.ceil(data.total / data.perPage)}</span>
          <Button variant="secondary" size="sm" disabled={data.page * data.perPage >= data.total} onClick={() => load(data.page + 1)}>Вперёд</Button>
        </div>
      )}

      {cardId && <CustomerCard id={cardId} onClose={() => setCardId(null)} onChanged={() => load(data?.page || 1)} />}
      {bulkOpen && <BulkModal filter={query} shown={data?.items || []} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function CustomerCard({ id, onClose, onChanged }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('profile');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [msg, setMsg] = useState({ channel: 'push', text: '' });
  const load = useCallback(() => api('/customers/' + id).then(setD).catch((e) => toast(e.message, 'error')), [id, toast]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <Modal open onClose={onClose} title="Клиент"><div className="p-6 text-center"><Spinner /></div></Modal>;
  const c = d.customer;
  const age = ageOf(c.birthDate);
  const days = Math.round((d.stats.time30dSec || 0) / 60);
  const sendOne = async () => {
    if (!msg.text.trim()) return;
    try { await api(`/customers/${id}/message`, { method: 'POST', body: msg }); toast('Отправлено'); setMsg({ ...msg, text: '' }); }
    catch (e) { toast(e.message, 'error'); }
  };
  const canDelete = (d.stats.ordersCount || 0) === 0 && (d.chats?.length || 0) === 0;
  const removeCustomer = async () => {
    if (!confirm('Удалить клиента без заказов и переписки? Действие необратимо.')) return;
    try { await api('/customers/' + id, { method: 'DELETE' }); toast('Клиент удалён'); onChanged?.(); onClose(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const TABS = [['profile', 'Профиль'], ['orders', 'Заказы'], ['chats', 'Чаты'], ['visits', 'Посещения'], ['interests', 'Интересы']];
  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2">Клиент #{c.id} {c.name ? <span className="font-normal text-slate-500">· {c.name}</span> : null}</span>}
      footer={<>
        <Button variant="secondary" icon={Phone} onClick={() => setPhoneOpen(true)}>Сменить номер</Button>
        {canDelete && <Button variant="secondary" className="text-rose-600" onClick={removeCustomer}>Удалить клиента</Button>}
        <Button className="ml-auto" onClick={onClose}>Закрыть</Button>
      </>}>
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <Badge color="slate">{fmtPhone(c.phone)}</Badge>
        {c.email && <Badge color={c.emailVerifiedAt ? 'green' : 'amber'}>{c.email}{c.emailVerifiedAt ? ' ✓' : ' (не подтверждён)'}</Badge>}
        <Badge color="slate">пол: {c.gender ? GENDER[c.gender] : '—'}</Badge>
        <Badge color="slate">возраст: {age ?? '—'}</Badge>
        <Badge color="slate">регистрация: {fmtDate(c.createdAt, false)}</Badge>
        <Badge color="slate">заказов: {d.stats.ordersCount} на {money(d.stats.ordersSum)}</Badge>
        <Badge color="slate">посещений 30 дн: {d.stats.visits30d} · {days} мин</Badge>
      </div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? 'bg-white font-semibold shadow' : 'text-slate-600'}`}>{l}</button>)}
      </div>

      {tab === 'profile' && (
        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-medium">Отправка сообщения</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-indigo-600 px-4 py-1.5 text-white">Push</span>
              <input className="input min-w-[240px] flex-1" value={msg.text} onChange={(e) => setMsg({ ...msg, text: e.target.value })} placeholder="Текст сообщения (можно приветствие)" />
              <Button onClick={sendOne}>Отправить</Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><span className="text-slate-500">Внутренний ID:</span> <b>#{c.id}</b></div>
            <div><span className="text-slate-500">Согласие (ПДн):</span> {c.consentAt ? fmtDate(c.consentAt) : '—'}</div>
            <div><span className="text-slate-500">Реклама:</span> {c.marketingConsentAt ? fmtDate(c.marketingConsentAt) : 'нет'}{c.marketingPush ? 'push' : '—'}</div>
            <div><span className="text-slate-500">Избранное:</span> {d.stats.favorites} · <span className="text-slate-500">ждут поступления:</span> {d.stats.waitlist}</div>
            <div><span className="text-slate-500">Последний вход:</span> {c.lastLogin ? fmtDate(c.lastLogin) : '—'}</div>
            <div><span className="text-slate-500">Адрес:</span> {c.address || '—'}</div>
          </div>
          <div>
            <div className="mb-1 font-medium">История номера телефона</div>
            {d.phoneChanges.length === 0 ? <p className="text-slate-400">Без изменений</p> : d.phoneChanges.map((x) => (
              <div key={x.id} className="text-xs text-slate-600">{fmtDate(x.createdAt)}: {fmtPhone(x.oldPhone)} → <b>{fmtPhone(x.newPhone)}</b>{x.reason ? ' · ' + x.reason : ''}</div>
            ))}
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-2 text-sm">
          {d.orders.length === 0 ? <p className="text-slate-400">Заказов нет</p> : d.orders.map((o) => (
            <a key={o.id} href={`/admin/orders?q=${encodeURIComponent(o.number)}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 hover:border-slate-400">
              <span><b>{o.number}</b> · {fmtDate(o.createdAt, false)}</span>
              <span className="text-slate-500">{money(o.total)} · {o.status}</span>
            </a>
          ))}
        </div>
      )}

      {tab === 'chats' && (
        <div className="space-y-2 text-sm">
          {d.chats.length === 0 ? <p className="text-slate-400">Переписки нет</p> : d.chats.map((x) => (
            <a key={x.id} href={`/admin/chats?c=${x.id}`} className="block rounded-xl border border-slate-200 p-3 hover:border-slate-400">
              <div className="flex justify-between"><span className="font-medium">{fmtDate(x.lastMessageAt)}</span><span className="text-slate-500">{x.status}{x.unreadAdmin ? ' · новых: ' + x.unreadAdmin : ''}</span></div>
              <div className="truncate text-slate-600">{x.lastText || '—'}</div>
            </a>
          ))}
          <a href={`/admin/chats`} className="text-xs text-indigo-600 underline">Все чаты</a>
        </div>
      )}

      {tab === 'visits' && (
        <div className="space-y-2 text-sm">
          <p className="text-slate-600">За 30 дней: {d.stats.visits30d} сессий, {days} мин на сайте</p>
          {d.sessions.length === 0 ? <p className="text-slate-400">Нет данных о посещениях</p> : d.sessions.map((s) => (
            <div key={s.id} className="flex justify-between rounded-xl border border-slate-200 p-2.5">
              <span>{fmtDate(s.startedAt)}</span><span className="text-slate-500">{s.durationSec ? Math.round(s.durationSec / 60) + ' мин' : 'меньше минуты'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'interests' && (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium">Товары</div>
            {d.interests.products.length === 0 ? <p className="text-slate-400">Нет просмотров</p> : d.interests.products.map((p) => (
              <div key={p.id} className="flex justify-between rounded-lg border border-slate-100 p-2"><span>{p.name}</span><span className="text-slate-500">{p.views} просм.</span></div>
            ))}
          </div>
          <div>
            <div className="mb-1 font-medium">Категории</div>
            {d.interests.categories.length === 0 ? <p className="text-slate-400">Нет данных</p> : d.interests.categories.map((p) => (
              <div key={p.id} className="flex justify-between rounded-lg border border-slate-100 p-2"><span>{p.name}</span><span className="text-slate-500">{p.views} просм.</span></div>
            ))}
          </div>
          <div>
            <div className="mb-1 font-medium">Последние поисковые запросы</div>
            {d.interests.searches.length === 0 ? <p className="text-slate-400">Нет запросов</p> : <div className="flex flex-wrap gap-1">{d.interests.searches.map((q) => <span key={q} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{q}</span>)}</div>}
          </div>
          <div>
            <div className="mb-1 font-medium">Последние действия</div>
            {d.interests.lastEvents.length === 0 ? <p className="text-slate-400">Нет событий</p> : d.interests.lastEvents.map((e, i) => (
              <div key={i} className="text-xs text-slate-500">{fmtDate(e.at)} · {e.type}{e.path ? ' ' + e.path : ''}{e.query ? ' «' + e.query + '»' : ''}</div>
            ))}
          </div>
        </div>
      )}

      {phoneOpen && <PhoneChange customer={c} onClose={() => setPhoneOpen(false)} onDone={() => { load(); onChanged?.(); }} />}
    </Modal>
  );
}

function PhoneChange({ customer, onClose, onDone }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api(`/customers/${customer.id}/phone`, { method: 'POST', body: { phone, reason } }); toast('Номер изменён'); onDone(); onClose(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Сменить номер клиента" footer={<>
      <Button variant="secondary" onClick={onClose}>Отмена</Button>
      <Button loading={busy} onClick={save}>Сменить номер</Button>
    </>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Текущий номер: <b>{fmtPhone(customer.phone)}</b>. Клиент потерял доступ и просит перенести аккаунт на новый номер.</p>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Новый номер: +7 900 000-00-00" inputMode="tel" />
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина / из обращения клиента (необязательно)" />
        <p className="text-xs text-slate-500">На подтверждённый email клиента уйдёт уведомление о смене номера. Историю заказов не меняем.</p>
      </div>
    </Modal>
  );
}

function BulkModal({ filter, shown, onClose }) {
  const toast = useToast();
  const [channel, setChannel] = useState('push');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const poll = useRef(null);
  useEffect(() => () => clearInterval(poll.current), []);
  const start = async () => {
    if (!text.trim()) return toast('Введите текст', 'error');
    if (!confirm('Разослать push по фильтру? Получателей с согласием — не больше 500.')) return;
    setBusy(true);
    try {
      const r = await api('/customers/bulk', { method: 'POST', body: { filter, channel, text } });
      setBusy(false);
      setProg({ id: r.id, total: r.total, sent: 0, failed: 0, status: 'running' });
      clearInterval(poll.current);
      poll.current = setInterval(async () => {
        try {
          const p = await api('/customers/bulk/' + r.id);
          setProg(p);
          if (p.status !== 'running') clearInterval(poll.current);
        } catch { /* ignore */ }
      }, 2000);
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const cancel = async () => { try { await api(`/customers/bulk/${prog.id}/cancel`, { method: 'POST' }); } catch (e) { toast(e.message, 'error'); } };
  return (
    <Modal open onClose={onClose} title="Массовая рассылка" footer={<>
      <Button variant="secondary" onClick={onClose}>Закрыть</Button>
      {!prog && <Button loading={busy} onClick={start}>Разослать</Button>}
      {prog && prog.status === 'running' && <Button variant="secondary" onClick={cancel}>Остановить</Button>}
    </>}>
      <div className="space-y-3 text-sm">
        {!prog ? (
          <>
            <p className="text-slate-600">Получатели — клиенты из текущего фильтра, у которых есть <b>согласие на рекламу</b> и включён канал. Максимум 500.</p>
            <div className="flex gap-2">
              <span className="rounded-full bg-indigo-600 px-4 py-1.5 text-white">Push</span>
            </div>
            <textarea className="input" rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст пуш-уведомления" />
            <p className="text-xs text-slate-500">Push получат только те, кто подписался в браузере.</p>
          </>
        ) : (
          <>
            <div className="text-slate-600">Отправлено: <b>{prog.sent}</b> · ошибок: <b>{prog.failed}</b> · пропущено: <b>{prog.skipped ?? 0}</b> · всего: {prog.total}</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-600" style={{ width: `${prog.total ? Math.round(((prog.sent + prog.failed + (prog.skipped || 0)) / prog.total) * 100) : 0}%` }} /></div>
            <div className="text-xs text-slate-500">Статус: {prog.status === 'done' ? 'завершено' : prog.status === 'cancelled' ? 'остановлено' : prog.status === 'error' ? 'ошибка: ' + (prog.error || '') : 'идёт отправка…'}</div>
          </>
        )}
      </div>
    </Modal>
  );
}
