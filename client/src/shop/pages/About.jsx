import { Store, Truck, CreditCard, Banknote, Phone } from 'lucide-react';
import { useShop } from '../store';

export default function About() {
  const { config, money } = useShop();
  const d = config.delivery;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Доставка и оплата</h1>
      <div className="space-y-4">
        {d.pickup && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Store className="shrink-0" /><div><h2 className="font-semibold">Самовывоз — бесплатно</h2><p className="text-slate-600">{d.pickupAddress || config.address || 'Адрес уточните по телефону'}{config.workHours ? `, ${config.workHours}` : ''}</p></div></div>}
        {d.courier && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Truck className="shrink-0" /><div><h2 className="font-semibold">Доставка курьером — {d.courierPrice ? money(d.courierPrice) : 'бесплатно'}</h2>{d.courierFreeFrom > 0 && <p className="text-slate-600">Бесплатно при заказе от {money(d.courierFreeFrom)}</p>}</div></div>}
        {config.payments.tbank && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><CreditCard className="shrink-0" /><div><h2 className="font-semibold">Онлайн-оплата через Т-Банк</h2><p className="text-slate-600">Банковской картой, через СБП или T-Pay. Платёж проходит на защищённой странице банка.</p></div></div>}
        {config.payments.cash && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Banknote className="shrink-0" /><div><h2 className="font-semibold">Оплата при получении</h2><p className="text-slate-600">Наличными или картой при получении заказа.</p></div></div>}
        {config.phone && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Phone className="shrink-0" /><div><h2 className="font-semibold">Остались вопросы?</h2><a href={`tel:${config.phone.replace(/[^\d+]/g, '')}`} className="text-slate-600 underline">{config.phone}</a></div></div>}
      </div>
    </div>
  );
}
