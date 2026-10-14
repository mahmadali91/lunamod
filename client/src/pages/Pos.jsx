import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, ShoppingCart, CheckCircle2, Banknote, CreditCard, Landmark } from 'lucide-react';
import { api } from '../api';
import ProductPicker from '../components/ProductPicker';
import { Button, Field, Modal, RefSelect, Thumb, fmtNum, useMoney, useToast } from '../ui';

const LS = 'pos_defaults';
const payments = [['cash', 'Наличные', Banknote], ['card', 'Карта', CreditCard], ['transfer', 'Перевод', Landmark]];

export default function Pos() {
  const saved = JSON.parse(localStorage.getItem(LS) || '{}');
  const [cart, setCart] = useState([]);
  const [warehouseId, setWarehouseId] = useState(saved.warehouseId || null);
  const [channelId, setChannelId] = useState(saved.channelId || null);
  const [counterpartyId, setCounterpartyId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const money = useMoney();
  const toast = useToast();

  useEffect(() => { localStorage.setItem(LS, JSON.stringify({ warehouseId, channelId })); }, [warehouseId, channelId]);

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
      const s = await api('/sales', { method: 'POST', body: { warehouseId, channelId, counterpartyId, paymentMethod, discount: disc, note, items: cart } });
      setDone(s);
      setCart([]); setDiscount(''); setNote(''); setCounterpartyId(null);
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Новая продажа</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <ProductPicker onPick={add} autoFocus warehouseId={warehouseId} />
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
                    <div className={`text-xs ${i.stock < i.quantity ? 'text-rose-600' : 'text-slate-500'}`}>{i.sku || ''} · на складе {fmtNum(i.stock)} {i.unit}</div>
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
          <Field label="Покупатель"><RefSelect path="/counterparties" value={counterpartyId} onChange={setCounterpartyId} filter={(c) => c.type !== 'supplier'} placeholder="Розничный покупатель" /></Field>
          <div>
            <span className="label">Оплата</span>
            <div className="grid grid-cols-3 gap-2">
              {payments.map(([k, l, Icon]) => (
                <button key={k} onClick={() => setPaymentMethod(k)} className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium transition ${paymentMethod === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
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
            <div className="flex items-end justify-between pt-2"><span className="font-medium">К оплате</span><span className="text-3xl font-bold tracking-tight">{money(total)}</span></div>
          </div>
          <Button size="lg" variant="success" className="w-full" icon={CheckCircle2} loading={saving} disabled={!cart.length || !warehouseId} onClick={submit}>Провести продажу</Button>
        </div>
      </div>

      <Modal open={!!done} onClose={() => setDone(null)} title="Продажа проведена" footer={<Button onClick={() => setDone(null)} autoFocus>Новая продажа</Button>}>
        {done && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="mb-3 rounded-full bg-emerald-50 p-4 text-emerald-600"><CheckCircle2 size={40} /></div>
            <div className="text-lg font-semibold">Чек {done.number}</div>
            <div className="mt-1 text-3xl font-bold">{money(done.total)}</div>
            <div className="mt-2 text-sm text-slate-500">{done.items.length} позиций · {done.channel?.name || 'без канала'}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
