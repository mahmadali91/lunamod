import { Store, Truck, CreditCard, Banknote, Phone, Package } from 'lucide-react';
import { useShop } from '../store';

export default function About() {
  const { config, money } = useShop();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Доставка и оплата</h1>
      <div className="space-y-4">
        {config.deliveryMethods.map((m) => {
          const Icon = m.carrier === 'pickup' ? Store : m.carrier === 'courier' ? Truck : Package;
          return (
            <div key={m.id} className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Icon className="shrink-0" />
              <div>
                <h2 className="font-semibold">{m.name} — {m.price === null ? 'по тарифу службы доставки' : m.price === 0 ? 'бесплатно' : money(m.price)}</h2>
                <p className="text-slate-600">{[m.carrier === 'pickup' ? (m.description || config.address) : m.description, m.days && `срок: ${m.days}`, m.freeFrom > 0 && `бесплатно при заказе от ${money(m.freeFrom)}`].filter(Boolean).join(' · ')}{m.carrier === 'pickup' && config.workHours ? `, ${config.workHours}` : ''}</p>
              </div>
            </div>
          );
        })}
        {config.payments.tbank && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><CreditCard className="shrink-0" /><div><h2 className="font-semibold">Онлайн-оплата через Т-Банк</h2><p className="text-slate-600">Банковской картой, через СБП или T-Pay. Платёж проходит на защищённой странице банка.</p></div></div>}
        {config.payments.cash && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Banknote className="shrink-0" /><div><h2 className="font-semibold">Оплата при получении</h2><p className="text-slate-600">Наличными или картой при получении заказа.</p></div></div>}
        <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Package className="shrink-0" /><div><h2 className="font-semibold">Возврат и обмен</h2><p className="text-slate-600">Товар надлежащего качества можно вернуть в течение 7 дней после получения. Подробнее — в <a href="/legal/returns" className="underline">условиях возврата</a>.</p></div></div>
        {config.phone && <div className="flex gap-4 rounded-3xl bg-slate-50 p-6"><Phone className="shrink-0" /><div><h2 className="font-semibold">Остались вопросы?</h2><a href={`tel:${config.phone.replace(/[^\d+]/g, '')}`} className="text-slate-600 underline">{config.phone}</a></div></div>}
      </div>
    </div>
  );
}
