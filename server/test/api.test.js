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
  const own = '46' + U.padStart(10, '0').slice(-10).replace(/\D/g, '7');
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

test('приход, продажа, контроль остатка, возврат', async () => {
  await ok('/receipts', { method: 'POST', body: { warehouseId: w1.id, counterpartyId: cp.id, items: [{ productId: product.id, quantity: 5, costPrice: 450 }] } });
  const stock = async () => (await ok('/products/' + product.id)).stocks.find((s) => s.warehouseId === w1.id).quantity;
  assert.equal(await stock(), 15);
  const over = await api('/sales', { method: 'POST', body: { warehouseId: w1.id, items: [{ productId: product.id, quantity: 100, price: 1000 }] } });
  assert.equal(over.status, 400, 'нельзя продать больше остатка');
  const sale = await ok('/sales', { method: 'POST', body: { warehouseId: w1.id, channelId: ch.id, discount: 100, items: [{ productId: product.id, quantity: 3, price: 1000 }] } });
  assert.equal(sale.total, 2900);
  assert.equal(await stock(), 12);
  await ok(`/sales/${sale.id}/return`, { method: 'POST' });
  assert.equal(await stock(), 15);
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

test('дашборд', async () => {
  const d = await ok('/dashboard?days=7');
  assert.ok(d.kpi.salesCount >= 0);
  assert.equal(d.chart.length, 7);
});
