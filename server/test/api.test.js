// Автотесты API. Нужна пустая (или тестовая) база MySQL в DATABASE_URL.
//   ADMIN_PASSWORD=test npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = process.env.ADMIN_PASSWORD || 'test-password';
const U = Date.now().toString(36); // уникальный суффикс, чтобы тесты не мешали существующим данным
const D = String(Date.now()).slice(-10); // уникальные цифры для своих штрихкодов
let server, token;

async function api(p, { method = 'GET', body, auth = true, form } = {}) {
  const headers = {};
  if (auth) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + '/api' + p, { method, headers, body: form || (body && JSON.stringify(body)) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
// решение капчи, как в браузере: перебор чисел до совпадения хэша
const cap = async () => {
  const c = await fetch(BASE + '/api/captcha').then((r) => r.json());
  const h = (x) => require('crypto').createHash('sha256').update(x).digest('hex');
  for (let n = 0; n <= c.maxnumber; n++) if (h(c.salt + n) === c.challenge) return Buffer.from(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature })).toString('base64');
  throw new Error('капча не решена');
};
const ok = async (...a) => { const r = await api(...a); assert.ok(r.status < 300, `${a[0]} → ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const ean13ok = (c) => { let s = 0; for (let i = 0; i < 12; i++) s += +c[i] * (i % 2 ? 3 : 1); return (10 - (s % 10)) % 10 === +c[12]; };

before(async () => {
  execFileSync('node', ['prisma/seed.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: PASS }, stdio: 'ignore' });
  // минимальная «сборка» фронтенда — для проверки страниц магазина (SEO)
  const dist = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dist-'));
  require('fs').mkdirSync(dist + '/admin');
  require('fs').writeFileSync(dist + '/shop.html', '<!doctype html><html><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>');
  require('fs').writeFileSync(dist + '/admin/index.html', '<!doctype html><html><head><title>admin</title></head><body><div id="root"></div></body></html>');
  server = spawn('node', ['src/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), CLIENT_DIST: dist, SHOP_TEST_EMAIL_CODE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) break; } catch { /* ещё стартует */ }
    await new Promise((r) => setTimeout(r, 200));
  }
});
after(() => server?.kill());

let w1, w2, ch, cp, product;

test('health и вход', async () => {
  const h = await fetch(BASE + '/api/health').then((r) => r.json());
  assert.equal(h.db, 'ok');
  assert.equal(h.app, require('../../package.json').version);
  assert.equal((await api('/products', { auth: false })).status, 401, 'без токена — 401');
  assert.equal((await api('/auth/login', { method: 'POST', auth: false, body: { login: 'admin', password: 'wrong' } })).status, 401);
  const r = await ok('/auth/login', { method: 'POST', auth: false, body: { login: 'admin', password: PASS } });
  token = r.token;
  assert.ok(token);
});

test('справочники: склады, канал, контрагент', async () => {
  w1 = await ok('/warehouses', { method: 'POST', body: { name: 'Склад A ' + U } });
  w2 = await ok('/warehouses', { method: 'POST', body: { name: 'Склад B ' + U } });
  ch = await ok('/channels', { method: 'POST', body: { name: 'Канал ' + U, type: 'online' } });
  cp = await ok('/counterparties', { method: 'POST', body: { name: 'Поставщик ' + U, type: 'supplier', phone: '+7 700' } });
  assert.equal((await api('/warehouses', { method: 'POST', body: { name: '' } })).status, 400, 'пустое название запрещено');
});

test('товар: автоматический EAN-13, характеристики, начальный остаток', async () => {
  product = await ok('/products', { method: 'POST', body: {
    name: 'Шапка Тест ' + U, sku: 'T-' + U, price: 1000, costPrice: 400,
    attributes: [{ name: 'Цвет', value: 'Чёрный' }], initialStock: [{ warehouseId: w1.id, quantity: 10 }],
  } });
  const code = product.barcodes[0].code;
  assert.match(code, /^200\d{10}$/);
  assert.ok(ean13ok(code), 'контрольная цифра EAN-13');
  assert.equal(product.attributes[0].value, 'Чёрный');
});

test('свой штрихкод и запрет дублей', async () => {
  const own = '46' + D;
  const p = await ok('/products/' + product.id, { method: 'PUT', body: { ...product, barcodes: [product.barcodes[0].code, own] } });
  assert.equal(p.barcodes.length, 2);
  const dup = await api('/products', { method: 'POST', body: { name: 'Дубль ' + U, barcodes: [own] } });
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /уже используется/);
});

test('поиск по штрихкоду, артикулу и названию (без учёта регистра)', async () => {
  assert.equal((await ok('/products/lookup/' + product.barcodes[0].code)).id, product.id);
  assert.equal((await ok('/products/lookup/T-' + U)).id, product.id);
  assert.equal((await api('/products/lookup/NO-SUCH-' + U)).status, 404);
  const s = await ok('/products?q=' + encodeURIComponent('шапка тест ' + U));
  assert.ok(s.items.some((p) => p.id === product.id));
});

test('приход, продажа со скидкой, возврат', async () => {
  await ok('/receipts', { method: 'POST', body: { warehouseId: w1.id, counterpartyId: cp.id, items: [{ productId: product.id, quantity: 5, costPrice: 450 }] } });
  const stock = async () => (await ok('/products/' + product.id)).stocks.find((s) => s.warehouseId === w1.id).quantity;
  assert.equal(await stock(), 15);
  const sale = await ok('/sales', { method: 'POST', body: { warehouseId: w1.id, channelId: ch.id, discount: 100, items: [{ productId: product.id, quantity: 3, price: 1000 }] } });
  assert.equal(sale.total, 2900);
  assert.equal(await stock(), 12);
  await ok(`/sales/${sale.id}/return`, { method: 'POST' });
  assert.equal(await stock(), 15);
});

test('продажа при нулевом остатке уводит остаток в минус', async () => {
  const p = await ok('/products', { method: 'POST', body: { name: 'Без остатка ' + U, price: 50 } });
  const sale = await ok('/sales', { method: 'POST', body: { warehouseId: w2.id, items: [{ productId: p.id, quantity: 3, price: 50 }] } });
  assert.equal(sale.total, 150);
  const after = await ok('/products/' + p.id);
  assert.equal(after.stocks.find((s) => s.warehouseId === w2.id).quantity, -3);
  await ok(`/sales/${sale.id}/return`, { method: 'POST' });
});

test('реализация: долг, оплаты, возврат части товара', async () => {
  const p = await ok('/products', { method: 'POST', body: { name: 'Реализация ' + U, price: 100, initialStock: [{ warehouseId: w1.id, quantity: 20 }] } });
  const need = await api('/sales', { method: 'POST', body: { warehouseId: w1.id, consignment: true, items: [{ productId: p.id, quantity: 1, price: 100 }] } });
  assert.equal(need.status, 400, 'без контрагента нельзя');
  const buyer = await ok('/counterparties', { method: 'POST', body: { name: 'Магазин-партнёр ' + U } });
  let s = await ok('/sales', { method: 'POST', body: { warehouseId: w1.id, counterpartyId: buyer.id, consignment: true, prepaid: 200, dueDate: '2030-01-01', items: [{ productId: p.id, quantity: 10, price: 100 }] } });
  assert.equal(s.consignment, true);
  assert.equal(s.total, 1000);
  assert.equal(s.debt, 800, 'долг = сумма − предоплата');
  assert.equal(s.payments.length, 1);
  s = await ok(`/sales/${s.id}/payments`, { method: 'POST', body: { amount: 300 } });
  assert.equal(s.debt, 500);
  assert.equal((await api(`/sales/${s.id}/payments`, { method: 'POST', body: { amount: 10000 } })).status, 400, 'переплата запрещена');
  // вернули 4 непроданных — долг уменьшается, товар на складе
  s = await ok(`/sales/${s.id}/return-items`, { method: 'POST', body: { items: [{ saleItemId: s.items[0].id, quantity: 4 }] } });
  assert.equal(s.total, 600);
  assert.equal(s.debt, 100);
  assert.equal((await ok('/products/' + p.id)).stocks.find((x) => x.warehouseId === w1.id).quantity, 14);
  const sum = await ok('/sales/consignment/summary');
  assert.ok(sum.byCounterparty.some((c) => c.id === buyer.id && c.debt === 100));
  assert.ok((await ok('/sales?consignment=1&open=1')).some((x) => x.id === s.id));
  s = await ok(`/sales/${s.id}/payments`, { method: 'POST', body: { amount: 100 } });
  assert.equal(s.debt, 0, 'полностью оплачено');
  assert.ok(!(await ok('/sales?consignment=1&open=1')).some((x) => x.id === s.id));
});

test('массовое редактирование остатков', async () => {
  const p = await ok('/products', { method: 'POST', body: { name: 'Массово ' + U } });
  const r = await ok('/stock/bulk', { method: 'POST', body: { items: [
    { productId: p.id, warehouseId: w1.id, quantity: 12 }, { productId: p.id, warehouseId: w2.id, quantity: 5 },
  ] } });
  assert.equal(r.changed, 2);
  const st = await ok('/stock?q=' + encodeURIComponent('Массово ' + U));
  const row = st.rows.find((x) => x.id === p.id);
  assert.equal(row.byWh[w1.id], 12);
  assert.equal(row.byWh[w2.id], 5);
  assert.ok('image' in row, 'в остатках есть фото');
  assert.equal((await ok('/stock/bulk', { method: 'POST', body: { items: [{ productId: p.id, warehouseId: w1.id, quantity: 12 }] } })).changed, 0, 'без изменений — ничего не пишем');
});

test('популярные товары для кассы', async () => {
  const list = await ok('/products/popular?limit=5');
  assert.ok(list.length > 0 && list.length <= 5);
  for (let i = 1; i < list.length; i++) if (list[i].sold > 0) assert.ok(list[i - 1].sold >= list[i].sold, 'по убыванию продаж');
});

test('перемещение и инвентаризация', async () => {
  await ok('/stock/transfer', { method: 'POST', body: { fromWarehouseId: w1.id, toWarehouseId: w2.id, items: [{ productId: product.id, quantity: 4 }] } });
  await ok('/stock/adjust', { method: 'POST', body: { warehouseId: w2.id, items: [{ productId: product.id, quantity: 7 }] } });
  const p = await ok('/products/' + product.id);
  assert.equal(p.stocks.find((s) => s.warehouseId === w1.id).quantity, 11);
  assert.equal(p.stocks.find((s) => s.warehouseId === w2.id).quantity, 7);
});

test('загрузка фото товара', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('images', new Blob([png], { type: 'image/png' }), 'photo.png');
  const [img] = await ok(`/products/${product.id}/images`, { method: 'POST', form });
  const res = await fetch(BASE + img.path);
  assert.equal(res.status, 200);
  await ok(`/products/${product.id}/images/${img.id}`, { method: 'DELETE' });
});

test('дашборд: период и «Сегодня» по часам', async () => {
  const d = await ok('/dashboard?days=7');
  assert.ok(d.kpi.salesCount >= 0);
  assert.equal(d.chart.length, 7);
  const t = await ok('/dashboard?days=1');
  assert.equal(t.hourly, true);
  assert.equal(t.chart.length, 24);
  assert.ok(t.chart.reduce((a, h) => a + h.count, 0) === t.kpi.todayCount);
});

test('импорт товаров из Excel', async () => {
  const rows = [
    { _line: 2, name: 'Импорт платье ' + U, sku: 'IMP-1-' + U, category: 'Импорт ' + U, price: '2 990', costPrice: '1200,50', quantity: 7, attributes: { Размер: 'M', Цвет: 'Синий' } },
    { _line: 3, name: 'Импорт юбка ' + U, sku: 'IMP-2-' + U, barcode: '47' + D, price: 1500 },
    { _line: 4, sku: 'NO-NAME-' + U },
    { _line: 5, name: 'Плохая цена ' + U, price: 'abc' },
  ];
  const r = await ok('/products/import', { method: 'POST', body: { rows, warehouseId: w1.id } });
  assert.equal(r.created, 2);
  assert.equal(r.errors.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [4, 5]);
  const p = await ok('/products/lookup/IMP-1-' + U);
  assert.equal(p.price, 2990);
  assert.equal(p.costPrice, 1200.5);
  assert.equal(p.category.name, 'Импорт ' + U);
  assert.equal(p.stocks.find((s) => s.warehouseId === w1.id).quantity, 7);
  assert.equal(p.attributes.find((a) => a.name === 'Размер').value, 'M');
  assert.match(p.barcodes[0].code, /^200\d{10}$/, 'без штрихкода — генерируется EAN-13');
  // повторный импорт по артикулу обновляет, а не создаёт
  const r2 = await ok('/products/import', { method: 'POST', body: { rows: [{ sku: 'IMP-1-' + U, price: 3490, quantity: 10 }], warehouseId: w1.id } });
  assert.equal(r2.updated, 1);
  assert.equal(r2.created, 0);
  const p2 = await ok('/products/lookup/IMP-1-' + U);
  assert.equal(p2.price, 3490);
  assert.equal(p2.name, 'Импорт платье ' + U, 'пустые поля не затирают данные');
  assert.equal(p2.stocks.find((s) => s.warehouseId === w1.id).quantity, 10);
});

test('статистика: сквозная аналитика, расходы, ABC', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const range = `from=${today}&to=${today}`;
  const st = await ok(`/stats?${range}&groupBy=channel`);
  assert.ok(st.totals.revenue > 0, 'есть выручка за сегодня');
  const sumRows = st.rows.reduce((a, r) => a + r.revenue, 0);
  assert.ok(Math.abs(sumRows - st.totals.revenue) < 1, 'сумма по каналам = итог');
  // расход на канал → чистая прибыль и ROMI
  await ok('/stats/expenses', { method: 'POST', body: { channelId: ch.id, amount: 100, date: today } });
  const st2 = await ok(`/stats?${range}&groupBy=channel`);
  const row = st2.rows.find((r) => r.id === ch.id);
  assert.equal(row.expense, 100);
  assert.equal(row.netProfit, Math.round((row.profit - 100) * 100) / 100);
  assert.equal(st2.totals.expense, st.totals.expense + 100);
  for (const g of ['category', 'product', 'counterparty', 'warehouse', 'payment']) assert.ok((await ok(`/stats?${range}&groupBy=${g}`)).rows.length > 0, g);
  const tr = await ok(`/stats/trend?${range}`);
  assert.equal(tr.points.length, 1);
  const abc = await ok(`/stats/abc?${range}&by=product&metric=revenue`);
  const shares = abc.rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(shares - 100) <= Math.max(0.5, abc.rows.length * 0.05), 'доли в сумме 100% (с точностью округления до 0,1 у каждой строки)');
  assert.equal(abc.rows[0].abc, 'A', 'лидер всегда в группе A');
  assert.ok(abc.rows.every((r, i) => i === 0 || abc.rows[i - 1].revenue >= r.revenue), 'сортировка по убыванию');
  assert.equal(abc.summary.A.count + abc.summary.B.count + abc.summary.C.count, abc.rows.length);
  assert.ok((await ok(`/stats/abc?${range}&by=category&metric=profit`)).rows.length > 0);
  assert.equal((await api('/stats?from=2030-01-02&to=2030-01-01')).status, 400);
});

test('выгрузка товаров и загрузка обратно по ID', async () => {
  const list = await ok('/products/export');
  const p = list.find((x) => x.id === product.id);
  assert.ok(p && p.barcodes.length >= 1 && 'totalStock' in p);
  const r = await ok('/products/import', { method: 'POST', body: { rows: [{ id: p.id, name: p.name + ' (изм.)', price: 1234 }] } });
  assert.equal(r.updated, 1);
  const after = await ok('/products/' + p.id);
  assert.equal(after.price, 1234);
  assert.equal(after.sku, p.sku, 'артикул не затронут');
  await ok('/products/import', { method: 'POST', body: { rows: [{ id: p.id, name: p.name }] } });
});

test('категории: количество товаров', async () => {
  const cats = await ok('/categories');
  const c = cats.find((x) => x.name === 'Импорт ' + U);
  assert.ok(c && c._count.products === 1);
});

const shop = async (p, { method = 'GET', body, token: t } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(BASE + '/api/shop' + p, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

test('интернет-магазин: каталог, вход по email, заказ, выдача, оплата', async () => {
  // настройки: онлайн-оплата включена (без ключей → тестовая оплата)
  const methods = [
    { id: 'pickup', carrier: 'pickup', name: 'Самовывоз', enabled: true, price: 0, description: 'ул. Тестовая, 1' },
    { id: 'courier', carrier: 'courier', name: 'Курьер', enabled: true, price: 300, freeFrom: 5000 },
    { id: 'ozon', carrier: 'ozon', name: 'Ozon', enabled: true, price: 200, markupPercent: 10, markupFixed: 15 },
    { id: 'pek', carrier: 'pek', name: 'ПЭК', enabled: false, price: 600 },
  ];
  const st = await ok('/orders/settings', { method: 'PUT', body: { tbankEnabled: '1', tbankPassword: 'secret-pass', deliveryMethods: JSON.stringify(methods), warehouseId: String(w1.id), sellerName: 'ИП Тестов Т.Т.', sellerInn: '123456789012' } });
  assert.equal(st.tbankPassword, '••••••', 'секреты маскируются');
  assert.equal((await ok('/orders/settings', { method: 'PUT', body: { tbankPassword: '••••••' } })).tbankPassword, '••••••', 'маска не затирает пароль');
  await ok('/orders/settings', { method: 'PUT', body: { tbankPassword: '' } });

  const p = await ok('/products', { method: 'POST', body: { name: 'Магазин платье ' + U, price: 2000, costPrice: 800, initialStock: [{ warehouseId: w1.id, quantity: 5 }] } });
  const hidden = await ok('/products', { method: 'POST', body: { name: 'Скрытый ' + U, price: 100, showInShop: false, initialStock: [{ warehouseId: w1.id, quantity: 5 }] } });
  const list = (await shop('/products?q=' + encodeURIComponent(U) + '&limit=60')).data.items;
  assert.ok(list.some((x) => x.id === p.id), 'товар в каталоге');
  assert.ok(!list.some((x) => x.id === hidden.id), 'скрытый не показывается');
  assert.equal((await shop('/products/' + p.id)).data.stock, 5);
  assert.equal((await shop('/products/' + hidden.id)).status, 404);
  assert.equal((await shop('/products/' + p.id)).data.costPrice, undefined, 'закупочная цена не раскрывается');

  // вход/регистрация по email (в тестах SHOP_TEST_EMAIL_CODE=1 — код возвращается ответом)
  const phone = '79' + D.slice(-9);
  const email = `shop${U}@example.ru`;
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: 'не почта' } })).status, 400);
  const rc = await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email } });
  assert.equal(rc.status, 200); assert.match(rc.data.testCode, /^\d{6}$/);
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email } })).status, 429, 'повтор не раньше 60 с');
  assert.equal((await shop('/auth/email/verify', { method: 'POST', body: { email, code: rc.data.testCode === '000000' ? '111111' : '000000' } })).status, 400);
  const noConsent = await shop('/auth/email/verify', { method: 'POST', body: { email, code: rc.data.testCode } });
  assert.equal(noConsent.status, 400, 'без согласия на обработку ПД регистрация невозможна');
  assert.match(noConsent.data.error, /согласие/);
  const v = await shop('/auth/email/verify', { method: 'POST', body: { email, code: rc.data.testCode, name: 'Ольга', consent: true } });
  const ct = v.data.token; assert.ok(ct);
  assert.equal((await shop('/auth/email/verify', { method: 'POST', body: { email, code: rc.data.testCode, consent: true } })).status, 400, 'код одноразовый');
  assert.equal((await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + ct } })).status, 401, 'токен покупателя не пускает в админку');
  assert.equal((await shop('/me', { token })).status, 401, 'админский токен не подходит магазину');
  assert.equal((await shop('/me', { token: ct })).data.phone, null, 'телефон не нужен при регистрации');
  assert.equal((await shop('/me', { token: ct })).data.emailVerifiedAt !== null, true, 'email подтверждён');

  // способы доставки и расчёт с наценкой
  const cfg = (await shop('/config')).data;
  assert.deepEqual(cfg.deliveryMethods.map((m) => m.id), ['pickup', 'courier', 'ozon'], 'выключенные способы скрыты');
  assert.equal(cfg.seller.inn, '123456789012');
  const quote = await shop('/delivery/quote', { method: 'POST', body: { methodId: 'ozon', items: [{ productId: p.id, quantity: 1 }], to: { point: 'Казань, ул. Баумана, 1' } } });
  assert.equal(quote.data.price, 235, '200 + 10% + 15 ₽');
  assert.equal((await shop('/delivery/quote', { method: 'POST', body: { methodId: 'ozon', items: [{ productId: p.id, quantity: 1 }], to: {} } })).status, 400, 'без пункта выдачи');
  assert.equal((await shop('/delivery/quote', { method: 'POST', body: { methodId: 'pek', items: [{ productId: p.id, quantity: 1 }], to: { address: 'x' } } })).status, 400, 'выключенный способ');

  // заказ: цена из базы, доставка, остатки, согласие с офертой
  const base = { phone, delivery: 'courier', deliveryTo: { address: 'ул. Тестовая, 1' }, agree: true };
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { ...base, phone: '', items: [{ productId: p.id, quantity: 1 }] } })).status, 400, 'без телефона заказ не оформить');
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { ...base, items: [{ productId: p.id, quantity: 6 }] } })).status, 400, 'больше остатка нельзя');
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { ...base, items: [{ productId: p.id, quantity: 1 }], deliveryTo: {} } })).status, 400, 'курьер без адреса');
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { ...base, agree: false, items: [{ productId: p.id, quantity: 1 }] } })).status, 400, 'без согласия с офертой');
  const o1 = (await shop('/orders', { method: 'POST', token: ct, body: { ...base, items: [{ productId: p.id, quantity: 2, price: 1 }], paymentMethod: 'cash' } })).data.order;
  assert.equal(o1.subtotal, 4000); assert.equal(o1.deliveryPrice, 300); assert.equal(o1.total, 4300);
  assert.equal(o1.deliveryName, 'Курьер'); assert.ok(o1.agreedAt);
  const o2 = (await shop('/orders', { method: 'POST', token: ct, body: { ...base, items: [{ productId: p.id, quantity: 3 }] } })).data.order;
  assert.equal(o2.deliveryPrice, 0, 'бесплатная доставка от 5000');
  assert.equal((await shop('/orders', { token: ct })).data.length, 2);

  // админка: выдача заказа → продажа, списание, покупатель
  const adminList = await ok('/orders?status=active');
  assert.ok(adminList.items.some((x) => x.id === o1.id));
  await ok(`/orders/${o1.id}/status`, { method: 'POST', body: { status: 'confirmed' } });
  const done = await ok(`/orders/${o1.id}/status`, { method: 'POST', body: { status: 'completed' } });
  assert.equal(done.status, 'completed'); assert.ok(done.saleId); assert.equal(done.paymentStatus, 'paid');
  const sale = await ok('/sales/' + done.saleId);
  assert.equal(sale.total, 4300); assert.equal(sale.channel.name, 'Интернет-магазин'); assert.equal(sale.counterparty.phone, '+' + phone);
  assert.equal((await ok('/products/' + p.id)).stocks.find((x) => x.warehouseId === w1.id).quantity, 3);
  assert.equal((await api(`/orders/${o1.id}/status`, { method: 'POST', body: { status: 'new' } })).status, 400, 'закрытый заказ не меняется');
  // покупатель отменяет новый заказ
  assert.equal((await shop(`/orders/${o2.id}/cancel`, { method: 'POST', token: ct })).data.status, 'cancelled');

  assert.equal((await shop('/me', { token: ct })).data.phone, phone, 'телефон из заказа сохранился в аккаунт');

  // онлайн-оплата в тестовом режиме
  const o3 = await shop('/orders', { method: 'POST', token: ct, body: { phone, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'tbank', delivery: 'pickup', agree: true } });
  assert.equal(o3.data.paymentUrl, `/order/${o3.data.order.id}?testpay=1`);
  const paid = (await shop(`/orders/${o3.data.order.id}/test-pay`, { method: 'POST', token: ct })).data;
  assert.equal(paid.paymentStatus, 'paid'); assert.equal(paid.status, 'confirmed');
  // чужой заказ недоступен
  const otherEmail = `shop2${U}@example.ru`;
  const rc2 = await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: otherEmail } });
  const other = (await shop('/auth/email/verify', { method: 'POST', body: { email: otherEmail, code: rc2.data.testCode, consent: true } })).data.token;
  assert.equal((await shop(`/orders/${o3.data.order.id}`, { token: other })).status, 404);
  // уведомление банка с неверной подписью отклоняется
  const bad = await fetch(BASE + '/api/shop/tbank/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ TerminalKey: 'x', OrderId: o3.data.order.number, Status: 'CONFIRMED', Token: 'bad' }) });
  assert.equal(bad.status, 400);
  await ok('/orders/settings', { method: 'PUT', body: { tbankEnabled: '0' } });
});

test('юридические документы магазина', async () => {
  for (const id of ['privacy', 'consent', 'offer', 'returns', 'terms']) {
    const r = await fetch(BASE + '/api/shop/legal/' + id).then((x) => x.json());
    assert.ok(r.title && r.text.length > 300, id);
    assert.ok(!/\{\{\w+\}\}/.test(r.text), id + ': все переменные подставлены');
  }
  const offer = await fetch(BASE + '/api/shop/legal/offer').then((x) => x.json());
  assert.match(offer.text, /ИП Тестов Т\.Т\./, 'реквизиты продавца подставлены');
  // свой текст из админки
  await ok('/orders/settings', { method: 'PUT', body: { legal_returns: 'Свои условия {{sellerName}}' } });
  assert.equal((await fetch(BASE + '/api/shop/legal/returns').then((x) => x.json())).text, 'Свои условия ИП Тестов Т.Т.');
  await ok('/orders/settings', { method: 'PUT', body: { legal_returns: '' } });
  assert.equal((await fetch(BASE + '/api/shop/legal/nope')).status, 404);
});

test('чат: только для вошедших, фото, голосовые, антиспам, ответ из админки', async () => {
  const login = async (n, name) => {
    const em = `chat${n}${U}@example.ru`;
    const rc = await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: em } });
    return (await shop('/auth/email/verify', { method: 'POST', body: { email: em, code: rc.data.testCode, name, consent: true } })).data.token;
  };
  const send = (tk, body, form) => fetch(BASE + '/api/shop/chat', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, ...(form ? {} : { 'Content-Type': 'application/json' }) }, body: form || JSON.stringify(body) });
  const read = (tk, q = '') => fetch(BASE + '/api/shop/chat' + q, { headers: { Authorization: 'Bearer ' + tk } }).then((x) => x.json());
  assert.equal((await fetch(BASE + '/api/shop/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"x"}' })).status, 401, 'без входа чат недоступен');
  assert.equal((await fetch(BASE + '/api/shop/chat')).status, 401);
  const a = await login(5, 'Чат А ' + U), b = await login(6, 'Чат Б ' + U), c = await login(7, 'Чат В ' + U);
  assert.equal((await send(a, { text: '   ' })).status, 400, 'пустое сообщение');
  const first = await send(a, { text: 'Здравствуйте, где мой заказ?' });
  assert.equal(first.status, 201); assert.equal((await first.json()).cooldown, 10);
  // антиспам: следующее сообщение не раньше чем через 10 с
  const spam = await send(a, { text: 'ещё' });
  assert.equal(spam.status, 429); assert.ok((await spam.json()).retryAfter > 0);
  assert.ok((await read(a)).cooldown > 0);
  // фото (PNG); SVG не принимается (может содержать скрипт)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const fd2 = new FormData(); fd2.append('image', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await send(b, null, fd2)).status, 400);
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'screen.png');
  const img = await (await send(b, null, fd)).json();
  assert.match(img.image, /^\/uploads\/chat\/[a-f0-9]{32}\.png$/);
  assert.equal((await fetch(BASE + img.image)).status, 200);
  // голосовое сообщение
  const fdv = new FormData(); fdv.append('audio', new Blob([Buffer.from('1a45dfa3', 'hex')], { type: 'audio/webm;codecs=opus' }), 'voice.webm'); fdv.append('duration', '7');
  const voice = await (await send(c, null, fdv)).json();
  assert.match(voice.audio, /^\/uploads\/chat\/[a-f0-9]{32}\.webm$/); assert.equal(voice.duration, 7);
  // админка видит чаты и непрочитанные
  const list = await ok('/chats');
  const conv = list.find((x) => x.name === 'Чат А ' + U);
  assert.ok(conv); assert.equal(conv.unreadAdmin, 1); assert.equal(conv.phone, null, 'клиент без телефона — номер пустой');
  assert.match(list.find((x) => x.name === 'Чат В ' + U).lastText, /Голосовое/);
  assert.ok((await ok('/chats/unread')).unread >= 3);
  // ответ с фото из админки
  const fd3 = new FormData(); fd3.append('text', 'Вот фото вашего заказа'); fd3.append('image', new Blob([png], { type: 'image/png' }), 'order.png');
  const reply = await fetch(BASE + `/api/chats/${conv.id}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd3 }).then((x) => x.json());
  assert.equal(reply.sender, 'admin'); assert.ok(reply.image);
  const mine = await read(a);
  assert.equal(mine.messages.length, 2); assert.equal(mine.conversation.unread, 1);
  assert.equal((await read(a, '?after=' + mine.messages[0].id)).messages.length, 1, 'дозагрузка только новых');
  // история хранится в аккаунте, другой покупатель её не видит
  assert.equal((await read(b)).messages.length, 1);
  // пуш-подписка: проверка формата
  assert.equal((await api('/push/subscribe', { method: 'POST', body: { endpoint: 'x' } })).status, 400);
  assert.ok((await ok('/push/key')).key.length > 40, 'ключ VAPID создан');
});

