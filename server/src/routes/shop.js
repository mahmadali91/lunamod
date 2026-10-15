// Публичное API интернет-магазина: каталог, вход по SMS, заказы, оплата Т-Банк
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { ah, HttpError, nextNumber, num, str, like } = require('../util');
const { getShopSettings, tbankReady } = require('../shop/settings');
const { sendSms } = require('../shop/sms');
const tbank = require('../shop/tbank');
const delivery = require('../shop/delivery');
const legal = require('../shop/legal');
const { notifyAdmins, getVapid } = require('../notify');
const chat = require('../chat');

const r = express.Router();
const SECRET = (process.env.JWT_SECRET || 'change-me-please') + ':customer'; // токены покупателей не подходят к админке
const round = (v) => Math.round(v * 100) / 100;

// ---------- телефон и авторизация ----------
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  if (!/^7\d{10}$/.test(d)) throw new HttpError(400, 'Введите номер телефона в формате +7 900 000-00-00');
  return d;
}
const hashCode = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}:${SECRET}`).digest('hex');
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function customerAuth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (t) { try { req.customer = jwt.verify(t, SECRET); } catch { /* недействителен */ } }
    if (required && !req.customer) return res.status(401).json({ error: 'Войдите по номеру телефона' });
    next();
  };
}

// ---------- витрина ----------
async function stockWhere(s) { return s.warehouseId ? { warehouseId: Number(s.warehouseId) } : {}; }

function publicProduct(p, s) {
  const stock = (p.stocks || []).filter((x) => !s.warehouseId || x.warehouseId === Number(s.warehouseId)).reduce((a, x) => a + x.quantity, 0);
  return {
    id: p.id, name: p.name, sku: p.sku, price: p.price, oldPrice: p.oldPrice && p.oldPrice > p.price ? p.oldPrice : null, unit: p.unit,
    description: p.description, category: p.category ? { id: p.category.id, name: p.category.name } : null,
    images: (p.images || []).map((i) => i.path), attributes: (p.attributes || []).map((a) => ({ name: a.name, value: a.value })),
    stock: Math.max(0, stock), inStock: stock > 0,
  };
}

// Ссылки на соцсети: принимаем только http(s); WhatsApp можно указать номером
function socialLinks(s) {
  const url = (v) => { v = String(v || '').trim(); if (!v) return null; if (!/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, ''); try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
  const wa = String(s.socialWhatsapp || '').trim();
  const out = {
    telegram: url(s.socialTelegram && !/[/.]/.test(s.socialTelegram) ? 't.me/' + s.socialTelegram.replace(/^@/, '') : s.socialTelegram),
    vk: url(s.socialVk), max: url(s.socialMax), instagram: url(s.socialInstagram),
    whatsapp: /^[+\d\s()-]{10,}$/.test(wa) ? 'https://wa.me/' + wa.replace(/\D/g, '').replace(/^8(\d{10})$/, '7$1') : url(wa),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

r.get('/config', ah(async (req, res) => {
  const s = await getShopSettings();
  const store = await prisma.setting.findMany({ where: { key: { in: ['storeName', 'currency'] } } });
  const g = Object.fromEntries(store.map((x) => [x.key, x.value]));
  res.json({
    enabled: s.enabled === '1', title: s.title || g.storeName || 'Интернет-магазин', tagline: s.tagline, currency: g.currency || '₽',
    phone: s.phone, email: s.email, address: s.address, workHours: s.workHours,
    deliveryMethods: delivery.getMethods(s).filter((m) => m.enabled).map((m) => ({ id: m.id, carrier: m.carrier, name: m.name, needs: m.needs, api: m.api, price: m.api ? null : delivery.applyMarkup(m, Number(m.price || 0), 0), freeFrom: Number(m.freeFrom || 0), days: m.days, description: m.description })),
    pickupAddress: delivery.getMethods(s).find((m) => m.carrier === 'pickup' && m.enabled)?.description || s.pickupAddress,
    seller: { name: s.sellerName, inn: s.sellerInn, ogrn: s.sellerOgrn, address: s.sellerAddress, email: s.sellerEmail || s.email, phone: s.sellerPhone || s.phone },
    legal: Object.entries(legal.DOCS).map(([id, title]) => ({ id, title })),
    chat: { enabled: s.chatEnabled === '1', greeting: s.chatGreeting },
    vapidKey: (await getVapid()).publicKey,
    payments: { cash: s.cashEnabled === '1', tbank: tbankReady(s) || (s.tbankEnabled === '1' && s.smsMode === 'test') },
    testMode: s.smsMode === 'test', allowBackorder: s.allowBackorder === '1',
    socials: socialLinks(s),
    metrika: /^\d{5,12}$/.test(s.metrikaId) ? { id: Number(s.metrikaId), ecommerce: s.metrikaEcommerce === '1' } : null,
  });
}));

const productWhere = async (s, q) => {
  const where = { active: true, showInShop: true, price: { gt: 0 } };
  if (s.showOutOfStock !== '1') where.stocks = { some: { quantity: { gt: 0 }, ...(await stockWhere(s)) } };
  if (q.category) where.categoryId = Number(q.category);
  if (q.q) { const t = String(q.q).trim(); where.OR = [{ name: like(t) }, { sku: like(t) }, { barcodes: { some: { code: t } } }]; }
  return where;
};

r.get('/categories', ah(async (req, res) => {
  const s = await getShopSettings();
  const base = await productWhere(s, {});
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' }, include: {
    _count: { select: { products: { where: base } } },
    products: { where: { ...base, images: { some: {} } }, take: 1, select: { images: { take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } },
  } });
  res.json(cats.filter((c) => c._count.products > 0).map((c) => ({ id: c.id, name: c.name, count: c._count.products, image: c.products[0]?.images[0]?.path || null })));
}));

r.get('/products', ah(async (req, res) => {
  const s = await getShopSettings();
  const where = await productWhere(s, req.query);
  if (req.query.min) where.price = { ...where.price, gte: num(req.query.min) };
  if (req.query.max) where.price = { ...where.price, lte: num(req.query.max) };
  if (req.query.sale) where.oldPrice = { not: null };
  const orderBy = { cheap: { price: 'asc' }, expensive: { price: 'desc' }, new: { id: 'desc' }, name: { name: 'asc' } }[req.query.sort] || { id: 'desc' };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(60, Number(req.query.limit) || 24);
  const include = { images: { orderBy: { sort: 'asc' }, take: 2 }, category: true, stocks: true };
  let items, total;
  if (req.query.sort === 'popular') {
    // по продажам за 90 дней
    const all = await prisma.product.findMany({ where, include });
    const top = await prisma.saleItem.groupBy({ by: ['productId'], _sum: { quantity: true }, where: { productId: { in: all.map((p) => p.id) }, sale: { date: { gte: new Date(Date.now() - 90 * 864e5) } } } });
    const sold = Object.fromEntries(top.map((t) => [t.productId, t._sum.quantity]));
    all.sort((a, b) => (sold[b.id] || 0) - (sold[a.id] || 0));
    total = all.length; items = all.slice((page - 1) * limit, page * limit);
  } else {
    [items, total] = await Promise.all([prisma.product.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }), prisma.product.count({ where })]);
  }
  res.json({ items: items.map((p) => publicProduct(p, s)), total, page, limit });
}));

r.get('/products/:id', ah(async (req, res) => {
  const s = await getShopSettings();
  const p = await prisma.product.findFirst({ where: { id: Number(req.params.id), active: true, showInShop: true }, include: { images: { orderBy: { sort: 'asc' } }, attributes: true, category: true, stocks: true } });
  if (!p) throw new HttpError(404, 'Товар не найден');
  const related = await prisma.product.findMany({ where: { ...(await productWhere(s, {})), categoryId: p.categoryId, id: { not: p.id } }, include: { images: { orderBy: { sort: 'asc' }, take: 2 }, category: true, stocks: true }, take: 8 });
  res.json({ ...publicProduct(p, s), related: related.map((x) => publicProduct(x, s)) });
}));

// ---------- юридические документы ----------
r.get('/legal/:doc', ah(async (req, res) => {
  const id = req.params.doc;
  if (!legal.DOCS[id]) throw new HttpError(404, 'Документ не найден');
  const s = await getShopSettings();
  res.json({ id, title: legal.DOCS[id], text: legal.render(s['legal_' + id] || legal.TEMPLATES[id], s) });
}));

// ---------- доставка ----------
r.get('/delivery/cdek/cities', ah(async (req, res) => res.json(await delivery.cdekCities(await getShopSettings(), String(req.query.q || '')))));
r.get('/delivery/cdek/points', ah(async (req, res) => res.json(await delivery.cdekPoints(await getShopSettings(), req.query.cityCode))));

async function cartInfo(tx, s, lines) {
  const items = []; let weight = 0;
  for (const l of lines) {
    const p = await tx.product.findFirst({ where: { id: l.productId, active: true, showInShop: true }, include: { stocks: true } });
    if (!p || p.price <= 0) throw new HttpError(400, 'Товар больше не продаётся — обновите корзину');
    items.push({ p, quantity: l.quantity });
    weight += (p.weight || num(s.defaultWeight) || 500) * l.quantity;
  }
  return { items, weight, subtotal: round(items.reduce((a, i) => a + i.p.price * i.quantity, 0)) };
}
const parseLines = (raw) => (raw || []).map((i) => ({ productId: Number(i.productId), quantity: Math.floor(num(i.quantity)) })).filter((i) => i.productId && i.quantity > 0);

r.post('/delivery/quote', ah(async (req, res) => {
  const s = await getShopSettings();
  const lines = parseLines(req.body.items);
  if (!lines.length) throw new HttpError(400, 'Корзина пуста');
  const c = await cartInfo(prisma, s, lines);
  const q = await delivery.quote(s, String(req.body.methodId), req.body.to || {}, { subtotal: c.subtotal, weight: c.weight });
  res.json({ price: q.price, days: q.days, name: q.name });
}));

// ---------- вход по SMS ----------
r.post('/auth/request-code', ah(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const ip = ipOf(req);
  const s = await getShopSettings();
  const last = await prisma.smsCode.findFirst({ where: { phone }, orderBy: { id: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < 60e3) throw new HttpError(429, `Код уже отправлен. Повторить можно через ${Math.ceil((60e3 - (Date.now() - last.createdAt.getTime())) / 1000)} сек.`);
  const hourAgo = new Date(Date.now() - 3600e3);
  if (await prisma.smsCode.count({ where: { phone, createdAt: { gte: hourAgo } } }) >= 5) throw new HttpError(429, 'Слишком много попыток. Попробуйте через час.');
  if (await prisma.smsCode.count({ where: { ip, createdAt: { gte: hourAgo } } }) >= 20) throw new HttpError(429, 'Слишком много запросов. Попробуйте позже.');
  const code = String(crypto.randomInt(1000, 10000));
  const r1 = await sendSms(s, phone, `Код для входа: ${code}`);
  await prisma.smsCode.create({ data: { phone, ip, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + 5 * 60e3) } });
  res.json({ ok: true, phone, ...(r1.test ? { testCode: code } : {}) });
}));

r.post('/auth/verify', ah(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const code = String(req.body.code || '').replace(/\D/g, '');
  const rec = await prisma.smsCode.findFirst({ where: { phone, used: false }, orderBy: { id: 'desc' } });
  if (!rec || rec.expiresAt < new Date()) throw new HttpError(400, 'Код устарел. Запросите новый.');
  if (rec.codeHash === hashCode(phone, code) && !req.body.consent && !(await prisma.customer.findUnique({ where: { phone } }))?.consentAt) throw new HttpError(400, 'Подтвердите согласие на обработку персональных данных');
  if (rec.attempts >= 5) throw new HttpError(429, 'Слишком много неверных попыток. Запросите новый код.');
  if (rec.codeHash !== hashCode(phone, code)) {
    await prisma.smsCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Неверный код');
  }
  const existing = await prisma.customer.findUnique({ where: { phone } });
  if (!req.body.consent && !existing?.consentAt) throw new HttpError(400, 'Подтвердите согласие на обработку персональных данных');
  await prisma.smsCode.update({ where: { id: rec.id }, data: { used: true } });
  const customer = await prisma.customer.upsert({
    where: { phone },
    update: { lastLogin: new Date(), ...(req.body.consent && !existing?.consentAt ? { consentAt: new Date() } : {}) },
    create: { phone, name: str(req.body.name), lastLogin: new Date(), consentAt: new Date() },
  });
  res.json({ token: jwt.sign({ cid: customer.id, phone }, SECRET, { expiresIn: '90d' }), customer });
}));

r.get('/me', customerAuth(), ah(async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.customer.cid } });
  if (!c) throw new HttpError(401, 'Войдите заново');
  res.json(c);
}));
r.put('/me', customerAuth(), ah(async (req, res) => {
  res.json(await prisma.customer.update({ where: { id: req.customer.cid }, data: { name: str(req.body.name), email: str(req.body.email), address: str(req.body.address) } }));
}));

// ---------- заказы ----------
const orderInclude = { items: { include: { product: { select: { images: { take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } } } } };
const publicOrder = (o) => ({ ...o, adminNote: undefined, paymentId: undefined });

async function startPayment(s, order) {
  if (tbankReady(s)) {
    // повторная попытка оплаты — новый OrderId для банка (Z-000001-12345), номер заказа тот же
    const p = await tbank.initPayment(s, order, order.paymentId ? Date.now() % 100000 : 0);
    await prisma.order.update({ where: { id: order.id }, data: { paymentId: String(p.PaymentId), paymentUrl: p.PaymentURL, paymentStatus: 'pending' } });
    return p.PaymentURL;
  }
  if (s.smsMode === 'test' && s.tbankEnabled === '1') {
    // тестовая оплата без банка — только в тестовом режиме магазина
    const url = `/order/${order.id}?testpay=1`;
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'pending', paymentUrl: url } });
    return url;
  }
  throw new HttpError(503, 'Онлайн-оплата временно недоступна. Выберите оплату при получении.');
}

r.post('/orders', customerAuth(), ah(async (req, res) => {
  const s = await getShopSettings();
  const b = req.body;
  const lines = parseLines(b.items);
  if (!lines.length) throw new HttpError(400, 'Корзина пуста');
  if (lines.length > 100) throw new HttpError(400, 'Слишком много позиций');
  if (!b.agree) throw new HttpError(400, 'Подтвердите согласие с условиями продажи и возврата');
  const method = b.paymentMethod === 'tbank' ? 'tbank' : 'cash';
  if (method === 'cash' && s.cashEnabled !== '1') throw new HttpError(400, 'Оплата при получении недоступна');
  const customer = await prisma.customer.findUnique({ where: { id: req.customer.cid } });

  // проверка остатков и цен — по базе; доставка — пересчёт на сервере
  const c = await cartInfo(prisma, s, lines);
  for (const { p, quantity } of c.items) {
    const stock = p.stocks.filter((x) => !s.warehouseId || x.warehouseId === Number(s.warehouseId)).reduce((a, x) => a + x.quantity, 0);
    if (s.allowBackorder !== '1' && quantity > stock) throw new HttpError(400, stock > 0 ? `«${p.name}»: в наличии только ${stock} шт.` : `«${p.name}» закончился`);
  }
  const q = await delivery.quote(s, String(b.delivery || ''), b.deliveryTo || {}, { subtotal: c.subtotal, weight: c.weight });

  const order = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, 'order_seq', 'Z-');
    return tx.order.create({ data: {
      number, customerId: customer.id, paymentMethod: method,
      delivery: q.methodId, deliveryName: q.name, deliveryInfo: JSON.stringify(q.info), address: q.address,
      name: str(b.name) || customer.name, phone: customer.phone, comment: str(b.comment), agreedAt: new Date(),
      subtotal: c.subtotal, deliveryPrice: q.price, total: round(c.subtotal + q.price),
      items: { create: c.items.map(({ p, quantity }) => ({ productId: p.id, name: p.name, price: p.price, quantity })) },
    }, include: orderInclude });
  });
  if (str(b.name) && !customer.name) await prisma.customer.update({ where: { id: customer.id }, data: { name: str(b.name) } });
  if (q.address && !customer.address && !['pickup'].includes(q.methodId)) await prisma.customer.update({ where: { id: customer.id }, data: { address: q.address } }).catch(() => {});
  notifyAdmins({ title: `Новый заказ ${order.number}`, body: `${order.name || '+' + order.phone} — ${order.total.toLocaleString('ru-RU')} ₽, ${order.items.length} поз., ${q.name}`, url: '/admin/orders', tag: 'order' });

  let paymentUrl = null;
  if (method === 'tbank') {
    try { paymentUrl = await startPayment(s, order); } catch (e) { return res.status(201).json({ order: publicOrder(order), paymentError: e.message }); }
  }
  res.status(201).json({ order: publicOrder(order), paymentUrl });
}));

r.get('/orders', customerAuth(), ah(async (req, res) => {
  res.json((await prisma.order.findMany({ where: { customerId: req.customer.cid }, include: orderInclude, orderBy: { id: 'desc' } })).map(publicOrder));
}));

async function myOrder(req) {
  const o = await prisma.order.findFirst({ where: { id: Number(req.params.id), customerId: req.customer.cid }, include: orderInclude });
  if (!o) throw new HttpError(404, 'Заказ не найден');
  return o;
}

r.get('/orders/:id', customerAuth(), ah(async (req, res) => {
  let o = await myOrder(req);
  // вернулись со страницы банка — уточняем статус, не дожидаясь уведомления
  if (o.paymentMethod === 'tbank' && o.paymentStatus === 'pending' && o.paymentId) {
    const s = await getShopSettings();
    if (tbankReady(s)) {
      try { const st = await tbank.getState(s, o.paymentId); await applyPaymentStatus(o.id, st.Status); o = await myOrder(req); } catch (e) { console.error(e.message); }
    }
  }
  res.json(publicOrder(o));
}));

r.post('/orders/:id/pay', customerAuth(), ah(async (req, res) => {
  const o = await myOrder(req);
  if (o.paymentMethod !== 'tbank' || o.paymentStatus === 'paid' || o.status === 'cancelled') throw new HttpError(400, 'Оплата для этого заказа недоступна');
  res.json({ paymentUrl: await startPayment(await getShopSettings(), o) });
}));

// тестовая оплата (только тестовый режим, без настроенного банка)
r.post('/orders/:id/test-pay', customerAuth(), ah(async (req, res) => {
  const s = await getShopSettings();
  if (s.smsMode !== 'test' || tbankReady(s)) throw new HttpError(403, 'Недоступно');
  const o = await myOrder(req);
  await applyPaymentStatus(o.id, 'CONFIRMED');
  res.json(publicOrder(await myOrder(req)));
}));

r.post('/orders/:id/cancel', customerAuth(), ah(async (req, res) => {
  const o = await myOrder(req);
  if (!['new'].includes(o.status) || o.paymentStatus === 'paid') throw new HttpError(400, 'Этот заказ уже нельзя отменить — свяжитесь с магазином');
  await prisma.order.update({ where: { id: o.id }, data: { status: 'cancelled' } });
  res.json(publicOrder(await myOrder(req)));
}));

async function applyPaymentStatus(orderId, status) {
  const map = { CONFIRMED: 'paid', AUTHORIZED: 'paid', REJECTED: 'failed', CANCELED: 'failed', DEADLINE_EXPIRED: 'failed', AUTH_FAIL: 'failed', REFUNDED: 'refunded', PARTIAL_REFUNDED: 'refunded', REVERSED: 'failed' };
  const ps = map[status];
  if (!ps) return;
  const o = await prisma.order.findUnique({ where: { id: orderId } });
  if (!o || o.paymentStatus === ps || (o.paymentStatus === 'paid' && ps === 'failed')) return;
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: ps, ...(ps === 'paid' ? { paidAt: new Date(), status: o.status === 'new' ? 'confirmed' : o.status } : {}) } });
}

// Уведомление от Т-Банка (NotificationURL). Ответ должен быть ровно «OK».
r.post('/tbank/notify', ah(async (req, res) => {
  const s = await getShopSettings();
  if (!tbank.verifyNotification(s, req.body)) { console.warn('Т-Банк: неверная подпись уведомления'); return res.status(400).send('BAD TOKEN'); }
  const number = String(req.body.OrderId || '').replace(/-\d+$/, '');
  const o = await prisma.order.findFirst({ where: { OR: [{ paymentId: String(req.body.PaymentId) }, { number }] } });
  if (o) await applyPaymentStatus(o.id, req.body.Status);
  res.send('OK');
}));

// ---------- чат с магазином ----------
// Только для вошедших покупателей: переписка привязана к аккаунту и видна на любом устройстве
async function myConversation(req, create) {
  const cid = req.customer.cid;
  let c = await prisma.conversation.findFirst({ where: { customerId: cid }, orderBy: { id: 'asc' } });
  if (!c && create) {
    const cust = await prisma.customer.findUnique({ where: { id: cid } });
    c = await prisma.conversation.create({ data: { visitorKey: 'cust-' + cid, customerId: cid, phone: cust.phone, name: cust.name } });
  }
  return c;
}

r.get('/chat', customerAuth(), ah(async (req, res) => {
  const c = await myConversation(req, false);
  if (!c) return res.json({ conversation: null, messages: [], cooldown: 0 });
  const after = Number(req.query.after) || 0;
  const messages = await prisma.chatMessage.findMany({ where: { conversationId: c.id, id: { gt: after } }, orderBy: { id: 'asc' }, take: 300, select: { id: true, sender: true, text: true, image: true, audio: true, duration: true, createdAt: true } });
  res.json({ conversation: { id: c.id, unread: c.unreadCustomer }, messages, cooldown: await chat.cooldownLeft(c.id) });
}));

r.post('/chat', customerAuth(), chat.upload, ah(async (req, res) => {
  const s = await getShopSettings();
  const files = chat.attachments(req);
  const cleanup = () => [files.image, files.audio].filter(Boolean).forEach((f) => require('fs').unlink(require('path').join(require('../paths').UPLOAD_DIR, f.replace('/uploads/', '')), () => {}));
  if (s.chatEnabled !== '1') { cleanup(); throw new HttpError(403, 'Чат отключён'); }
  const c = await myConversation(req, true);
  const wait = await chat.cooldownLeft(c.id);
  if (wait > 0) { cleanup(); return res.status(429).json({ error: `Подождите ${wait} с перед следующим сообщением`, retryAfter: wait }); }
  const msg = await chat.addMessage(c.id, { sender: 'customer', text: req.body.text, ...files });
  notifyAdmins({ title: `Сообщение в чате: ${c.name || '+' + c.phone}`, body: msg.text || (msg.audio ? `🎤 Голосовое сообщение, ${msg.duration} с` : '📷 Фото'), url: `/admin/chats?c=${c.id}`, tag: 'chat-' + c.id });
  res.status(201).json({ ...msg, cooldown: await chat.nextCooldown(c.id) });
}));

r.post('/chat/read', customerAuth(), ah(async (req, res) => {
  await prisma.conversation.updateMany({ where: { customerId: req.customer.cid }, data: { unreadCustomer: 0 } });
  res.json({ ok: true });
}));

// Пуш-уведомления покупателю об ответах в чате
r.post('/push/subscribe', customerAuth(), ah(async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh) throw new HttpError(400, 'Неверная подписка');
  await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
  await prisma.pushSubscription.create({ data: { endpoint: sub.endpoint, keys: JSON.stringify(sub.keys), visitorKey: 'cust-' + req.customer.cid } });
  res.json({ ok: true });
}));

module.exports = { router: r, normPhone, applyPaymentStatus, socialLinks, productWhere, publicProduct };
