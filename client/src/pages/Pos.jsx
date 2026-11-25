import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingCart, CheckCircle2, Banknote, CreditCard, Landmark, HandCoins, QrCode, Download } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { receiptPdf } from '../pdf';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker';
import { Button, Field, Modal, RefSelect, Thumb, fmtNum, useMoney, useToast } from '../ui';

const LS = 'pos_defaults';

// QR-код из платёжной ссылки (Т-Банк/СБП) без внешних сервисов
function QrImage({ url }) {
  const html = (() => { const q = qrcode(0, 'M'); q.addData(url || ''); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); })();
  return <div className="mx-auto mt-2 w-64 rounded-2xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" aria-label="QR-код для оплаты" dangerouslySetInnerHTML={{ __html: html }} />;
}
const payments = [['sbp_qr', 'QR СБП', QrCode], ['cash', 'Наличные', Banknote], ['card', 'Карта', CreditCard], ['transfer', 'Перевод', Landmark]];
const payLabel = { sbp_qr: 'QR-код СБП (Т-Банк)', cash: 'Наличные', card: 'Карта', transfer: 'Перевод', consignment: 'Реализация' };

export default function Pos() {
  const saved = JSON.parse(localStorage.getItem(LS) || '{}');
  const [cart, setCart] = useState([]);
  const [warehouseId, setWarehouseId] = useState(saved.warehouseId || null);
  const [channelId, setChannelId] = useState(saved.channelId || null);
  const [counterpartyId, setCounterpartyId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [params] = useSearchParams();
  const [consignment, setConsignment] = useState(params.get('consignment') === '1');
  const [dueDate, setDueDate] = useState('');
  const [prepaid, setPrepaid] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [sbp, setSbp] = useState(null); // { sale, paymentUrl }
  const [shop, setShop] = useState(null);
  const money = useMoney();
  const toast = useToast();

  useEffect(() => { localStorage.setItem(LS, JSON.stringify({ warehouseId, channelId })); }, [warehouseId, channelId]);
  useEffect(() => { api('/orders/settings').then(setShop).catch(() => {}); }, []);
  // пока открыт QR — каждые 4 с спрашиваем у банка, прошла ли оплата
  useEffect(() => {
    if (!sbp || sbp.paid) return undefined;
    const t = setInterval(() => {
      api(`/sales/${sbp.sale.id}/sbp-status`).then((r) => { if (r.paid) setSbp((x) => (x && x.sale.id === sbp.sale.id ? { ...x, paid: true } : x)); }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [sbp?.sale?.id, sbp?.paid]);

  const downloadReceipt = async (sale) => {
    await receiptPdf(sale, {
      seller: { name: shop?.sellerName, inn: shop?.sellerInn, ogrn: shop?.sellerOgrn, address: shop?.sellerAddress, phone: shop?.sellerPhone || shop?.phone, email: shop?.sellerEmail || shop?.email },
      storeName: shop?.title || 'ЛУНАРА', money, fmtDate: (d) => new Date(d).toLocaleString('ru-RU'), paymentLabel: payLabel[sale.paymentMethod] || '—',
    });
  };

  const stockOf = (p) => (warehouseId ? p.stocks?.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0 : p.totalStock);
  const add = (p) => setCart((c) => {
    const ex = c.find((i) => i.productId === p.id);
    if (ex) return c.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
    return [...c, { productId: p.id, name: p.name, sku: p.sku, image: p.images?.[0]?.path, price: p.price, quantity: 1, stock: stockOf(p), unit: p.unit }];
  });
  const upd = (id, patch) => setCart((c) => c.map((i) => (i.productId === id ? { ...i, ...patch } : i)));

  const subtotal = cart.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.price || 0), 0);
  const disc = Math.min(Number(discount || 0), subtotal);
  const total = subtotal - disc;

  const submit = async () => {
    setSaving(true);
    try {
      const s = await api('/sales', { method: 'POST', body: { warehouseId, channelId, counterpartyId, paymentMethod, discount: disc, note, items: cart, consignment, dueDate: consignment ? dueDate : null, prepaid: consignment ? prepaid : 0 } });
      if (paymentMethod === 'sbp_qr' && !consignment) {
        try {
          const q = await api(`/sales/${s.id}/sbp-qr`, { method: 'POST' });
          setSbp({ sale: s, paymentUrl: q.paymentUrl, kind: q.kind || 'sbp', paid: false });
        } catch (e) {
          toast('Продажа проведена, но QR не создан: ' + e.message, 'error');
          setDone(s);
        }
      } else setDone(s);
      setCart([]); setDiscount(''); setNote(''); setCounterpartyId(null); setDueDate(''); setPrepaid('');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Новая продажа</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <ProductPicker onPick={add} autoFocus warehouseId={warehouseId} popular />
          {cart.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-xl border-2 border-dashed border-slate-200 py-20 text-center text-slate-400">
              <ShoppingCart size={36} className="mb-3" />
              <div className="font-medium text-slate-500">Корзина пуста</div>
              <div className="text-sm">Отсканируйте штрихкод сканером или найдите товар по названию</div>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {cart.map((i) => (
                <div key={i.productId} className="flex flex-wrap items-center gap-3 py-3">
                  <Thumb src={i.image} size={48} />
                  <div className="min-w-40 flex-1">
                    <div className="font-medium">{i.name}</div>
                    <div className={`text-xs ${i.stock < i.quantity ? 'text-rose-600' : 'text-slate-500'}`}>{i.sku || ''} · на складе {fmtNum(i.stock)} {i.unit}{i.stock < i.quantity && ` · остаток уйдёт в минус (${fmtNum(i.stock - i.quantity)})`}</div>
                  </div>
                  <div className="flex items-center rounded-lg border border-slate-300">
                    <button className="px-2 py-2 text-slate-500 hover:text-indigo-600" onClick={() => upd(i.productId, { quantity: Math.max(1, Number(i.quantity) - 1) })}><Minus size={14} /></button>
                    <input className="w-14 border-x border-slate-300 py-1.5 text-center text-sm outline-none" type="number" min="0" step="any" value={i.quantity} onChange={(e) => upd(i.productId, { quantity: e.target.value })} />
                    <button className="px-2 py-2 text-slate-500 hover:text-indigo-600" onClick={() => upd(i.productId, { quantity: Number(i.quantity) + 1 })}><Plus size={14} /></button>
                  </div>
                  <input className="input w-28 text-right" type="number" min="0" step="any" value={i.price} onChange={(e) => upd(i.productId, { price: e.target.value })} title="Цена" />
                  <div className="w-32 text-right font-semibold">{money(Number(i.quantity || 0) * Number(i.price || 0))}</div>
                  <button onClick={() => setCart(cart.filter((x) => x.productId !== i.productId))} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card h-fit space-y-4 p-5 lg:sticky lg:top-24">
          <Field label="Склад списания *"><RefSelect path="/warehouses" value={warehouseId} onChange={setWarehouseId} filter={(w) => w.active} placeholder="Выберите склад" /></Field>
          <Field label="Канал продаж"><RefSelect path="/channels" value={channelId} onChange={setChannelId} filter={(c) => c.active} /></Field>
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${consignment ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="checkbox" checked={consignment} onChange={(e) => setConsignment(e.target.checked)} />
            <HandCoins size={18} className={consignment ? 'text-amber-600' : 'text-slate-400'} />
            <span className="text-sm"><b>Под реализацию (в долг)</b><span className="block text-xs text-slate-500">оплата позже, долг виден в разделе «Реализация»</span></span>
          </label>
          <Field label={consignment ? 'Контрагент *' : 'Покупатель'}><RefSelect path="/counterparties" value={counterpartyId} onChange={setCounterpartyId} filter={(c) => c.type !== 'supplier'} placeholder={consignment ? 'Выберите, кому отдаёте' : 'Розничный покупатель'} /></Field>
          {consignment && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Срок оплаты"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
              <Field label="Предоплата"><input className="input" type="number" min="0" step="any" placeholder="0" value={prepaid} onChange={(e) => setPrepaid(e.target.value)} /></Field>
            </div>
          )}
          <div>
            <span className="label">{consignment ? 'Способ предоплаты' : 'Оплата'}</span>
            <div className="grid grid-cols-4 gap-2">
              {payments.map(([k, l, Icon]) => (
                <button key={k} onClick={() => setPaymentMethod(k)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center text-xs leading-tight font-medium transition ${paymentMethod === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <Icon size={18} />{l}
                </button>
              ))}
            </div>
          </div>
          <Field label="Скидка"><input className="input" type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
          <Field label="Комментарий"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="space-y-1 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>Подытог</span><span>{money(subtotal)}</span></div>
            {disc > 0 && <div className="flex justify-between text-rose-600"><span>Скидка</span><span>−{money(disc)}</span></div>}
            <div className="flex items-end justify-between pt-2"><span className="font-medium">{consignment ? 'Сумма' : 'К оплате'}</span><span className="text-3xl font-bold tracking-tight">{money(total)}</span></div>
            {consignment && <div className="flex justify-between font-medium text-amber-700"><span>В долг</span><span>{money(Math.max(0, total - Number(prepaid || 0)))}</span></div>}
          </div>
          <Button size="lg" variant={consignment ? 'primary' : 'success'} className={`w-full ${consignment ? '!bg-amber-500 hover:!bg-amber-600' : ''}`} icon={consignment ? HandCoins : CheckCircle2} loading={saving} disabled={!cart.length || !warehouseId || (consignment && !counterpartyId)} onClick={submit}>{consignment ? 'Отдать под реализацию' : 'Провести продажу'}</Button>
        </div>
      </div>

      <Modal open={!!sbp} onClose={() => setSbp(null)} title="Оплата по QR-коду СБП"
        footer={<>
          <Button variant="secondary" icon={Download} onClick={() => downloadReceipt(sbp.sale)}>Скачать чек PDF</Button>
          <Button className="ml-auto" onClick={() => { setDone(sbp.sale); setSbp(null); }} autoFocus>Оплата получена</Button>
        </>}>
        {sbp && (
          <div className="flex flex-col items-center py-2 text-center">
            <div className="mb-1 flex items-center gap-2 text-lg font-bold"><QrCode size={22} /> {money(sbp.sale.total)}</div>
            <div className="mb-3 text-sm text-slate-500">{sbp.kind === 'form' ? 'Попросите покупателя отсканировать QR-код камерой телефона — откроется страница оплаты Т-Банка' : 'Попросите покупателя отсканировать QR-код в приложении банка'}</div>
            <QrImage url={sbp.paymentUrl} />
            {sbp.paid
              ? <div className="mt-3 flex items-center gap-1.5 font-semibold text-emerald-600"><CheckCircle2 size={18} /> Оплата прошла</div>
              : <div className="mt-3 text-xs text-slate-400">Ждём оплату — статус обновится сам</div>}
            {sbp.kind === 'form' && <p className="mt-2 max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">QR-код СБП в Т-Банке для этого магазина не включён, поэтому QR ведёт на страницу оплаты банка. Чтобы был прямой QR СБП — включите СБП для терминала в личном кабинете Т-Бизнеса.</p>}
            <p className="mt-3 max-w-sm text-xs text-slate-500">Счёт выставлен через Т-Банк. После оплаты банк пришлёт фискальный чек, а ниже можно скачать товарный чек PDF для покупателя.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} title="Продажа проведена" footer={<>
        {done && <Button variant="secondary" icon={Download} onClick={() => downloadReceipt(done)}>Скачать чек PDF</Button>}
        <Button className="ml-auto" onClick={() => setDone(null)} autoFocus>Новая продажа</Button>
      </>}>
        {done && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-3 rounded-full bg-emerald-50 p-4 text-emerald-600"><CheckCircle2 size={40} /></div>
            <div className="text-lg font-semibold">Чек {done.number}</div>
            <div className="mt-1 text-3xl font-bold">{money(done.total)}</div>
            <div className="mt-2 text-sm text-slate-500">{done.items.length} позиций · {done.channel?.name || 'без канала'}</div>
            {done.consignment && <div className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Под реализацию: <b>{done.counterparty?.name}</b>, долг {money(done.debt)}</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