test('карточки «как на WB»: цвет — карточка, размеры внутри, модель из нескольких цветов; партии (FIFO)', async () => {
  const card = await ok('/products', { method: 'POST', body: { name: 'Платье Вар ' + U, sku: 'VAR-' + D, color: 'Красный', price: 3000, costPrice: 100,
    variantWarehouseId: w1.id, variants: [{ size: 'S', quantity: 3 }, { size: 'M' }, { size: 'L', price: 3200, barcode: '29' + D.slice(-10) }] } });
  assert.equal(card.hasVariants, true); assert.equal(card.color, 'Красный');
  assert.equal(card.variants.length, 3);
  const rs = card.variants.find((v) => v.size === 'S');
  assert.equal(rs.name, 'Платье Вар ' + U + ' · Красный · S', 'название размера');
  assert.equal(rs.color, 'Красный', 'цвет размера = цвет карточки');
  assert.equal(card.variants.find((v) => v.size === 'L').price, 3200);
  assert.equal(card.variants.find((v) => v.size === 'L').barcodes[0].code, '29' + D.slice(-10), 'свой штрихкод');
  assert.equal(new Set(card.variants.map((v) => v.barcodes[0].code)).size, 3, 'у каждого размера свой штрихкод');
  assert.equal((await api('/products', { method: 'POST', body: { name: 'Дубль ' + U, variants: [{ size: 'S' }, { size: 's' }] } })).status, 400, 'размер дважды');
  // «Дублировать»: карточка другого цвета той же модели — свой артикул, те же размеры, новые штрихкоды
  const black = (await api(`/products/${card.id}/duplicate`, { method: 'POST', body: { color: 'Чёрный' } })).data;
  assert.equal(black.color, 'Чёрный'); assert.equal(black.sku, 'VAR-' + D + '-2'); assert.ok(black.groupId);
  assert.deepEqual(black.variants.map((v) => v.size), ['S', 'M', 'L']);
  assert.ok(black.variants.every((v) => v.color === 'Чёрный' && !card.variants.some((c) => c.barcodes[0].code === v.barcodes[0].code)));
  const full = await ok('/products/' + card.id);
  assert.deepEqual(full.group.map((g) => g.color), ['Красный', 'Чёрный'], 'модель из двух цветов');
  // «Из своей карточки»: присоединить отдельную карточку
  const white = await ok('/products', { method: 'POST', body: { name: 'Платье Вар белое ' + U, sku: 'VARW-' + D, color: 'Белый', price: 3000, variants: [{ size: 'M' }] } });
  await ok(`/products/${card.id}/group`, { method: 'POST', body: { productId: white.id } });
  assert.equal((await ok('/products/' + white.id)).group.length, 3);
  await ok(`/products/${white.id}/group`, { method: 'DELETE' });
  assert.equal((await ok('/products/' + card.id)).group.length, 2, 'отвязали');
  // в магазине — выбор цвета ведёт на карточку другого цвета
  const sp = (await shop('/products/' + card.id)).data;
  assert.deepEqual(sp.groupCards.map((g) => g.color), ['Красный', 'Чёрный']);
  assert.match(sp.groupCards[1].url, new RegExp(`^/product/${black.id}-`));
  // списки: в «Товарах» — карточки, в кассе и на складе — размеры
  assert.equal((await ok('/products?q=' + encodeURIComponent('Платье Вар ' + U))).items.filter((p) => p.parentId).length, 0);
  const sell = (await ok('/products?sellable=1&q=VAR-' + D)).items;
  assert.ok(sell.length >= 3, 'поиск по артикулу карточки находит размеры'); assert.ok(sell.every((p) => p.sku.startsWith('VAR-' + D)));
  assert.equal((await api('/products/lookup/VAR-' + D + '?sellable=1')).status, 409, 'по артикулу нужно выбрать размер');
  assert.equal((await ok('/products/lookup/' + rs.barcodes[0].code)).id, rs.id);
  assert.equal((await api('/sales', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: card.id, quantity: 1, price: 1 }] } })).status, 400, 'карточку целиком продать нельзя');
  const stockRows = (await ok('/stock?q=VAR-' + D)).rows;
  assert.equal(stockRows.length, 6); assert.equal(stockRows.find((r) => r.id === rs.id).total, 3);

  // партии: остаток 3 по 100 ₽ + приход 5 по 150 ₽ от поставщика
  await ok('/receipts', { method: 'POST', body: { warehouseId: w1.id, counterpartyId: cp.id, items: [{ productId: rs.id, quantity: 5, costPrice: 150 }] } });
  // продажа 7: FIFO — 3 × 100 + 4 × 150 = 900 → 128,57 за штуку
  const sale = await ok('/sales', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: rs.id, quantity: 7, price: 3000 }] } });
  assert.equal(sale.items[0].costPrice, 128.57);
  let d = await ok('/products/' + card.id);
  assert.equal(d.batches.filter((b) => b.productId === rs.id).reduce((a, b) => a + b.remaining, 0), 1);
  assert.equal(d.avgCost, 150, 'остался 1 шт из партии по 150');
  assert.ok(d.batches.some((b) => b.supplier === cp.name && b.costPrice === 150), 'поставщик партии');
  // возврат 2 шт — в те партии, из которых продали (последние — первыми): обе из партии по 150
  await ok(`/sales/${sale.id}/return-items`, { method: 'POST', body: { items: [{ saleItemId: sale.items[0].id, quantity: 2 }] } });
  d = await ok('/products/' + card.id);
  assert.equal(d.batches.find((b) => b.productId === rs.id && b.costPrice === 150).remaining, 3);
  assert.equal(d.batches.find((b) => b.productId === rs.id && b.costPrice === 100).remaining, 0);
  // перемещение 2 шт на другой склад — партия переезжает со своей ценой
  await ok('/stock/transfer', { method: 'POST', body: { fromWarehouseId: w1.id, toWarehouseId: w2.id, items: [{ productId: rs.id, quantity: 2 }] } });
  d = await ok('/products/' + card.id);
  const moved = d.batches.find((b) => b.productId === rs.id && b.warehouseId === w2.id);
  assert.equal(moved.remaining, 2); assert.equal(moved.costPrice, 150); assert.equal(moved.supplierId, cp.id);
  // продажа в минус: себестоимость по последней партии, следующий приход сначала гасит минус
  const neg = await ok('/sales', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: rs.id, quantity: 3, price: 3000 }] } });
  assert.equal(neg.items[0].costPrice, 150);
  await ok('/receipts', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: rs.id, quantity: 4, costPrice: 170 }] } });
  d = await ok('/products/' + card.id);
  assert.equal(d.batches.find((b) => b.productId === rs.id && b.costPrice === 170).remaining, 2, 'из 4 шт две закрыли минус');
  assert.equal((await ok('/stock?q=VAR-' + D)).rows.find((r) => r.id === rs.id).byWh[w1.id], 2);

  // продажи по размерам в карточке
  assert.equal(d.salesBySize.find((x) => x.size === 'S').sold, 8, '7 + 3 − 2 возврат');
  // изменение карточки: новое название у всех размеров, удаление пустого размера
  const keep = d.variants.filter((v) => v.size !== 'M').map((v) => ({ id: v.id, size: v.size, barcode: v.barcodes[0].code, price: v.price }));
  const upd = await ok('/products/' + card.id, { method: 'PUT', body: { ...d, name: 'Платье Лето ' + U, variants: keep } });
  assert.equal(upd.variants.length, 2);
  assert.ok(upd.variants.every((v) => v.name.startsWith('Платье Лето ' + U + ' · Красный · ')));
  // продажи по размерам и цветам в статистике
  const bySize = await ok('/stats?groupBy=size');
  assert.ok(bySize.rows.find((r) => r.name === 'S').qty >= 8);
  assert.ok((await ok('/stats?groupBy=color')).rows.some((r) => r.name === 'Красный'));
  // нельзя добавить размеры товару, у которого есть остаток без размера
  const simple = await ok('/products', { method: 'POST', body: { name: 'Простой ' + U, price: 10, initialStock: [{ warehouseId: w1.id, quantity: 2 }] } });
  assert.equal((await api('/products/' + simple.id, { method: 'PUT', body: { ...simple, variants: [{ size: 'S' }] } })).status, 400, 'нужно выбрать размер для остатка');
  // перенос остатка без размера на выбранный размер
  const movedCard = await ok('/products/' + simple.id, { method: 'PUT', body: { ...simple, variants: [{ size: 'S' }, { size: 'M' }], moveStockTo: 'M', variantWarehouseId: w1.id } });
  assert.equal(movedCard.variants.find((v) => v.size === 'M').stocks.find((x) => x.warehouseId === w1.id).quantity, 2);
  assert.equal(movedCard.totalStock, 2);
  // правка остатка размера прямо в карточке
  const vm = movedCard.variants.find((v) => v.size === 'M');
  const ed = await ok('/products/' + simple.id, { method: 'PUT', body: { ...movedCard, variantWarehouseId: w1.id, variants: movedCard.variants.map((v) => ({ id: v.id, size: v.size, barcode: v.barcodes[0].code, ...(v.id === vm.id ? { newStock: 5 } : {}) })) } });
  assert.equal(ed.variants.find((v) => v.id === vm.id).stocks.find((x) => x.warehouseId === w1.id).quantity, 5);
  // числовой артикул: 8 цифр, поиск по нему в программе и на сайте
  assert.match(String(ed.article), /^\d{8}$/);
  assert.equal((await ok('/products?q=' + ed.article)).items[0].id, simple.id);
  assert.equal((await ok('/products/lookup/' + ed.article)).id, simple.id);
  assert.equal((await ok('/products?sellable=1&q=' + ed.article)).items.length, 2, 'размеры карточки по артикулу');
  assert.equal((await shop('/products?q=' + ed.article)).data.items[0].article, ed.article);
  // проверка корзины: удалённый товар и карточка с размерами — не продаются, размер — с актуальной ценой
  const chk = (await shop('/cart/check', { method: 'POST', body: { items: [{ productId: 99999999, quantity: 1 }, { productId: simple.id, quantity: 1 }, { productId: vm.id, quantity: 9 }] } })).data.items;
  assert.deepEqual(chk.map((x) => x.ok), [false, false, true]);
  assert.equal(chk[1].reason, 'size');
  assert.equal(chk[2].quantity, 5, 'не больше остатка');
  void white;
});

