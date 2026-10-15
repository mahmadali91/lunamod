import { useEffect, useState } from 'react';
import { Save, ExternalLink, AlertTriangle, CreditCard, MessageSquare, Truck, Store, ShieldCheck, FileText, Bell, MessagesSquare, Plus, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import PushToggle from '../components/PushToggle';
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
  const [tpl, setTpl] = useState(null);
  const [methods, setMethods] = useState([]);
  const [doc, setDoc] = useState('privacy');
  const toast = useToast();
  useEffect(() => {
    api('/orders/settings').then(setS).catch((e) => toast(e.message, 'error'));
    api('/orders/settings/templates').then((t) => { setTpl(t); setMethods(t.methods); }).catch(() => {});
  }, [toast]);
  if (!s || !tpl) return <Spinner />;
  const setM = (i, patch) => setMethods(methods.map((m, j) => (i === j ? { ...m, ...patch } : m)));
  const addMethod = (carrier) => setMethods([...methods, { id: carrier + '_' + Date.now().toString(36), carrier, name: tpl.carriers[carrier].name, enabled: true, price: 0, markupFixed: 0, markupPercent: 0, freeFrom: 0, days: '', description: '' }]);
  const testTelegram = async () => { try { await api('/orders/settings', { method: 'PUT', body: s }); const r = await api('/orders/settings/test-telegram', { method: 'POST' }); toast(r.message); } catch (e) { toast(e.message, 'error'); } };
  const f = (k) => (v) => setS({ ...s, [k]: v });
  const inp = (k, props = {}) => <input className="input" value={s[k] ?? ''} onChange={(e) => f(k)(e.target.value)} {...props} />;

  const save = async () => {
    setSaving(true);
    try { setS(await api('/orders/settings', { method: 'PUT', body: { ...s, deliveryMethods: JSON.stringify(methods.map(({ needs, api: _a, ...m }) => ({ ...m, price: Number(m.price) || 0, markupFixed: Number(m.markupFixed) || 0, markupPercent: Number(m.markupPercent) || 0, freeFrom: Number(m.freeFrom) || 0 }))) } })); toast('Настройки магазина сохранены'); } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
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

      <Section icon={Truck} title="Доставка" hint="Цена для покупателя = тариф (фиксированный или рассчитанный службой) + наценка в % + наценка в ₽. «Бесплатно от» — порог суммы заказа.">
        <div className="space-y-3">
          {methods.map((m, i) => {
            const c = tpl.carriers[m.carrier];
            return (
              <details key={m.id} className={`rounded-xl border ${m.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-70'}`}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <input type="checkbox" checked={m.enabled} onClick={(e) => e.stopPropagation()} onChange={(e) => setM(i, { enabled: e.target.checked })} />
                  <span className="flex-1 font-medium">{m.name}</span>
                  <span className="text-xs text-slate-500">{c.api ? 'расчёт по API' : `${Number(m.price) || 0} ₽`}{Number(m.markupPercent) ? ` +${m.markupPercent}%` : ''}{Number(m.markupFixed) ? ` +${m.markupFixed} ₽` : ''}</span>
                  <ChevronDown size={16} className="text-slate-400" />
                </summary>
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4 sm:grid-cols-4">
                  <Field label="Название для покупателя" className="col-span-2"><input className="input" value={m.name} onChange={(e) => setM(i, { name: e.target.value })} /></Field>
                  <Field label="Срок (текст)"><input className="input" value={m.days || ''} onChange={(e) => setM(i, { days: e.target.value })} placeholder="2–5 дней" /></Field>
                  <Field label="Бесплатно от, ₽"><input className="input" type="number" min="0" value={m.freeFrom || ''} onChange={(e) => setM(i, { freeFrom: e.target.value })} placeholder="0 — нет" /></Field>
                  {!c.api && <Field label="Тариф, ₽"><input className="input" type="number" min="0" value={m.price} onChange={(e) => setM(i, { price: e.target.value })} /></Field>}
                  <Field label="Наценка, %"><input className="input" type="number" step="any" value={m.markupPercent || ''} onChange={(e) => setM(i, { markupPercent: e.target.value })} placeholder="0" /></Field>
                  <Field label="Наценка, ₽"><input className="input" type="number" step="any" value={m.markupFixed || ''} onChange={(e) => setM(i, { markupFixed: e.target.value })} placeholder="0" /></Field>
                  <Field label={m.carrier === 'pickup' ? 'Адрес самовывоза' : 'Подсказка покупателю'} className="col-span-2 sm:col-span-4"><input className="input" value={m.description || ''} onChange={(e) => setM(i, { description: e.target.value })} /></Field>
                  <div className="col-span-2 flex items-center justify-between sm:col-span-4">
                    <span className="text-xs text-slate-500">{c.api ? 'Стоимость считается службой доставки по адресу и весу заказа.' : ['pek', 'avito', 'ozon', 'fivepost'].includes(m.carrier) ? 'Фиксированный тариф: автоматический расчёт подключается после договора со службой (нужны ключи API).' : ''}</span>
                    <button type="button" onClick={() => setMethods(methods.filter((_, j) => j !== i))} className="flex items-center gap-1 text-xs text-rose-600"><Trash2 size={14} /> Удалить</button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value="" onChange={(e) => e.target.value && addMethod(e.target.value)}>
            <option value="">+ Добавить способ доставки…</option>
            {Object.entries(tpl.carriers).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => confirm('Вернуть стандартный список способов доставки?') && setMethods(tpl.defaultMethods)}>Стандартный набор</Button>
        </div>
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2 text-sm font-medium">Параметры отправки</div>
          <Field label="Вес товара по умолчанию, г"><input className="input" type="number" value={s.defaultWeight} onChange={(e) => f('defaultWeight')(e.target.value)} /></Field>
          <Field label="Почта России: индекс отделения отправки">{inp('pochtaFromIndex', { placeholder: 'например, 125009', inputMode: 'numeric' })}</Field>
          <Field label="Почта России: вид отправления"><select className="input" value={s.pochtaObject} onChange={(e) => f('pochtaObject')(e.target.value)}><option value="4030">Посылка (розничный тариф)</option><option value="23030">Посылка онлайн (по договору)</option><option value="27030">Посылка стандарт (по договору)</option></select></Field>
          <Field label="СДЭК: код города отправки">{inp('cdekFromCityCode', { placeholder: 'Москва — 44', inputMode: 'numeric' })}</Field>
          <Field label="СДЭК: Client ID (Account)">{inp('cdekClientId', { autoComplete: 'off', placeholder: s.cdekTest === '1' ? 'тестовый режим' : '' })}</Field>
          <Field label="СДЭК: Client Secret">{inp('cdekClientSecret', { type: 'password', autoComplete: 'new-password' })}</Field>
          <div className="sm:col-span-2"><Check v={s.cdekTest} set={f('cdekTest')} label="СДЭК: тестовая среда (без договора, цены условные) — выключите, когда введёте боевые ключи" /></div>
          <p className="text-xs text-slate-500 sm:col-span-2">Ключи СДЭК — в личном кабинете lk.cdek.ru → Интеграция. Коды городов: Москва 44, Санкт-Петербург 137, Казань 424, Екатеринбург 250, Новосибирск 270.</p>
        </div>
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

      <Section icon={FileText} title="Продавец и документы" hint="Реквизиты показываются в подвале сайта и подставляются в документы. Тексты — типовые шаблоны: проверьте их у юриста под ваш бизнес.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Продавец (ИП Иванов И.И. / ООО «…»)">{inp('sellerName')}</Field>
          <Field label="ИНН">{inp('sellerInn', { inputMode: 'numeric' })}</Field>
          <Field label="ОГРН / ОГРНИП">{inp('sellerOgrn', { inputMode: 'numeric' })}</Field>
          <Field label="Юридический адрес">{inp('sellerAddress')}</Field>
          <Field label="Email для обращений и претензий">{inp('sellerEmail')}</Field>
          <Field label="Телефон для обращений">{inp('sellerPhone')}</Field>
          <Field label="Адрес для возврата товара">{inp('returnAddress')}</Field>
          <Field label="Дата редакции документов">{inp('legalDate', { placeholder: new Date().toLocaleDateString('ru-RU') })}</Field>
        </div>
        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap gap-1 border-b border-slate-100 p-2">
            {Object.entries(tpl.docs).map(([k, t]) => <button key={k} onClick={() => setDoc(k)} className={`rounded-lg px-3 py-1.5 text-sm ${doc === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t}</button>)}
          </div>
          <div className="space-y-2 p-3">
            <textarea className="input font-mono text-xs" rows={14} value={s['legal_' + doc] || tpl.legal[doc]} onChange={(e) => f('legal_' + doc)(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>«## » — заголовок. Переменные: {'{{sellerName}} {{sellerInn}} {{sellerOgrn}} {{sellerAddress}} {{sellerEmail}} {{sellerPhone}} {{site}} {{date}}'}</span>
              <div className="flex gap-2">
                <a href={`/legal/${doc}`} target="_blank" rel="noreferrer" className="text-indigo-600">Посмотреть на сайте</a>
                <button onClick={() => f('legal_' + doc)('')} className="flex items-center gap-1 text-slate-600"><RotateCcw size={12} /> Вернуть шаблон</button>
              </div>
            </div>
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Обработка персональных данных требует уведомить Роскомнадзор (pd.rkn.gov.ru) до начала обработки, если вы ещё не подавали уведомление.</p>
      </Section>

      <Section icon={MessagesSquare} title="Чат на сайте">
        <Check v={s.chatEnabled} set={f('chatEnabled')} label="Показывать кнопку чата на сайте" />
        <Field label="Приветствие в чате">{inp('chatGreeting')}</Field>
      </Section>

      <Section icon={Bell} title="Уведомления о заказах и сообщениях" hint="Пуш-уведомления приходят в браузер или на телефон, где вы их включили. Telegram — надёжный запасной канал.">
        <PushToggle />
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <Field label="Telegram: токен бота">{inp('tgBotToken', { type: 'password', autoComplete: 'new-password', placeholder: '123456:ABC…' })}</Field>
          <Field label="Telegram: ID чата">{inp('tgChatId', { placeholder: 'например, 123456789' })}</Field>
          <p className="text-xs text-slate-500 sm:col-span-2">Создайте бота у @BotFather и скопируйте токен. Напишите своему боту /start, затем узнайте свой ID у @userinfobot. Для уведомлений в группу добавьте бота в группу и укажите ID группы.</p>
          <div><Button size="sm" variant="secondary" onClick={testTelegram}>Проверить Telegram</Button></div>
        </div>
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
