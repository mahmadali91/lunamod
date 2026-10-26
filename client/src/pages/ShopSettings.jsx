import { useEffect, useState } from 'react';
import { Megaphone, Rss, Save, ExternalLink, Search as SearchIcon, BarChart3, Share2, Send, History, CheckCircle2, XCircle, AlertTriangle, CreditCard, MessageSquare, Truck, Store, ShieldCheck, FileText, Bell, MessagesSquare, Plus, Trash2, RotateCcw, ChevronDown } from 'lucide-react';
import PushToggle from '../components/PushToggle';
import { api } from '../api';
import { Button, Field, PasswordInput, PageHeader, RefSelect, Spinner, useToast } from '../ui';

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
  const f = (k) => (v) => setS({ ...s, [k]: v });
  // поля с паролями и ключами — со значком «глаз»
  const inp = (k, props = {}) => (props.type === 'password'
    ? <PasswordInput value={s[k] ?? ''} onChange={(e) => f(k)(e.target.value)} {...props} />
    : <input className="input" value={s[k] ?? ''} onChange={(e) => f(k)(e.target.value)} {...props} />);

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
        <Check v={s.tbankEnabled} set={f('tbankEnabled')} label="Онлайн-оплата картой через Т-Банк (карта, T-Pay)" />
        <Check v={s.sbpEnabled} set={f('sbpEnabled')} label="СБП — отдельной кнопкой: QR-код и переход в приложение банка (через тот же терминал Т-Банка)" />
        {s.sbpEnabled === '1' && <p className="-mt-2 ml-6 text-xs text-slate-500">СБП должна быть подключена к терминалу в Т-Бизнесе (Интернет-эквайринг → Терминал → Способы оплаты → СБП). Комиссия за СБП обычно ниже, чем за карты. Ключи терминала — те же, что ниже.</p>}
        {(s.tbankEnabled === '1' || s.sbpEnabled === '1') && (
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

      <Section icon={Megaphone} title="Покупатели: напоминания и отзывы">
        <Check v={s.cartReminders} set={f('cartReminders')} label="Напоминать о брошенной корзине (пуш через 2 часа и через сутки)" />
        <Check v={s.remindSms} set={f('remindSms')} label="Дублировать по SMS: «снова в наличии» и напоминание через сутки (только с SMS.ru, платно)" />
        <p className="text-xs text-slate-500">«Сообщить о поступлении»: покупатель подписывается на нужный размер, которого нет. Когда товар придёт (приход, корректировка остатков) — получит пуш-уведомление{s.remindSms === '1' ? ' и SMS' : ''}.</p>
        <Check v={s.reviewsEnabled} set={f('reviewsEnabled')} label="Отзывы покупателей с фото и оценкой посадки (публикуются после проверки в разделе «Отзывы»)" />
      </Section>

      <Section icon={Rss} title="Товарный фид (YML)" hint="Каталог для Яндекс Товаров / Маркета, VK и Яндекс Директа. Каждый размер и цвет — отдельное предложение, обновляется автоматически.">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{(s.siteUrl || location.origin).replace(/\/$/, '')}/feed.yml</code>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText((s.siteUrl || location.origin).replace(/\/$/, '') + '/feed.yml'); toast('Ссылка скопирована'); }}>Копировать</Button>
          <a href="/feed.yml" target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon={ExternalLink}>Открыть</Button></a>
        </div>
        <p className="text-xs text-slate-500">Яндекс: <a className="text-indigo-600 underline" href="https://partner.market.yandex.ru" target="_blank" rel="noreferrer">Яндекс Товары</a> → Товары → Загрузить по ссылке. VK: Реклама → Каталоги товаров → Фид. Укажите бренды и описания товаров — это повышает показы.</p>
      </Section>

      <Section icon={MessagesSquare} title="Чат на сайте">
        <Check v={s.chatEnabled} set={f('chatEnabled')} label="Показывать кнопку чата на сайте" />
        <Field label="Приветствие в чате">{inp('chatGreeting')}</Field>
      </Section>

      <Section icon={Bell} title="Уведомления о заказах и сообщениях" hint="Пуш приходят в браузер или на телефон, где вы их включили. Дополнительно можно получать сообщения в мессенджер. Важно: с российских серверов Telegram часто недоступен (блокировка с весны 2026) — надёжнее MAX.">
        <PushToggle />
        <NotifyChannels s={s} f={f} inp={inp} />
      </Section>

      <Section icon={Share2} title="Соцсети в шапке сайта" hint="Заполненные ссылки показываются иконками вверху сайта и в подвале. Пустые — скрыты.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Telegram">{inp('socialTelegram', { placeholder: 'https://t.me/ваш_канал' })}</Field>
          <Field label="ВКонтакте">{inp('socialVk', { placeholder: 'https://vk.com/ваша_группа' })}</Field>
          <Field label="MAX">{inp('socialMax', { placeholder: 'https://max.ru/…' })}</Field>
          <Field label="Instagram">{inp('socialInstagram', { placeholder: 'https://instagram.com/…' })}</Field>
          <Field label="WhatsApp">{inp('socialWhatsapp', { placeholder: 'номер +7 900 000-00-00 или ссылка wa.me' })}</Field>
        </div>
        <p className="text-xs text-slate-500">Instagram принадлежит компании Meta, признанной экстремистской и запрещённой в РФ — при заполнении ссылки в подвале сайта автоматически появится обязательная пометка.</p>
      </Section>

      <Section icon={SearchIcon} title="Поисковики (SEO)" hint="Сайт сам отдаёт поисковикам заголовки, описания, карту сайта (/sitemap.xml) и robots.txt. Здесь — то, что нужно ввести вручную.">
        <Field label="Описание магазина для поисковиков (до 160 символов)">
          <textarea className="input min-h-[70px]" maxLength={300} value={s.seoDescription ?? ''} onChange={(e) => f('seoDescription')(e.target.value)} placeholder="Например: Одежда и обувь с доставкой по России. Примерка при получении, оплата картой или наличными." />
        </Field>
        <Check v={s.noindex} set={f('noindex')} label="Тестовый сайт — закрыть от поисковиков (Яндекс и Google не будут его показывать)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Код подтверждения Яндекс Вебмастера">{inp('yandexVerification', { placeholder: 'содержимое content из meta yandex-verification' })}</Field>
          <Field label="Код подтверждения Google Search Console">{inp('googleVerification', { placeholder: 'содержимое content из meta google-site-verification' })}</Field>
        </div>
        <p className="text-xs text-slate-500">Добавьте сайт в <a className="text-indigo-600 underline" href="https://webmaster.yandex.ru" target="_blank" rel="noreferrer">Яндекс Вебмастер</a>, выберите подтверждение «Мета-тег», вставьте сюда код и сохраните. Затем укажите там карту сайта: {location.origin}/sitemap.xml</p>
      </Section>

      <Section icon={BarChart3} title="Яндекс Метрика" hint="Счётчик ставится только на страницы магазина — админка не отслеживается.">
        <Field label="Номер счётчика">{inp('metrikaId', { placeholder: 'например, 98765432', inputMode: 'numeric' })}</Field>
        <Check v={s.metrikaWebvisor} set={f('metrikaWebvisor')} label="Вебвизор (запись действий посетителей) и карта кликов" />
        <Check v={s.metrikaEcommerce} set={f('metrikaEcommerce')} label="Электронная коммерция (просмотры товаров, корзина, покупки)" />
        <p className="text-xs text-slate-500">Создайте счётчик на <a className="text-indigo-600 underline" href="https://metrika.yandex.ru" target="_blank" rel="noreferrer">metrika.yandex.ru</a> с адресом {location.host} и скопируйте его номер. О метрике автоматически сообщается в уведомлении о cookie и в политике конфиденциальности.</p>
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