test('цены и скидки: список с себестоимостью по партиям, массовое сохранение', async () => {
  const c = await ok('/products', { method: 'POST', body: { name: 'Цены ' + U, price: 1000, costPrice: 400, variantWarehouseId: w1.id, variants: [{ size: 'S', quantity: 2 }, { size: 'M' }] } });
  const row = (await ok('/products/prices?q=' + encodeURIComponent('Цены ' + U))).find((x) => x.id === c.id);
  assert.equal(row.article, c.article); assert.equal(row.variants.length, 2); assert.equal(row.avgCost, 400); assert.equal(row.stock, 2);
  assert.ok(row.variants.every((v) => /^\d{13}$/.test(v.barcode)), 'штрихкоды размеров — для ценников');
  // у размера нет своих фото — в корзине фото карточки
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.append('images', new Blob([png], { type: 'image/png' }), 'card.png');
  const [img] = await ok(`/products/${c.id}/images`, { method: 'POST', form });
  const chk = (await shop('/cart/check', { method: 'POST', body: { items: [{ productId: row.variants[0].id, quantity: 1 }] } })).data.items[0];
  assert.ok(chk.ok, JSON.stringify(chk)); assert.equal(chk.image, img.path);
  // скидка 20% от 1500 на всю карточку (с размерами) + новая закупочная
  await ok('/products/prices', { method: 'PUT', body: { items: [{ id: c.id, price: 1200, oldPrice: 1500, costPrice: 450, sizes: true }] } });
  const d = await ok('/products/' + c.id);
  assert.equal(d.price, 1200); assert.equal(d.oldPrice, 1500); assert.equal(d.costPrice, 450);
  assert.ok(d.variants.every((v) => v.price === 1200 && v.oldPrice === 1500));
  // отдельная цена размера; старая цена меньше цены — не сохраняется
  await ok('/products/prices', { method: 'PUT', body: { items: [{ id: d.variants[1].id, price: 1300, oldPrice: 1000 }] } });
  const m = (await ok('/products/' + c.id)).variants[1];
  assert.equal(m.price, 1300); assert.equal(m.oldPrice, null);
  assert.equal((await api('/products/prices', { method: 'PUT', body: { items: [{ id: c.id, price: -5 }] } })).status, 400);
});

