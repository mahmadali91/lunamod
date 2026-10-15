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
  server = spawn('node', ['src/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
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

test('интернет-магазин: каталог, вход по SMS, заказ, выдача, оплата', async () => {
  const shop = async (p, { method = 'GET', body, token: t } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(BASE + '/api/shop' + p, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  // настройки: тестовый режим SMS, онлайн-оплата включена (без ключей → тестовая оплата)
  const st = await ok('/orders/settings', { method: 'PUT', body: { smsMode: 'test', tbankEnabled: '1', tbankPassword: 'secret-pass', courierPrice: '300', courierFreeFrom: '5000', warehouseId: String(w1.id) } });
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
  const v = await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode, name: 'Ольга' } });
  const ct = v.data.token; assert.ok(ct);
  assert.equal((await shop('/auth/verify', { method: 'POST', body: { phone, code: rc.data.testCode } })).status, 400, 'код одноразовый');
  assert.equal((await fetch(BASE + '/api/products', { headers: { Authorization: 'Bearer ' + ct } })).status, 401, 'токен покупателя не пускает в админку');
  assert.equal((await shop('/me', { token })).status, 401, 'админский токен не подходит магазину');
  assert.equal((await shop('/me', { token: ct })).data.phone, phone);

  // заказ: цена из базы, доставка, остатки
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 6 }] } })).status, 400, 'больше остатка нельзя');
  assert.equal((await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 1 }], delivery: 'courier' } })).status, 400, 'курьер без адреса');
  const o1 = (await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 2, price: 1 }], delivery: 'courier', address: 'ул. Тестовая, 1', paymentMethod: 'cash' } })).data.order;
  assert.equal(o1.subtotal, 4000); assert.equal(o1.deliveryPrice, 300); assert.equal(o1.total, 4300);
  const o2 = (await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 3 }], delivery: 'courier', address: 'ул. Тестовая, 1' } })).data.order;
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
  const o3 = await shop('/orders', { method: 'POST', token: ct, body: { items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'tbank' } });
  assert.equal(o3.data.paymentUrl, `/order/${o3.data.order.id}?testpay=1`);
  const paid = (await shop(`/orders/${o3.data.order.id}/test-pay`, { method: 'POST', token: ct })).data;
  assert.equal(paid.paymentStatus, 'paid'); assert.equal(paid.status, 'confirmed');
  // чужой заказ недоступен
  const rc2 = await shop('/auth/request-code', { method: 'POST', body: { phone: '79' + String(Number(D.slice(-9)) + 1).padStart(9, '0').slice(-9) } });
  const other = (await shop('/auth/verify', { method: 'POST', body: { phone: rc2.data.phone, code: rc2.data.testCode } })).data.token;
  assert.equal((await shop(`/orders/${o3.data.order.id}`, { token: other })).status, 404);
  // уведомление банка с неверной подписью отклоняется
  const bad = await fetch(BASE + '/api/shop/tbank/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ TerminalKey: 'x', OrderId: o3.data.order.number, Status: 'CONFIRMED', Token: 'bad' }) });
  assert.equal(bad.status, 400);
  await ok('/orders/settings', { method: 'PUT', body: { tbankEnabled: '0' } });
});

test('демо-данные: загрузка и удаление', async () => {
  const before = (await ok('/products?limit=1')).total;
  assert.equal((await api('/admin/demo', { method: 'POST', body: {} , auth: false })).status, 401);
  await ok('/admin/demo', { method: 'POST', body: { perCategory: 1, days: 20 } });
  let st;
  for (let i = 0; i < 100; i++) { st = await ok('/admin/demo'); if (st.state !== 'running') break; await new Promise((r) => setTimeout(r, 200)); }
  assert.equal(st.state, 'done', JSON.stringify(st));
  assert.equal(st.summary.products, 20, 'по одному товару в каждой из 20 категорий');
  assert.ok(st.summary.sales > 20);
  assert.equal((await ok('/products?limit=1')).total, before + 20);
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
