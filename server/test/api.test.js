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
const ok = async (...a) => { const r = await api(...a); assert.ok(r.status < 300, `${a[0]} → ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const ean13ok = (c) => { let s = 0; for (let i = 0; i < 12; i++) s += +c[i] * (i % 2 ? 3 : 1); return (10 - (s % 10)) % 10 === +c[12]; };

before(async () => {
  execFileSync('node', ['prisma/seed.js'], { cwd: ROOT, env: { ...process.env, ADMIN_PASSWORD: PASS }, stdio: 'ignore' });
  // минимальная «сборка» фронтенда — для проверки страниц магазина (SEO)
  const dist = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dist-'));
  require('fs').mkdirSync(dist + '/admin');
  require('fs').writeFileSync(dist + '/shop.html', '<!doctype html><html><head><title>x</title><meta name="description" content="x" /></head><body><div id="root"></div></body></html>');
  require('fs').writeFileSync(dist + '/admin/index.html', '<!doctype html><html><head><title>admin</title></head><body><div id="root"></div></body></html>');
  server = spawn('node', ['src/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), CLIENT_DIST: dist }, stdio: ['ignore', 'pipe', 'inherit'] });
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
  assert.ok(Math.abs(shares - 100) < 0.5, 'доли в сумме 100%');
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

test('интернет-магазин: каталог, вход по SMS, заказ, выдача, оплата', async () => {
  // настройки: тестовый режим SMS, онлайн-оплата включена (без ключей → тестовая оплата)
  const methods = [
    { id: 'pickup', carrier: 'pickup', name: 'Самовывоз', enabled: true, price: 0, description: 'ул. Тестовая, 1' },
    { id: 'courier', carrier: 'courier', name: 'Курьер', enabled: true, price: 300, freeFrom: 5000 },
    { id: 'ozon', carrier: 'ozon', name: 'Ozon', enabled: true, price: 200, markupPercent: 10, markupFixed: 15 },
    { id: 'pek', carrier: 'pek', name: 'ПЭК', enabled: false, price: 600 },
  ];
  const st = await ok('/orders/settings', { method: 'PUT', body: { smsMode: 'test', tbankEnabled: '1', tbankPassword: 'secret-pass', deliveryMethods: JSON.stringify(methods), warehouseId: String(w1.id), sellerName: 'ИП Тестов Т.Т.', sellerInn: '123456789012' } });
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

  // вход по SMS
  const phone = '79' + D.slice(-9);
  assert.equal((await shop('/auth/request-code', { method: 'POST', body: { phone: '123' } })).status, 400);
  const rc = await shop('/auth/request-code', { method: 'POST', body: { phone: '8' + phone.slice(1) } });
  assert.equal(rc.status, 200); assert.match(rc.data.testCode, /^\d{4}$/);
  assert.equal((await shop('/auth/request-code', { method: 'POST', body: { phone } })).status, 429, 'повтор не раньше 60 с');
  assert.equal((await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode === '0000' ? '1111' : '0000' } })).status, 400);
  const noConsent = await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode } });
  assert.equal(noConsent.status, 400, 'без согласия на обработку ПД вход невозможен');
  assert.match(noConsent.data.error, /согласие/);
  const v = await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode, name: 'Ольга', consent: true } });
  const ct = v.data.token; assert.ok(ct);
  assert.equal((await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode, consent: true } })).status, 400, 'код одноразовый');
  assert.equal((await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + ct } })).status, 401, 'токен покупателя не пускает в админку');
  assert.equal((await shop('/me', { token })).status, 401, 'админский токен не подходит магазину');
  assert.equal((await shop('/me', { token: ct })).data.phone, phone);

  // способы доставки и расчёт с наценкой
  const cfg = (await shop('/config')).data;
  assert.deepEqual(cfg.deliveryMethods.map((m) => m.id), ['pickup', 'courier', 'ozon'], 'выключенные способы скрыты');
  assert.equal(cfg.seller.inn, '123456789012');
  const quote = await shop('/delivery/quote', { method: 'POST', body: { methodId: 'ozon', items: [{ productId: p.id, quantity: 1 }], to: { point: 'Казань, ул. Баумана, 1' } } });
  assert.equal(quote.data.price, 235, '200 + 10% + 15 ₽');
  assert.equal((await shop('/delivery/quote', { method: 'POST', body: { methodId: 'ozon', items: [{ productId: p.id, quantity: 1 }], to: {} } })).status, 400, 'без пункта выдачи');
  assert.equal((await shop('/delivery/quote', { method: 'POST', body: { methodId: 'pek', items: [{ productId: p.id, quantity: 1 }], to: { address: 'x' } } })).status, 400, 'выключенный способ');

  // заказ: цена из базы, доставка, остатки, согласие с офертой
  const base = { delivery: 'courier', deliveryTo: { address: 'ул. Тестовая, 1' }, agree: true };
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

  // онлайн-оплата в тестовом режиме
  const o3 = await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'tbank', delivery: 'pickup', agree: true } });
  assert.equal(o3.data.paymentUrl, `/order/${o3.data.order.id}?testpay=1`);
  const paid = (await shop(`/orders/${o3.data.order.id}/test-pay`, { method: 'POST', token: ct })).data;
  assert.equal(paid.paymentStatus, 'paid'); assert.equal(paid.status, 'confirmed');
  // чужой заказ недоступен
  const rc2 = await shop('/auth/request-code', { method: 'POST', body: { phone: '79' + String(Number(D.slice(-9)) + 1).padStart(9, '0').slice(-9) } });
  const other = (await shop('/auth/verify', { method: 'POST', body: { phone: rc2.data.phone, code: rc2.data.testCode, consent: true } })).data.token;
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
    const ph = '79' + String(Number(D.slice(-9)) + n).padStart(9, '0').slice(-9);
    const rc = await shop('/auth/request-code', { method: 'POST', body: { phone: ph } });
    return (await shop('/auth/verify', { method: 'POST', body: { phone: rc.data.phone, code: rc.data.testCode, name, consent: true } })).data.token;
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
  assert.ok(conv); assert.equal(conv.unreadAdmin, 1); assert.ok(conv.phone);
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
  assert.equal((await api('/products/' + simple.id, { method: 'PUT', body: { ...simple, variants: [{ size: 'S' }] } })).status, 400);
  void white;
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

test('SEO: страницы магазина, robots.txt, sitemap.xml, Метрика и соцсети', async () => {
  await ok('/orders/settings', { method: 'PUT', body: { metrikaId: '12345678', yandexVerification: 'abc123', socialTelegram: '@botmi_shop', socialWhatsapp: '8 900 111-22-33', socialInstagram: 'javascript:alert(1)' } });
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
  assert.deepEqual(cfg.socials, { telegram: 'https://t.me/botmi_shop', whatsapp: 'https://wa.me/79001112233' });
  assert.deepEqual(cfg.metrika, { id: 12345678, ecommerce: true });
  await ok('/orders/settings', { method: 'PUT', body: { metrikaId: '', yandexVerification: '', socialTelegram: '', socialWhatsapp: '', socialInstagram: '' } });
  assert.ok(!/mc\.yandex/.test(await fetch(BASE + '/').then((x) => x.text())));
});

test('витрина: варианты, фильтры, избранное, ожидание поступления, отзывы, СБП, корзина, фид', async () => {
  await ok('/orders/settings', { method: 'PUT', body: { sbpEnabled: '1', tbankEnabled: '1', smsMode: 'test', showOutOfStock: '0', warehouseId: '', reviewsEnabled: '1' } });
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

  const login = async (n) => {
    const ph = '79' + String(Number(D.slice(-9)) + n).padStart(9, '0').slice(-9);
    const rc = await shop('/auth/request-code', { method: 'POST', body: { phone: ph } });
    return (await shop('/auth/verify', { method: 'POST', body: { phone: rc.data.phone, code: rc.data.testCode, name: 'Ирина Петрова', consent: true } })).data.token;
  };
  const t = await login(11);
  // избранное: объединение браузерного списка с аккаунтом
  assert.deepEqual((await shop('/favorites/sync', { method: 'POST', token: t, body: { ids: [card.id, vS.id, 99999999] } })).data.ids, [card.id], 'только карточки');
  await shop('/favorites/' + card.id, { method: 'DELETE', token: t });
  assert.deepEqual((await shop('/favorites', { token: t })).data.ids, []);
  // карточку целиком в заказ положить нельзя — только вариант
  assert.equal((await shop('/orders', { method: 'POST', token: t, body: { items: [{ productId: card.id, quantity: 1 }], delivery: 'pickup', agree: true } })).status, 400);
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
  const o = await shop('/orders', { method: 'POST', token: t, body: { items: [{ productId: vS.id, quantity: 1 }], paymentMethod: 'sbp', delivery: 'pickup', agree: true } });
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