test('каталог: закреплённые товары первыми по порядку, затем новые', async () => {
  const mk = (n) => ok('/products', { method: 'POST', body: { name: `Порядок ${n} ${U}`, price: 100, initialStock: [{ warehouseId: w1.id, quantity: 1 }] } });
  const a = await mk('A'), b = await mk('B'), c = await mk('C');
  const prev = (await ok('/products/featured')).map((x) => x.id);
  await ok('/products/featured', { method: 'PUT', body: { ids: [b.id, a.id] } });
  assert.deepEqual((await ok('/products/featured')).map((x) => x.id), [b.id, a.id]);
  const items = (await shop('/products?limit=5')).data.items.map((x) => x.id);
  assert.deepEqual(items.slice(0, 3), [b.id, a.id, c.id], 'закреплённые, затем самый новый');
  assert.equal((await shop('/products?limit=1&sort=new')).data.items[0].id, c.id, '«Новинки» — без закрепления');
  assert.equal((await api('/products/featured', { method: 'PUT', body: { ids: Array.from({ length: 21 }, (_, i) => i + 1) } })).status, 400);
  await ok('/products/featured', { method: 'PUT', body: { ids: prev } });
});

test('импорт из Excel: строки с одним артикулом и разными размерами — одна карточка', async () => {
  const sku = 'IMPV-' + D;
  const r = await ok('/products/import', { method: 'POST', body: { warehouseId: w1.id, rows: [
    { name: 'Юбка импорт ' + U, sku, price: 2000, costPrice: 900, color: 'Синий', size: 'S', quantity: 4 },
    { name: 'Юбка импорт ' + U, sku, price: 2000, costPrice: 900, color: 'Синий', size: 'M', quantity: 6 },
  ] } });
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  const card = (await ok('/products?q=' + sku)).items;
  assert.equal(card.length, 1); assert.equal(card[0].hasVariants, true); assert.equal(card[0].totalStock, 10);
  const full = await ok('/products/' + card[0].id);
  assert.deepEqual(full.variants.map((v) => v.size).sort(), ['M', 'S']);
  assert.equal(full.color, 'Синий');
  assert.equal(full.avgCost, 900);
  // тот же артикул другого цвета — отдельная карточка той же модели
  const r2 = await ok('/products/import', { method: 'POST', body: { warehouseId: w1.id, rows: [{ name: 'Юбка импорт ' + U, sku, price: 2000, color: 'Красный', size: 'S', quantity: 1 }] } });
  assert.equal(r2.errors.length, 0, JSON.stringify(r2.errors));
  const g = (await ok('/products/' + card[0].id)).group;
  assert.deepEqual(g.map((x) => x.color), ['Синий', 'Красный']); assert.equal(g[1].sku, sku + '-2');
  // повторный импорт обновляет, а не дублирует
  await ok('/products/import', { method: 'POST', body: { warehouseId: w1.id, rows: [{ sku, color: 'Синий', size: 'S', quantity: 5 }] } });
  assert.equal((await ok('/products/' + card[0].id)).variants.length, 2);
});