function NotifyChannels({ s, f, inp }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [found, setFound] = useState(null); // { channel, list }
  const [log, setLog] = useState(null);
  const saveFirst = () => api('/orders/settings', { method: 'PUT', body: s });
  const test = async (channel) => {
    setBusy('test-' + channel);
    try { await saveFirst(); await api('/orders/settings/test-notify', { method: 'POST', body: { channel } }); toast('Тестовое сообщение отправлено — проверьте мессенджер'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const find = async (channel) => {
    setBusy('find-' + channel);
    try { await saveFirst(); const list = await api('/orders/settings/find-chat-id', { method: 'POST', body: { channel } }); setFound({ channel, list }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const pick = (channel, id) => { f(channel === 'max' ? 'maxChatId' : 'tgChatId')(String(id)); setFound(null); toast('ID подставлен — нажмите «Проверить»'); };
  const Found = ({ channel }) => found?.channel === channel && (
    <div className="space-y-1 sm:col-span-2">
      <div className="text-xs text-slate-500">Кто писал боту — выберите себя:</div>
      {found.list.map((c) => <button key={c.id} onClick={() => pick(channel, c.id)} className="mr-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:border-indigo-400">{c.name} <span className="text-slate-400">· {c.id}</span></button>)}
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div className="font-medium sm:col-span-2">MAX <span className="text-xs font-normal text-emerald-600">— рекомендуется, работает с российских серверов</span></div>
        <Field label="Токен бота MAX">{inp('maxBotToken', { type: 'password', autoComplete: 'new-password' })}</Field>
        <Field label="Ваш ID в MAX (или ID чата)">{inp('maxChatId', { placeholder: 'нажмите «Найти мой ID»' })}</Field>
        <Found channel="max" />
        <p className="text-xs text-slate-500 sm:col-span-2">1) На <a className="text-indigo-600 underline" href="https://business.max.ru" target="_blank" rel="noreferrer">business.max.ru</a> создайте бота (нужна организация или ИП) и скопируйте токен в «Интеграции». 2) Найдите бота в MAX и напишите ему любое сообщение. 3) Сохраните и нажмите «Найти мой ID», затем «Проверить».</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button size="sm" variant="secondary" loading={busy === 'find-max'} onClick={() => find('max')}>Найти мой ID</Button>
          <Button size="sm" variant="secondary" icon={Send} loading={busy === 'test-max'} onClick={() => test('max')}>Проверить</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div className="font-medium sm:col-span-2">Telegram</div>
        <Field label="Токен бота">{inp('tgBotToken', { type: 'password', autoComplete: 'new-password', placeholder: '123456:ABC…' })}</Field>
        <Field label="ID чата">{inp('tgChatId', { placeholder: 'нажмите «Найти мой ID»' })}</Field>
        <Found channel="telegram" />
        <Field label="Адрес прокси для Telegram API (если сервер не достаёт до Telegram)">{inp('tgApiBase', { placeholder: 'https://api.telegram.org (по умолчанию)' })}</Field>
        <p className="self-end text-xs text-slate-500">Создайте бота у @BotFather, скопируйте токен, напишите боту /start, сохраните и нажмите «Найти мой ID». Если проверка пишет «ошибка сети» — Telegram заблокирован для сервера: используйте MAX или свой прокси-адрес (например, Cloudflare Worker), который пересылает запросы на api.telegram.org.</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button size="sm" variant="secondary" loading={busy === 'find-telegram'} onClick={() => find('telegram')}>Найти мой ID</Button>
          <Button size="sm" variant="secondary" icon={Send} loading={busy === 'test-telegram'} onClick={() => test('telegram')}>Проверить</Button>
        </div>
      </div>
      <div>
        <Button size="sm" variant="ghost" icon={History} onClick={async () => setLog(log ? null : await api('/orders/settings/notify-log').catch(() => []))}>{log ? 'Скрыть журнал' : 'Журнал отправки уведомлений'}</Button>
        {log && (log.length === 0 ? <p className="mt-2 text-sm text-slate-500">Уведомлений ещё не было.</p> : (
          <div className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 text-sm">
            {log.map((e, i) => (
              <div key={i} className="px-3 py-2">
                <div className="flex justify-between gap-2"><b className="truncate">{e.title}</b><span className="shrink-0 text-xs text-slate-400">{new Date(e.at).toLocaleString('ru-RU')}</span></div>
                {[['Пуш', e.push], ['Telegram', e.telegram], ['MAX', e.max]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-1.5 text-xs">{v === 'отправлено' || /^(\d+) из \1$/.test(v) ? <CheckCircle2 size={14} className="shrink-0 text-emerald-500" /> : <XCircle size={14} className="shrink-0 text-rose-500" />}<span className="text-slate-500">{k}:</span> {v}</div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
