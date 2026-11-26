import { useEffect, useState } from 'react';
import { ShoppingBag, Search, Phone, MapPin, Store, Truck, CheckCircle2, XCircle, Undo2, Wallet, ExternalLink, ClipboardList, FileDown } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { Badge, Button, Empty, Modal, PageHeader, Spinner, Thumb, fmtDate, fmtNum, useLoad, useMoney, useSettings, useToast } from '../ui';

export const ORDER_STATUS = {
  new: ['Новый', 'indigo'], confirmed: ['Подтверждён', 'blue'], ready: ['Собран / в пути', 'amber'], completed: ['Выполнен', 'green'], cancelled: ['Отменён', 'slate'],
};
export const PAY_STATUS = { unpaid: ['не оплачен', 'slate'], pending: ['ожидает оплаты', 'amber'], paid: ['оплачен', 'green'], failed: ['ошибка оплаты', 'red'], refunded: ['возврат', 'red'] };
const PAY_METHOD = { cash: 'При получении', tbank: 'Онлайн (Т-Банк)', sbp: 'СБП' };
const fmtPhone = (p) => (p ? `+${p[0]} ${p.slice(1, 4)} ${p.slice(4, 7)}-${p.slice(7, 9)}-${p.slice(9)}` : '');

// строки листа подбора: что и сколько взять, где лежит
const pickRows = (o) => o.items.map((i) => ({
  id: i.id, image: i.product.images[0]?.path, name: i.product.parent?.name || i.name, color: i.product.color, size: i.product.size || null, sizeRu: i.product.sizeRu || null,
  article: i.product.article, sku: i.product.parent?.sku || i.product.sku, barcode: i.product.barcodes?.[0]?.code, quantity: i.quantity,
  stocks: i.product.stocks.filter((s) => s.quantity > 0 || i.product.stocks.length === 1).map((s) => ({ name: s.warehouse?.name || 'Склад', quantity: s.quantity })),
}));