test('Wildberries: токен проверяется, без токена загрузка невозможна', async () => {
  const st = await ok('/wb');
  assert.equal(typeof st.connected, 'boolean');
  assert.equal((await api('/wb/token', { method: 'PUT', body: { token: 'abc' } })).status, 400, 'не токен WB');
  // токен с истёкшим сроком (подпись не важна — до WB запрос не доходит)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const expired = [b64({ alg: 'ES256' }), b64({ exp: 1000000000, s: 2 }), 'x'].join('.');
  assert.match((await api('/wb/token', { method: 'PUT', body: { token: expired } })).data.error, /истёк/);
  const noContent = [b64({ alg: 'ES256' }), b64({ exp: 4000000000, s: 1 << 5 }), 'x'].join('.');
  assert.match((await api('/wb/token', { method: 'PUT', body: { token: noContent } })).data.error, /Контент/);
  if (!st.connected) assert.equal((await api('/wb/import', { method: 'POST', body: {} })).status, 400);
});

test('SEO: страницы магазина, robots.txt, sitemap.xml, Метрика и соцсети', async () => {
  await ok('/orders/settings', { method: 'PUT', body: { metrikaId: '12345678', yandexVerification: 'abc123', socialTelegram: '@lunara_shop', socialWhatsapp: '8 900 111-22-33', socialInstagram: 'javascript:alert(1)' } });
  const p = await ok('/products', { method: 'POST', body: { name: 'SEO <платье> ' + U, price: 1990, description: 'Лёгкое летнее платье', showInShop: true, initialStock: [{ warehouseId: w1.id, quantity: 3 }] } });
  const page = await fetch(BASE + '/product/' + p.id);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>SEO &lt;платье&gt; .+ — купить за 1[\s\u00a0]990 ₽/, 'заголовок экранирован');
  assert.match(html, new RegExp(`<link rel="canonical" href="https?://[^"]+/product/${p.id}-seo-plate-`), 'адрес со словами из названия');
  // старая ссылка /product/ID — постоянный редирект на новый адрес
  const old = await fetch(BASE + '/product/' + p.id, { redirect: 'manual' });
  assert.equal(old.status, 301); assert.match(old.headers.get('location'), new RegExp(`/product/${p.id}-seo-plate-`));
  assert.match(html, /"@type":"Product"/); assert.match(html, /"availability":"https:\/\/schema.org\/InStock"/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta name="yandex-verification" content="abc123"/);
  assert.match(html, /ym\(12345678,"init"/, 'Метрика на страницах магазина');
  assert.match(html, /<h1>SEO &lt;платье&gt;/, 'текст страницы для роботов');
  assert.equal((html.match(/<title>/g) || []).length, 1, 'один title');
  assert.ok(!/<script>alert|<платье>/.test(html), 'нет внедрения HTML');
  // Метрика не ставится в админку
  assert.ok(!/mc\.yandex/.test(await fetch(BASE + '/admin/').then((x) => x.text())));
  // служебные и несуществующие страницы
  assert.match(await fetch(BASE + '/cart').then((x) => x.text()), /noindex/);
  assert.equal((await fetch(BASE + '/product/99999999')).status, 404);
  assert.equal((await fetch(BASE + '/no-such-page')).status, 404);
  const robots = await fetch(BASE + '/robots.txt').then((x) => x.text());
  assert.match(robots, /Disallow: \/admin/); assert.match(robots, /Sitemap: https?:\/\/.+\/sitemap\.xml/);
  const sm = await fetch(BASE + '/sitemap.xml').then((x) => x.text());
  assert.match(sm, new RegExp(`/product/${p.id}-seo-plate-[a-z0-9-]+</loc>`));
  // соцсети в настройках витрины: только http(s), WhatsApp из номера
  const cfg = (await shop('/config')).data;
  assert.deepEqual(cfg.socials, { telegram: 'https://t.me/lunara_shop', whatsapp: 'https://wa.me/79001112233' });
  assert.deepEqual(cfg.metrika, { id: 12345678, ecommerce: true });
  await ok('/orders/settings', { method: 'PUT', body: { metrikaId: '', yandexVerification: '', socialTelegram: '', socialWhatsapp: '', socialInstagram: '' } });
  assert.ok(!/mc\.yandex/.test(await fetch(BASE + '/').then((x) => x.text())));
});

