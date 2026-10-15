import { useEffect, useState } from 'react';
import { Save, ExternalLink, AlertTriangle, CreditCard, MessageSquare, Truck, Store, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Button, Field, PageHeader, RefSelect, Spinner, useToast } from '../ui';

function Section({ icon: Icon, title, children, hint }) {
  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Icon size={18} /> {title}</h2>
      {hint && <p className="mb-4 text-sm text-slate-500">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
const Check = ({ v, set, label }) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v === '1'} onChange={(e) => set(e.target.checked ? '1' : '0')} /> {label}</label>;

export default function ShopSettings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();
  useEffect(() => { api('/orders/settings').then(setS).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!s) return <Spinner />;
  const f = (k) => (v) => setS({ ...s, [k]: v });
  const inp = (k, props = {}) => <input className="input" value={s[k] ?? ''} onChange={(e) => f(k)(e.target.value)} {...props} />;

  const save = async () => {
    setSaving(true);
    try { setS(await api('/orders/settings', { method: 'PUT', body: s })); toast('Настройки магазина сохранены'); } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const testTbank = async () => {
    setTesting(true);
    try { await api('/orders/settings', { method: 'PUT', body: s }); const r = await api('/orders/settings/test-tbank', { method: 'POST' }); toast(r.message); } catch (e) { toast(e.message, 'error'); } finally { setTesting(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Интернет-магазин" subtitle="Витрина на главной странице сайта, вход покупателей по SMS, оплата">
        <a href="/" target="_blank" rel="noreferrer"><Button variant="secondary" icon={ExternalLink}>Открыть магазин</Button></a>
        <Button icon={Save} loading={saving} onClick={save}>Сохранить</Button>
      </PageHeader>

      {s.smsMode === 'test' && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="shrink-0" />
          <div><b>Магазин в тестовом режиме.</b> Код из SMS показывается прямо на экране, а онлайн-оплата без ключей Т-Банка проходит «понарошку». Войти может кто угодно под любым номером. Перед запуском подключите SMS.ru и Т-Банк ниже.</div>
        </div>
      )}

      <Section icon={Store} title="Витрина">
        <Check v={s.enabled} set={f('enabled')} label="Магазин открыт (если выключить — на сайте будет страница «Скоро открытие»)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Название магазина">{inp('title')}</Field>
          <Field label="Подзаголовок">{inp('tagline')}</Field>
          <Field label="Телефон">{inp('phone', { placeholder: '+7 900 000-00-00' })}</Field>
          <Field label="Email">{inp('email')}</Field>
          <Field label="Адрес магазина">{inp('address')}</Field>
          <Field label="Часы работы">{inp('workHours', { placeholder: 'Пн–Вс 10:00–21:00' })}</Field>
          <Field label="Адрес сайта (для ссылок оплаты)">{inp('siteUrl')}</Field>
          <Field label="Склад для наличия и списания заказов"><RefSelect path="/warehouses" value={s.warehouseId ? Number(s.warehouseId) : null} onChange={(v) => f('warehouseId')(v ? String(v) : '')} placeholder="Все склады (списание — с основного)" /></Field>
        </div>
        <Check v={s.showOutOfStock} set={f('showOutOfStock')} label="Показывать товары, которых нет в наличии" />
        <Check v={s.allowBackorder} set={f('allowBackorder')} label="Разрешить заказ больше остатка (под заказ)" />
        <p className="text-xs text-slate-500">Скрыть отдельный товар из магазина можно в его карточке — флажок «Показывать в интернет-магазине».</p>
      </Section>

      <Section icon={Truck} title="Получение заказа">
        <Check v={s.pickupEnabled} set={f('pickupEnabled')} label="Самовывоз" />
        {s.pickupEnabled === '1' && <Field label="Адрес самовывоза">{inp('pickupAddress')}</Field>}
        <Check v={s.courierEnabled} set={f('courierEnabled')} label="Доставка курьером" />
        {s.courierEnabled === '1' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Стоимость доставки">{inp('courierPrice', { type: 'number', min: 0 })}</Field>
            <Field label="Бесплатно от суммы (0 — никогда)">{inp('courierFreeFrom', { type: 'number', min: 0 })}</Field>
          </div>
        )}
      </Section>

      <Section icon={CreditCard} title="Оплата" hint="Покупатель выбирает способ оплаты при оформлении заказа.">
        <Check v={s.cashEnabled} set={f('cashEnabled')} label="Наличными / картой при получении" />
        <Check v={s.tbankEnabled} set={f('tbankEnabled')} label="Онлайн через Т-Банк (карта, СБП, T-Pay)" />
        {s.tbankEnabled === '1' && (
          <div className="space-y-4 rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-600">Ключи — в личном кабинете Т-Бизнес → Интернет-эквайринг → Магазины → Терминалы. Для проверки можно сначала указать тестовый терминал (с окончанием DEMO). В настройках терминала включите уведомления по HTTP — адрес задаётся автоматически: <code className="rounded bg-white px-1">{(s.siteUrl || '').replace(/\/$/, '')}/api/shop/tbank/notify</code></p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="TerminalKey">{inp('tbankTerminalKey', { autoComplete: 'off' })}</Field>
              <Field label="Пароль терминала">{inp('tbankPassword', { type: 'password', autoComplete: 'new-password' })}</Field>
            </div>
            <Check v={s.tbankReceipt} set={f('tbankReceipt')} label="Передавать чек (онлайн-касса Т-Банка, 54-ФЗ)" />
            {s.tbankReceipt === '1' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Система налогообложения"><select className="input" value={s.tbankTaxation} onChange={(e) => f('tbankTaxation')(e.target.value)}>{[['osn', 'ОСН'], ['usn_income', 'УСН доходы'], ['usn_income_outcome', 'УСН доходы − расходы'], ['esn', 'ЕСХН'], ['patent', 'Патент']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                <Field label="НДС"><select className="input" value={s.tbankTax} onChange={(e) => f('tbankTax')(e.target.value)}>{[['none', 'Без НДС'], ['vat0', '0%'], ['vat5', '5%'], ['vat7', '7%'], ['vat10', '10%'], ['vat20', '20%'], ['vat22', '22%']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              </div>
            )}
            <Button variant="secondary" size="sm" icon={ShieldCheck} loading={testing} onClick={testTbank}>Проверить ключи</Button>
          </div>
        )}
      </Section>

      <Section icon={MessageSquare} title="SMS для входа покупателей" hint="Покупатель вводит номер телефона и получает код по SMS.">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {[['test', 'Тестовый режим'], ['smsru', 'SMS.ru']].map(([v, l]) => <button key={v} onClick={() => f('smsMode')(v)} className={`rounded-md px-3 py-1.5 ${s.smsMode === v ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>)}
        </div>
        {s.smsMode === 'smsru' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="API-ключ SMS.ru (api_id)">{inp('smsruApiId', { type: 'password', autoComplete: 'new-password' })}</Field>
            <Field label="Имя отправителя (если согласовано)">{inp('smsSender', { placeholder: 'необязательно' })}</Field>
            <p className="text-xs text-slate-500 sm:col-span-2">Ключ — в кабинете sms.ru → «Программистам». Пополните баланс; одно SMS стоит несколько рублей.</p>
          </div>
        )}
      </Section>

      <div className="flex justify-end"><Button icon={Save} loading={saving} onClick={save}>Сохранить</Button></div>
    </div>
  );
}