/** Лист подбора: отметки «взял» прямо на экране (для телефона на складе) и скачивание PDF */
function PickList({ o, onClose }) {
  const money = useMoney();
  const { storeName } = useSettings();
  const toast = useToast();
  const rows = pickRows(o);
  const [done, setDone] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const pdf = async () => {
    setBusy(true);
    try {
      const { pickListPdf } = await import('../pdf');
      await pickListPdf({ ...o, paymentLabel: `${PAY_METHOD[o.paymentMethod] || o.paymentMethod} · ${PAY_STATUS[o.paymentStatus]?.[0] || ''}` }, rows, { money, storeName, fmtDate });
    } catch (e) { toast(e.message || 'Не удалось создать PDF', 'error'); } finally { setBusy(false); }
  };
  const total = rows.reduce((a, r) => a + r.quantity, 0);
  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2"><ClipboardList size={20} className="text-indigo-600" />Лист подбора {o.number}</span>}
      footer={<><span className="mr-auto self-center text-sm text-slate-500">Собрано {done.size} из {rows.length} · всего {fmtNum(total)} шт</span><Button icon={FileDown} loading={busy} onClick={pdf}>Скачать PDF</Button></>}>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const ok = done.has(r.id);
          const low = r.stocks.reduce((a, s) => a + s.quantity, 0) < r.quantity;
          return (
            <label key={r.id} className={`flex cursor-pointer items-center gap-3 py-3 ${ok ? 'opacity-50' : ''}`}>
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={ok} onChange={() => setDone((d) => { const n = new Set(d); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
              <Thumb src={r.image} size={52} />
              <div className="min-w-0 flex-1 text-sm">
                <div className={`font-medium ${ok ? 'line-through' : ''}`}>{r.name}</div>
                <div className="text-xs text-slate-500">{[r.color, r.size && <b key="s" className="text-slate-900">{r.size}{r.sizeRu ? ` (${r.sizeRu})` : ''}</b>].filter(Boolean).reduce((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</div>
                <div className="font-mono text-xs text-slate-400">арт. {r.article}{r.sku ? ` · ${r.sku}` : ''}{r.barcode ? ` · ${r.barcode}` : ''}</div>
                <div className={`text-xs ${low ? 'text-rose-600' : 'text-slate-500'}`}>{r.stocks.length ? r.stocks.map((s) => `${s.name}: ${fmtNum(s.quantity)}`).join(' · ') : 'нет на складе'}</div>
              </div>
              <div className="shrink-0 text-right"><div className="text-2xl font-bold tabular-nums">{fmtNum(r.quantity)}</div><div className="text-[11px] text-slate-400">шт</div></div>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

// Яндекс Доставка: передать заказ, статус заявки, отмена
function YandexBlock({ o, busy, act }) {
  let info = {};
  try { info = JSON.parse(o.deliveryInfo || '{}') || {}; } catch { /* старый формат */ }
  const carrier = info.carrier || (String(o.delivery).startsWith('yandex') ? o.delivery : '');
  if (!carrier.startsWith('yandex')) return null;
  const y = info.yandex;
  const dead = !y || ['CANCELLED', 'cancelled', 'CANCELLED_BY_RECIPIENT', 'failed', 'estimating_failed', 'performer_not_found'].includes(y.status);
  const send = () => {
    const paid = o.paymentStatus === 'paid';
    if (!paid && !confirm('Заказ не оплачен. Деньги получены другим способом и можно передавать в Яндекс?')) return;
    if (paid && !confirm('Создать заявку в Яндекс Доставке? Посылку нужно будет сдать в пункт приёма.')) return;
    act('yandex', { allowUnpaid: !paid }, 'Заявка в Яндекс Доставке создана');
  };
  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Яндекс Доставка{info.pointAddress ? <span className="font-normal text-slate-500"> · ПВЗ: {info.pointAddress}</span> : null}</div>
        <div className="flex flex-wrap gap-2">
          {dead && o.status !== 'cancelled' && <Button size="sm" icon={Truck} loading={busy} onClick={send}>{y ? 'Передать заново' : 'Передать в Яндекс'}</Button>}
          {y && <Button size="sm" variant="secondary" loading={busy} onClick={() => act('yandex/refresh', {}, 'Статус обновлён')}>Обновить статус</Button>}
          {y && !dead && <Button size="sm" variant="secondary" className="text-rose-600" loading={busy} onClick={() => confirm('Отменить заявку в Яндекс Доставке?') && act('yandex/cancel', {}, 'Заявка отменена')}>Отменить заявку</Button>}
        </div>
      </div>
      {y && (
        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
          <div>Статус: <b className="text-slate-900">{y.statusText || y.status}</b>{y.statusDescription ? ` — ${y.statusDescription}` : ''}</div>
          <div>Заявка: <span className="font-mono">{y.requestId || y.claimId}</span></div>
          {y.price ? <div>Стоимость у Яндекса: {y.price} ₽</div> : null}
          {y.sharingUrl && <a href={y.sharingUrl} target="_blank" rel="noreferrer" className="text-indigo-600">Отслеживание для покупателя ↗</a>}
        </div>
      )}
    </div>
  );
}

function OrderModal({ id, onClose, onChange }) {
  // возврат денег через Т-Банк — только администратор (сервер тоже проверяет)
  const isAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'admin';
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const money = useMoney();
  const toast = useToast();
  useEffect(() => { api('/orders/' + id).then(setO); }, [id]);
  if (!o) return null;
  if (pick) return <PickList o={o} onClose={() => setPick(false)} />;

  const act = async (path, body, msg) => {
    setBusy(true);
    try { const r = await api(`/orders/${o.id}/${path}`, { method: 'POST', body }); setO(r); onChange(); toast(msg); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const paidOnline = ['tbank', 'sbp'].includes(o.paymentMethod) && o.paymentStatus === 'paid';
  const setStatus = (status) => {
    if (status === 'completed' && !confirm('Отметить заказ выполненным? Будет создана продажа и списан товар со склада.')) return;
    if (status === 'cancelled') {
      if (paidOnline) { toast('Сначала верните деньги кнопкой «Вернуть» — заказ оплачен онлайн', 'error'); return; }
      if (!confirm('Отменить заказ?')) return;
      return act('status', { status }, 'Заказ отменён');
    }
    act('status', { status }, 'Статус обновлён');
  };
  const refund = () => {
    if (!confirm('Вернуть деньги покупателю через Т-Банк? Отменить возврат нельзя.')) return;
    act('refund', {}, 'Деньги возвращены покупателю');
  };
  const open = !['completed', 'cancelled'].includes(o.status);
  const flow = ['new', 'confirmed', 'ready', 'completed'];

  return (
    <Modal open onClose={onClose} wide title={<span className="flex items-center gap-2">Заказ {o.number} <Badge color={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></span>}
      footer={open && (
        <>
          <div className="mr-auto flex flex-wrap gap-2">
            <Button variant="secondary" icon={XCircle} className="text-rose-600" loading={busy} onClick={() => setStatus('cancelled')}>Отменить</Button>
            {paidOnline && isAdmin && <Button variant="secondary" icon={Undo2} loading={busy} onClick={refund}>Вернуть</Button>}
          </div>
          {o.paymentMethod === 'cash' && o.paymentStatus !== 'paid' && <Button variant="secondary" icon={Wallet} loading={busy} onClick={() => act('paid', {}, 'Оплата отмечена')}>Оплачен</Button>}
          {o.status === 'new' && <Button variant="secondary" loading={busy} onClick={() => setStatus('confirmed')}>Подтвердить</Button>}
          {['new', 'confirmed'].includes(o.status) && <Button variant="secondary" loading={busy} onClick={() => setStatus('ready')}>Собран / в пути</Button>}
          <Button variant="success" icon={CheckCircle2} loading={busy} onClick={() => setStatus('completed')}>Выдан покупателю</Button>
        </>
      )}>
      <div className="mb-5 flex items-center gap-1">
        {flow.map((s, i) => {
          const reached = o.status !== 'cancelled' && flow.indexOf(o.status) >= i;
          return <div key={s} className="flex flex-1 items-center gap-1"><div className={`h-1.5 flex-1 rounded-full ${reached ? 'bg-indigo-600' : 'bg-slate-200'}`} /><span className={`text-[11px] ${reached ? 'text-indigo-700' : 'text-slate-400'}`}>{ORDER_STATUS[s][0]}</span></div>;
        })}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div><div className="label">Покупатель</div><div className="font-medium">{o.name || '—'}</div><a href={`tel:+${o.phone}`} className="inline-flex items-center gap-1 text-indigo-600"><Phone size={12} />{fmtPhone(o.phone)}</a></div>
        <div><div className="label">Получение</div><div className="flex items-center gap-1">{o.delivery === 'pickup' ? <Store size={14} /> : <Truck size={14} />} {o.deliveryName || o.delivery}</div>{o.address && <div className="flex items-start gap-1 text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0" />{o.address}</div>}{(() => { try { const i = JSON.parse(o.deliveryInfo || '{}'); return <div className="text-xs text-slate-500">{[i.pointCode && `пункт ${i.pointCode}`, i.postcode && `индекс ${i.postcode}`, i.days && `срок ${i.days}`].filter(Boolean).join(' · ')}</div>; } catch { return null; } })()}</div>
        <div><div className="label">Оплата</div>{PAY_METHOD[o.paymentMethod]}<div><Badge color={PAY_STATUS[o.paymentStatus][1]}>{PAY_STATUS[o.paymentStatus][0]}</Badge></div></div>
      </div>
      {o.comment && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm"><b>Комментарий покупателя:</b> {o.comment}</div>}
      <YandexBlock o={o} busy={busy} act={act} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Товары · {fmtNum(o.items.reduce((a, i) => a + i.quantity, 0))} шт</h3>
        <Button size="sm" variant="secondary" icon={ClipboardList} onClick={() => setPick(true)}>Лист подбора</Button>
      </div>
      {/* на телефоне — списком, без горизонтальной прокрутки */}
      <div className="divide-y divide-slate-100 border-y border-slate-100 sm:hidden">
        {o.items.map((i) => {
          const stock = i.product.stocks.reduce((a, s) => a + s.quantity, 0);
          return (
            <Link key={i.id} to={`/products/${i.productId}`} className="flex gap-3 py-2.5 text-sm">
              <Thumb src={i.product.images[0]?.path} size={44} />
              <div className="min-w-0 flex-1">
                <div className="leading-snug">{i.name}</div>
                <div className="font-mono text-xs text-slate-400">{i.product.sku}</div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-slate-500">
                  <span>{fmtNum(i.quantity)} × {money(i.price)}</span>
                  <span className={stock < i.quantity ? 'text-rose-600' : ''}>на складе {fmtNum(stock)}</span>
                  <span className="text-sm font-semibold text-slate-900">{money(i.price * i.quantity)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="hidden sm:block">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-100"><th className="th pl-0">Товар</th><th className="th text-right">Кол-во</th><th className="th text-right">Цена</th><th className="th text-right">Сумма</th><th className="th text-right">На складе</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {o.items.map((i) => {
            const stock = i.product.stocks.reduce((a, s) => a + s.quantity, 0);
            return (
              <tr key={i.id}>
                <td className="py-2"><Link to={`/products/${i.productId}`} className="flex items-center gap-2 hover:text-indigo-600"><Thumb src={i.product.images[0]?.path} size={36} /><div>{i.name}<div className="font-mono text-xs text-slate-400">{i.product.sku}</div></div></Link></td>
                <td className="py-2 text-right">{fmtNum(i.quantity)}</td><td className="py-2 text-right">{money(i.price)}</td><td className="py-2 text-right font-medium">{money(i.price * i.quantity)}</td>
                <td className={`py-2 text-right ${stock < i.quantity ? 'text-rose-600' : 'text-slate-500'}`}>{fmtNum(stock)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="mt-3 space-y-0.5 text-right text-sm">
        <div className="text-slate-500">Товары: {money(o.subtotal)}</div>
        {o.delivery !== 'pickup' && <div className="text-slate-500">Доставка: {o.deliveryPrice ? money(o.deliveryPrice) : 'бесплатно'}</div>}
        <div className="text-xl font-bold">Итого: {money(o.total)}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Создан: {fmtDate(o.createdAt)}</span>
        {o.paidAt && <span>Оплачен: {fmtDate(o.paidAt)}</span>}
        {o.paymentId && <span>Платёж Т-Банк: {o.paymentId}</span>}
        {o.saleId && <Link to="/sales" className="inline-flex items-center gap-1 text-indigo-600">Продажа создана <ExternalLink size={12} /></Link>}
      </div>
    </Modal>
  );
}

export default function Orders() {
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [view, setView] = useState(params.get('open') ? Number(params.get('open')) : null);
  const { data, reload, loading } = useLoad('/orders' + qs({ status, q }));
  const money = useMoney();
  const c = data?.counts || {};
  const tabs = [['active', 'В работе', (c.new || 0) + (c.confirmed || 0) + (c.ready || 0)], ['new', 'Новые', c.new], ['completed', 'Выполненные', c.completed], ['cancelled', 'Отменённые', c.cancelled], ['', 'Все']];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Заказы" subtitle="Заказы из интернет-магазина">
        <a href="/" target="_blank" rel="noreferrer"><Button variant="secondary" icon={ExternalLink}>Открыть магазин</Button></a>
      </PageHeader>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          {tabs.map(([k, l, n]) => <button key={l} onClick={() => setStatus(k)} className={`rounded-full px-3 py-1 text-sm ${status === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}{n ? ` · ${n}` : ''}</button>)}
          <div className="relative ml-auto w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Номер, телефон, имя" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={ShoppingBag} title="Заказов нет" text="Заказы покупателей из интернет-магазина появятся здесь" /> : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className="th">Заказ</th><th className="th">Дата</th><th className="th">Покупатель</th><th className="th">Получение</th><th className="th">Оплата</th><th className="th text-right">Сумма</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((o) => (
                  <tr key={o.id} onClick={() => setView(o.id)} className={`cursor-pointer hover:bg-slate-50/70 ${o.status === 'new' ? 'bg-indigo-50/40' : ''}`}>
                    <td className="td"><div className="font-medium">{o.number}</div><Badge color={ORDER_STATUS[o.status][1]}>{ORDER_STATUS[o.status][0]}</Badge></td>
                    <td className="td text-slate-500">{fmtDate(o.createdAt)}</td>
                    <td className="td"><div>{o.name || '—'}</div><div className="text-xs text-slate-500">{fmtPhone(o.phone)}</div></td>
                    <td className="td text-sm"><span title={o.address || ''}>{o.deliveryName || o.delivery}</span></td>
                    <td className="td text-sm"><div>{PAY_METHOD[o.paymentMethod]}</div><Badge color={PAY_STATUS[o.paymentStatus][1]}>{PAY_STATUS[o.paymentStatus][0]}</Badge></td>
                    <td className="td text-right font-semibold">{money(o.total)}<div className="text-xs font-normal text-slate-500">{fmtNum(o._count.items)} поз.</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {view && <OrderModal id={view} onClose={() => setView(null)} onChange={reload} />}
    </div>
  );
}