test('витрина: варианты, фильтры, избранное, ожидание поступления, отзывы, СБП, корзина, фид', async () => {
  await ok('/orders/settings', { method: 'PUT', body: { sbpEnabled: '1', tbankEnabled: '1', showOutOfStock: '0', warehouseId: '', reviewsEnabled: '1' } });
  const card = await ok('/products', { method: 'POST', body: { name: 'Футболка Витрина ' + U, sku: 'SHOPV-' + D, color: 'Белый', price: 1500, costPrice: 500, brand: 'Бренд' + U, variantWarehouseId: w1.id,
    variants: [{ size: 'S', quantity: 2 }, { size: 'M' }, { size: 'L', price: 1700, quantity: 1 }] } });
  const vS = card.variants.find((v) => v.size === 'S'), vM = card.variants.find((v) => v.size === 'M');
  // каталог: одна карточка, цена «от», размеры
  const list = (await shop('/products?q=SHOPV-' + D)).data.items;
  assert.equal(list.length, 1);
  assert.equal(list[0].price, 1500); assert.equal(list[0].priceFrom, true); assert.deepEqual(list[0].sizes, ['S', 'M', 'L']);
  assert.match(list[0].url, new RegExp(`^/product/${card.id}-futbolka-vitrina-`));
  // фильтры и фасеты
  assert.equal((await shop(`/products?q=SHOPV-${D}&sizes=XL`)).data.total, 0);
  assert.equal((await shop(`/products?q=SHOPV-${D}&colors=${encodeURIComponent('Белый')}`)).data.total, 1);
  assert.equal((await shop(`/products?q=SHOPV-${D}&colors=${encodeURIComponent('Чёрный')}`)).data.total, 0);
  assert.equal((await shop(`/products?brands=${encodeURIComponent('Бренд' + U)}`)).data.total, 1);
  assert.equal((await shop(`/products?q=SHOPV-${D}&min=1600`)).data.total, 1, 'фильтр по цене — по цене вариантов');
  assert.equal((await shop(`/products?q=SHOPV-${D}&max=1400`)).data.total, 0);
  const fc = (await shop('/facets?q=SHOPV-' + D)).data;
  assert.deepEqual(fc.sizes.map((x) => x.v), ['S', 'M', 'L']); assert.equal(fc.brands[0].v, 'Бренд' + U); assert.equal(fc.colors[0].v, 'Белый');
  // карточка: варианты с наличием
  const pd = (await shop('/products/' + card.id)).data;
  assert.equal(pd.variants.find((v) => v.id === vM.id).inStock, false);
  assert.deepEqual((await shop('/products/' + vS.id)).data, { redirect: `/product/${card.id}` }, 'ссылка на вариант ведёт на карточку');

  const phone = '79' + String(Number(D.slice(-9)) + 11).padStart(9, '0').slice(-9);
  const login = async (n) => {
    const em = `wish${n}${U}@example.ru`;
    const rc = await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: em } });
    return (await shop('/auth/email/verify', { method: 'POST', body: { email: em, code: rc.data.testCode, name: 'Ирина Петрова', consent: true } })).data.token;
  };
  const t = await login(11);
  // избранное: объединение браузерного списка с аккаунтом
  assert.deepEqual((await shop('/favorites/sync', { method: 'POST', token: t, body: { ids: [card.id, vS.id, 99999999] } })).data.ids, [card.id], 'только карточки');
  await shop('/favorites/' + card.id, { method: 'DELETE', token: t });
  assert.deepEqual((await shop('/favorites', { token: t })).data.ids, []);
  // карточку целиком в заказ положить нельзя — только вариант
  assert.equal((await shop('/orders', { method: 'POST', token: t, body: { phone, items: [{ productId: card.id, quantity: 1 }], delivery: 'pickup', agree: true } })).status, 400);
  // сообщить о поступлении: размер M закончился → подписка → приход → уведомление отправлено
  await shop('/waitlist/' + vM.id, { method: 'POST', token: t });
  assert.deepEqual((await shop('/waitlist', { token: t })).data, [vM.id]);
  await ok('/receipts', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: vM.id, quantity: 3, costPrice: 520 }] } });
  let waited;
  for (let i = 0; i < 20; i++) { waited = (await shop('/waitlist', { token: t })).data; if (!waited.length) break; await new Promise((r) => setTimeout(r, 150)); }
  assert.deepEqual(waited, [], 'подписка отработала после прихода');
  // корзина сохраняется для напоминания; заказ её очищает
  assert.equal((await shop('/cart', { method: 'POST', token: t, body: { items: [{ productId: vS.id, quantity: 1 }] } })).status, 200);
  // заказ с оплатой через СБП (тестовый режим без ключей банка → тестовый QR)
  const o = await shop('/orders', { method: 'POST', token: t, body: { phone, items: [{ productId: vS.id, quantity: 1 }], paymentMethod: 'sbp', delivery: 'pickup', agree: true } });
  assert.equal(o.status, 201, JSON.stringify(o.data));
  assert.equal(o.data.paymentUrl, `/order/${o.data.order.id}?sbp=1`);
  const od = (await shop('/orders/' + o.data.order.id, { token: t })).data;
  assert.equal(od.paymentMethod, 'sbp'); assert.match(od.paymentUrl, /^https:\/\/qr\.nspk\.ru\//);
  assert.equal(od.items[0].product.id, card.id, 'в заказе ссылка на карточку');
  assert.equal((await shop(`/orders/${od.id}/test-pay`, { method: 'POST', token: t })).data.paymentStatus, 'paid');
  // отзыв: оценка обязательна, один на товар, публикуется после проверки
  const rv = (body) => { const fd = new FormData(); Object.entries(body).forEach(([k, v]) => fd.append(k, v)); return fetch(`${BASE}/api/shop/products/${card.id}/reviews`, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd }); };
  assert.equal((await rv({ text: 'без оценки' })).status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('rating', '4'); fd.append('fit', 'small'); fd.append('size', 'S'); fd.append('text', 'Хорошая, но маломерит'); fd.append('photos', new Blob([png], { type: 'image/png' }), 'a.png');
  const created = await fetch(`${BASE}/api/shop/products/${card.id}/reviews`, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd });
  assert.equal(created.status, 201);
  assert.equal((await rv({ rating: 5 })).status, 400, 'второй отзыв нельзя');
  assert.equal((await shop('/products/' + card.id)).data.reviews.count, 0, 'до проверки не виден');
  const pending = (await ok('/reviews?status=pending')).items.find((x) => x.productId === card.id);
  assert.ok(pending.photos[0].startsWith('/uploads/reviews/'));
  await ok('/reviews/' + pending.id, { method: 'PUT', body: { status: 'published', reply: 'Спасибо!' } });
  const pub = (await shop('/products/' + card.id)).data.reviews;
  assert.equal(pub.count, 1); assert.equal(pub.avg, 4); assert.equal(pub.fit.small, 1);
  assert.equal(pub.items[0].name, 'Ирина П.', 'имя сокращается'); assert.equal(pub.items[0].reply, 'Спасибо!');
  assert.match(await fetch(BASE + list[0].url).then((x) => x.text()), /"aggregateRating"/);
  // YML-фид: каждый размер — предложение с group_id
  const yml = await fetch(BASE + '/feed.yml').then((x) => x.text());
  assert.match(yml, new RegExp(`<offer id="${vS.id}" group_id="${card.id}" available="(true|false)">`));
  assert.match(yml, /<param name="Размер" unit="RU">M<\/param>/);
  const mf = await fetch(BASE + '/manifest.webmanifest').then((x) => x.json());
  assert.equal(mf.display, 'standalone'); assert.ok(mf.icons.length >= 2);
  await ok('/orders/settings', { method: 'PUT', body: { sbpEnabled: '0', tbankEnabled: '0', showOutOfStock: '0' } });
});

test('демо-данные: загрузка и удаление', async () => {
  const before = (await ok('/products?limit=1')).total;
  assert.equal((await api('/admin/demo', { method: 'POST', body: {} , auth: false })).status, 401);
  await ok('/admin/demo', { method: 'POST', body: { perCategory: 1, days: 20 } });
  let st;
  for (let i = 0; i < 100; i++) { st = await ok('/admin/demo'); if (st.state !== 'running') break; await new Promise((r) => setTimeout(r, 200)); }
  assert.equal(st.state, 'done', JSON.stringify(st));
  assert.equal(st.summary.models, 20, 'по одной модели в каждой из 20 категорий');
  assert.ok(st.summary.products > 20, 'у моделей несколько цветов — несколько карточек');
  assert.ok(st.summary.sales > 20);
  assert.equal((await ok('/products?limit=1')).total, before + st.summary.products);
  const demo = (await ok('/products?q=' + encodeURIComponent('демо') + '&limit=5'));
  assert.equal((await api('/admin/demo', { method: 'POST', body: {} })).status, 400, 'повторно загрузить нельзя');
  const pr = await ok('/products/popular?limit=3');
  assert.ok(pr.length === 3);
  const img = (await ok('/products?limit=200')).items.find((p) => p.images[0]?.path.includes('demo-'));
  assert.equal((await fetch(BASE + img.images[0].path)).status, 200, 'иллюстрация доступна');
  await ok('/admin/demo', { method: 'DELETE' });
  assert.equal((await ok('/products?limit=1')).total, before, 'демо удалено, остальное на месте');
  assert.equal((await ok('/products/' + product.id)).id, product.id);
  assert.equal((await ok('/admin/demo')).loaded, false);
  void demo;
});

test('резервная копия: база (SQL) и файлы (tar) по одноразовой ссылке', async () => {
  const info = await ok('/admin/backup');
  assert.ok(info.tables > 10);
  const { url } = await ok('/admin/backup/link', { method: 'POST', body: { kind: 'db' } });
  const r = await fetch(BASE + url);
  assert.equal(r.status, 200);
  const sql = require('zlib').gunzipSync(Buffer.from(await r.arrayBuffer())).toString();
  assert.match(sql, /CREATE TABLE `Product`/);
  assert.doesNotMatch(sql, /^undefined;/m);
  assert.match(sql, /INSERT INTO `_prisma_migrations`/);
  assert.match(sql, /SET FOREIGN_KEY_CHECKS = 1;\s*SET UNIQUE_CHECKS = 1;\s*$/);
  // восстановление в отдельную базу (если есть клиент mysql): число строк совпадает
  const dbUrl = process.env.DATABASE_URL || (require('fs').existsSync(path.join(__dirname, '..', '.env')) ? (require('fs').readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m) || [])[1] : '');
  const u = new URL(dbUrl || 'mysql://none@localhost/none');
  const my = (args, input) => execFileSync('mysql', ['-h', u.hostname === 'localhost' ? '127.0.0.1' : u.hostname, '-P', u.port || '3306', '-u', decodeURIComponent(u.username), ...args], { input, env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) }, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  let hasMysql = true; try { my(['-e', 'SELECT 1']); } catch { hasMysql = false; }
  if (hasMysql) {
    const rdb = u.pathname.slice(1) + '_restore_test';
    try {
      my(['-e', `DROP DATABASE IF EXISTS \`${rdb}\`; CREATE DATABASE \`${rdb}\` CHARACTER SET utf8mb4`]);
      my([rdb], sql);
      for (const t of ['Product', 'Barcode', 'Sale', '_prisma_migrations']) {
        const n = (db) => my(['-N', '-e', `SELECT COUNT(*) FROM \`${db}\`.\`${t}\``]).trim();
        assert.equal(n(rdb), n(u.pathname.slice(1)), 'строк в ' + t);
      }
    } finally { try { my(['-e', `DROP DATABASE IF EXISTS \`${rdb}\``]); } catch { /* нет прав */ } }
  }
  // ссылка не годится для входа в программу и для другого вида копии
  const t = url.split('t=')[1];
  assert.equal((await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + decodeURIComponent(t) } })).status, 401);
  assert.equal((await fetch(BASE + '/api/backup/uploads?t=' + t)).status, 403);
  assert.equal((await fetch(BASE + '/api/backup/db?t=bad')).status, 403);
  const up = await ok('/admin/backup/link', { method: 'POST', body: { kind: 'uploads' } });
  const tar = require('zlib').gunzipSync(Buffer.from(await (await fetch(BASE + up.url)).arrayBuffer()));
  assert.equal(tar.subarray(257, 262).toString(), 'ustar');
});

test('капча и защита от подбора: код на email только с капчей, решение одноразовое, вход админа после 3 ошибок — с капчей', async () => {
  const em = `cap${Date.now()}@example.ru`;
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { email: em } })).status, 428, 'без капчи код не отправляется');
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { email: em, captcha: 'bad' } })).status, 428);
  const c = await cap();
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { email: em, captcha: c } })).status, 200);
  assert.equal((await shop('/auth/email/request-code', { method: 'POST', body: { email: `cap2${Date.now()}@example.ru`, captcha: c } })).status, 428, 'повтор решения не принимается');
  // подбор пароля: отдельный логин, чтобы не мешать остальным тестам
  const login = 'brute' + Date.now();
  // после 3 ошибок (по логину или с этого адреса — считаются и ошибки из других тестов) нужна капча
  let need;
  for (let i = 0; i < 4; i++) { need = await api('/auth/login', { method: 'POST', auth: false, body: { login, password: 'x' + i } }); if (need.status !== 401) break; }
  assert.equal(need.status, 428); assert.equal(need.data.captcha, true);
  assert.equal((await api('/auth/login', { method: 'POST', auth: false, body: { login, password: 'x', captcha: await cap() } })).status, 401, 'с капчей проверяется пароль');
  // подменённый X-Forwarded-For не сбрасывает счётчик по адресу
  const spoof = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' }, body: JSON.stringify({ login, password: 'y' }) });
  assert.equal(spoof.status, 428);
});

test('безопасность: подделка уведомления Т-Банка, расширение загрузок, заголовки', async () => {
  // уведомление с пустым ключом терминала и подписью от пустого пароля — не принимается
  const { token } = require('../src/shop/tbank');
  const body = { TerminalKey: '', OrderId: 'Z-000001', Status: 'CONFIRMED', Success: true, PaymentId: '1', Amount: 100 };
  body.Token = token(body, '');
  const r = await fetch(BASE + '/api/shop/tbank/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 400);
  // файл «x.html» с типом картинки сохраняется как .png — HTML на сайт не попадёт
  const p = await ok('/products', { method: 'POST', body: { name: 'Безопасность ' + U, price: 1 } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.append('images', new Blob([png], { type: 'image/png' }), 'x.html');
  const [img] = await ok(`/products/${p.id}/images`, { method: 'POST', form });
  assert.match(img.path, /\.png$/);
  const h = await fetch(BASE + '/admin');
  assert.equal(h.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
});

test('избранное: товар, снятый с сайта, пропадает из избранного', async () => {
  const p = await ok('/products', { method: 'POST', body: { name: 'Избранное ' + U, price: 100, showInShop: true } });
  const em = `fav${Date.now()}@example.ru`;
  const rc = await shop('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: em } });
  const t = (await shop('/auth/email/verify', { method: 'POST', body: { email: em, code: rc.data.testCode, consent: true } })).data.token;
  const sh = (path, opt = {}) => fetch(BASE + '/api/shop' + path, { ...opt, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t } }).then((r) => r.json());
  await sh('/favorites/' + p.id, { method: 'POST' });
  assert.deepEqual((await sh('/favorites')).ids, [p.id]);
  await ok('/products/' + p.id, { method: 'PUT', body: { ...(await ok('/products/' + p.id)), showInShop: false } });
  assert.deepEqual((await sh('/favorites')).ids, [], 'скрытый товар убран');
});

test('тестовый сайт: «закрыть от поисковиков» — robots.txt запрещает всё', async () => {
  await ok('/orders/settings', { method: 'PUT', body: { noindex: '1' } });
  assert.match(await fetch(BASE + '/robots.txt').then((r) => r.text()), /Disallow: \/\n/);
  await ok('/orders/settings', { method: 'PUT', body: { noindex: '0' } });
  assert.match(await fetch(BASE + '/robots.txt').then((r) => r.text()), /Sitemap:/);
});

test('страница /catalog отдаётся со статусом 200 (не 404) и ссылается на главную как canonical', async () => {
  const r = await fetch(BASE + '/catalog');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<link rel="canonical" href="[^"]*\/"/);
});

test('вход по email: чужой неподтверждённый адрес в профиле не даёт доступа, код из профиля не подходит для входа', async () => {
  // отдельный IP, чтобы не тратить общий лимит кодов на 127.0.0.1
  const sh = async (p, { method = 'GET', body, token: t } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.23' };
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(BASE + '/api/shop' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const login = async (em) => {
    const rc = await sh('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: em } });
    assert.equal(rc.status, 200, JSON.stringify(rc.data));
    return sh('/auth/email/verify', { method: 'POST', body: { email: em, code: rc.data.testCode, consent: true } });
  };
  const S = Date.now();
  const attacker = await login(`att${S}@example.ru`);
  const tA = attacker.data.token; const idA = attacker.data.customer.id;
  const victimEmail = `vic${S}@example.ru`;
  // злоумышленник вписывает чужой адрес без подтверждения
  const put = await sh('/me', { method: 'PUT', token: tA, body: { email: victimEmail } });
  assert.equal(put.status, 200); assert.equal(put.data.emailVerifiedAt, null);
  // владелец адреса входит — получает СВОЙ новый аккаунт, а не аккаунт злоумышленника
  const victim = await login(victimEmail);
  assert.equal(victim.status, 200);
  assert.notEqual(victim.data.customer.id, idA, 'владелец почты не попадает в чужой аккаунт');
  assert.equal((await sh('/me', { token: tA })).data.email, null, 'неподтверждённый адрес снят с чужого аккаунта');
  // код подтверждения из профиля не подходит для входа
  const other = `own${S}@example.ru`;
  const pc = await sh('/me/email/request-code', { method: 'POST', token: tA, body: { email: other } });
  assert.equal(pc.status, 200);
  assert.equal((await sh('/auth/email/verify', { method: 'POST', body: { email: other, code: pc.data.testCode, consent: true } })).status, 400, 'код профиля не открывает вход');
  const pv = await sh('/me/email/verify', { method: 'POST', token: tA, body: { email: other, code: pc.data.testCode } });
  assert.equal(pv.status, 200); assert.ok(pv.data.emailVerifiedAt, 'адрес подтверждён в профиле');
  // подтверждённый чужой адрес нельзя забрать себе
  assert.equal((await sh('/me/email/request-code', { method: 'POST', token: tA, body: { email: victimEmail } })).status, 400);
  // рассылка: клиенты без push-подписки в получатели не попадают
  await sh('/me', { method: 'PUT', token: tA, body: { marketingPush: true } });
  const bulk = await api('/customers/bulk', { method: 'POST', body: { text: 'Акция', filter: { q: other } } });
  assert.equal(bulk.status, 400); assert.match(bulk.data.error, /push/);
});

test('права продавца: без раздела «Клиенты» и без возврата денег; реклама — только по отдельному согласию', async () => {
  const login = `seller${Date.now()}`;
  await ok('/users', { method: 'POST', body: { login, name: 'Продавец', role: 'seller', password: 'seller-pass-123' } });
  // свой IP: после тестов на подбор пароля вход с 127.0.0.1 требует капчу
  const st = (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.25' }, body: JSON.stringify({ login, password: 'seller-pass-123' }) }).then((r) => r.json())).token;
  assert.ok(st);
  const as = (p, opt = {}) => fetch(BASE + '/api' + p, { method: opt.method || 'GET', headers: { Authorization: 'Bearer ' + st, 'Content-Type': 'application/json' }, body: opt.body && JSON.stringify(opt.body) });
  assert.equal((await as('/customers')).status, 403, 'список клиентов');
  assert.equal((await as('/customers/bulk', { method: 'POST', body: { text: 'Акция' } })).status, 403, 'рассылка');
  assert.equal((await as('/orders/1/refund', { method: 'POST', body: {} })).status, 403, 'возврат денег');
  assert.equal((await api('/customers')).status, 200, 'админу раздел доступен');

  // согласие на рекламу: по умолчанию нет; галочка ставит дату, снятие — отзывает
  const sh = async (p, { method = 'GET', body, token: t } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.24' };
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(BASE + '/api/shop' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  const em = `mkt${Date.now()}@example.ru`;
  const rc = await sh('/auth/email/request-code', { method: 'POST', body: { captcha: await cap(), email: em } });
  const ct = (await sh('/auth/email/verify', { method: 'POST', body: { email: em, code: rc.data.testCode, consent: true } })).data.token;
  assert.equal((await sh('/me', { token: ct })).data.marketingConsentAt, null, 'после регистрации согласия на рекламу нет');
  assert.ok((await sh('/me', { method: 'PUT', token: ct, body: { marketingPush: true } })).data.marketingConsentAt, 'галочка — согласие с датой');
  const off = (await sh('/me', { method: 'PUT', token: ct, body: { marketingPush: false } })).data;
  assert.equal(off.marketingConsentAt, null, 'снятие галочки — отзыв согласия');
  assert.equal(off.marketingPush, false);
});
