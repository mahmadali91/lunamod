// Админка: клиенты магазина — список, карточка, посещения, чаты, рассылки, смена номера
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { ah, HttpError, str, clientIp } = require('../util');
const { requireAdmin } = require('../auth');
const { getShopSettings } = require('../shop/settings');
const { sendMail } = require('../shop/mail');
const { notifyVisitor } = require('../notify');

const r = express.Router();
const CUSTOMER_SECRET = (process.env.JWT_SECRET || 'change-me-please') + ':customer';
const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  if (!/^7\d{10}$/.test(d)) throw new HttpError(400, 'Введите номер в формате +7 900 000-00-00');
  return d;
};
const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 864e5);
const unsubToken = (cid, ch) => jwt.sign({ cid, purpose: 'unsub', ch }, CUSTOMER_SECRET, { expiresIn: '365d' });

/** Фильтр клиентов → prisma.where (используется и для списка, и для рассылки) */
async function buildWhere(f = {}) {
  const where = {};
  const q = String(f.q || '').trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    where.OR = [
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      { name: { contains: q } },
      { email: { contains: q } },
    ];
    if (where.OR.length === 0) where.OR = [{ name: { contains: q } }];
  }
  if (f.gender === 'male' || f.gender === 'female') where.gender = f.gender;
  if (f.gender === 'none') where.gender = null;
  const ageFrom = Number(f.ageFrom);
  const ageTo = Number(f.ageTo);
  if (ageFrom > 0 && ageFrom < 120) where.birthDate = { ...(where.birthDate || {}), lte: yearsAgo(ageFrom) };
  if (ageTo > 0 && ageTo < 120) where.birthDate = { ...(where.birthDate || {}), gte: yearsAgo(ageTo + 1) };
  if (f.hasEmail === '1') where.email = { not: null };
  if (f.verifiedEmail === '1') where.emailVerifiedAt = { not: null };
  if (f.marketing === '1') where.marketingConsentAt = { not: null };
  if (f.pushOk === '1') where.marketingPush = true;
  if (f.hasOrders === '1') where.orders = { some: {} };
  if (f.hasOrders === '0') where.orders = { none: {} };
  const days = Number(f.lastSeenDays);
  if (days > 0) where.visits = { some: { startedAt: { gte: new Date(Date.now() - days * 864e5) } } };
  const minTotal = Number(f.minTotal);
  if (minTotal > 0) {
    const sums = await prisma.order.groupBy({ by: ['customerId'], _sum: { total: true }, having: { total: { _sum: { gte: minTotal } } } });
    where.id = { in: sums.map((x) => x.customerId) };
    if (!where.id.in.length) where.id = { in: [0] };
  }
  return where;
}

async function statsFor(ids) {
  if (!ids.length) return { orders: new Map(), visits: new Map(), chats: new Map() };
  const [orders, visits, chats] = await Promise.all([
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.visitSession.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _max: { startedAt: true } }),
    prisma.conversation.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _max: { lastMessageAt: true } }),
  ]);
  return {
    orders: new Map(orders.map((x) => [x.customerId, { count: x._count._all, sum: x._sum.total || 0 }])),
    visits: new Map(visits.map((x) => [x.customerId, x._max.startedAt])),
    chats: new Map(chats.map((x) => [x.customerId, x._max.lastMessageAt])),
  };
}

// ---------- список клиентов ----------
r.get('/', ah(async (req, res) => {
  const perPage = Math.min(100, Math.max(10, Number(req.query.perPage) || 50));
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = await buildWhere(req.query);
  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }),
  ]);
  const st = await statsFor(rows.map((c) => c.id));
  const items = rows.map((c) => ({
    id: c.id, phone: c.phone, name: c.name, email: c.email, emailVerifiedAt: c.emailVerifiedAt, avatar: c.avatar,
    birthDate: c.birthDate, gender: c.gender, createdAt: c.createdAt, lastLogin: c.lastLogin,
    marketingConsentAt: c.marketingConsentAt, marketingPush: c.marketingPush,
    ordersCount: st.orders.get(c.id)?.count || 0, ordersSum: st.orders.get(c.id)?.sum || 0,
    lastVisitAt: st.visits.get(c.id) || null, lastChatAt: st.chats.get(c.id) || null,
  }));
  res.json({ total, page, perPage, items });
}));

// ---------- карточка клиента ----------
r.get('/:id(\\d+)', ah(async (req, res) => {
  const id = Number(req.params.id);
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Клиент не найден');
  const since = new Date(Date.now() - 30 * 864e5);
  const [orders, chats, sessions, phoneChanges, events, favorites, waitlist] = await Promise.all([
    prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, status: true, paymentStatus: true, total: true, createdAt: true } }),
    prisma.conversation.findMany({ where: { customerId: id }, orderBy: { lastMessageAt: 'desc' }, take: 5, select: { id: true, status: true, unreadAdmin: true, lastMessageAt: true, lastText: true } }),
    prisma.visitSession.findMany({ where: { customerId: id }, orderBy: { startedAt: 'desc' }, take: 20, select: { id: true, startedAt: true, lastSeenAt: true, durationSec: true, referrer: true } }),
    prisma.customerPhoneChange.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.visitEvent.findMany({ where: { customerId: id, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300, select: { type: true, path: true, productId: true, query: true, createdAt: true } }),
    prisma.favorite.findMany({ where: { customerId: id }, take: 20, select: { productId: true } }),
    prisma.stockSubscription.count({ where: { customerId: id, notifiedAt: null } }),
  ]);
  const orderAgg = await prisma.order.aggregate({ where: { customerId: id }, _count: { _all: true }, _sum: { total: true }, _max: { createdAt: true } });
  const totalSec = (await prisma.visitSession.aggregate({ where: { customerId: id, startedAt: { gte: since } }, _sum: { durationSec: true } }))._sum.durationSec || 0;

  // интересы: топ товаров и категорий по просмотрам
  const byProduct = new Map();
  const byCat = new Map();
  const queries = [];
  const productIds = [...new Set(events.filter((e) => e.productId).map((e) => e.productId))];
  const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, categoryId: true, parentId: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } }) : [];
  const pMap = new Map(products.map((p) => [p.id, p]));
  const catIds = [...new Set(products.map((p) => p.categoryId).filter(Boolean))];
  const cats = catIds.length ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
  const cMap = new Map(cats.map((c2) => [c2.id, c2.name]));
  for (const e of events) {
    if (e.type === 'search' && e.query) queries.push(e.query);
    if (!e.productId) continue;
    const p = pMap.get(e.productId);
    if (!p) continue;
    const cardId = p.parentId || p.id;
    byProduct.set(cardId, { id: cardId, name: p.name, image: p.images[0]?.path || null, views: (byProduct.get(cardId)?.views || 0) + 1 });
    if (p.categoryId) byCat.set(p.categoryId, { id: p.categoryId, name: cMap.get(p.categoryId) || '—', views: (byCat.get(p.categoryId)?.views || 0) + 1 });
  }
  res.json({
    customer: c,
    stats: { ordersCount: orderAgg._count._all, ordersSum: orderAgg._sum.total || 0, lastOrderAt: orderAgg._max.createdAt, visits30d: sessions.length, time30dSec: totalSec, favorites: favorites.length, waitlist },
    orders, chats, sessions, phoneChanges,
    interests: {
      products: [...byProduct.values()].sort((a, b) => b.views - a.views).slice(0, 5),
      categories: [...byCat.values()].sort((a, b) => b.views - a.views).slice(0, 5),
      searches: [...new Set(queries)].slice(0, 10),
      lastEvents: events.slice(0, 10).map((e) => ({ type: e.type, path: e.path, query: e.query, at: e.createdAt })),
    },
  });
}));

// ---------- сообщение одному клиенту ----------
r.post('/:id(\\d+)/message', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const text = str(req.body.text);
  if (!text) throw new HttpError(400, 'Введите текст сообщения');
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Клиент не найден');
  const s = await getShopSettings();
  const sent = await notifyVisitor('cust-' + id, { title: s.title || 'Магазин', body: text.slice(0, 300), url: '/' });
  res.json({ ok: true, sent });
}));

// ---------- смена номера администратором ----------
r.post('/:id(\\d+)/phone', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const phone = normPhone(req.body.phone);
  const reason = str(req.body.reason)?.slice(0, 500) || null;
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Клиент не найден');
  if (phone === c.phone) throw new HttpError(400, 'Это уже текущий номер клиента');
  const busy = await prisma.customer.findUnique({ where: { phone } });
  if (busy) throw new HttpError(409, `Номер уже принадлежит другому аккаунту (id ${busy.id}). Объедините аккаунты вручную.`);
  const last = await prisma.customerPhoneChange.findFirst({ where: { customerId: id }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < 864e5) throw new HttpError(429, 'Номер этого клиента меняли меньше суток назад');
  const updated = await prisma.customer.update({ where: { id }, data: { phone } });
  await prisma.customerPhoneChange.create({ data: { customerId: id, oldPhone: c.phone || '', newPhone: phone, reason, byUserId: req.user?.id || null } });
  await prisma.conversation.updateMany({ where: { customerId: id, status: 'open' }, data: { phone } });
  const s = await getShopSettings();
  // предупреждаем клиента о смене номера на подтверждённый email
  if (c.email && c.emailVerifiedAt) sendMail(s, { to: c.email, subject: 'Номер аккаунта изменён', text: `Номер вашего аккаунта изменён на новый. Если это не вы — ответьте на письмо.` }).catch(() => {});
  res.json(updated);
}));

// ---------- массовые рассылки ----------
const running = new Set();

async function processBulk(bulkId) {
  if (running.has(bulkId)) return;
  running.add(bulkId);
  try {
    const s = await getShopSettings();
    const bulk = await prisma.bulkMessage.findUnique({ where: { id: bulkId } });
    if (!bulk) return;
    const base = (s.siteUrl || '').replace(/\/$/, '');
    let failedRow = 0;
    for (;;) {
      const cur = await prisma.bulkMessage.findUnique({ where: { id: bulkId } });
      if (!cur || cur.status !== 'running') return;
      const batch = await prisma.bulkRecipient.findMany({ where: { bulkId, status: 'pending' }, take: 25 });
      if (!batch.length) break;
      for (const rec of batch) {
        const c = await prisma.customer.findUnique({ where: { id: rec.customerId } });
        if (!c) { await prisma.bulkRecipient.update({ where: { id: rec.id }, data: { status: 'skipped', error: 'клиент удалён' } }); await prisma.bulkMessage.update({ where: { id: bulkId }, data: { skipped: { increment: 1 } } }); continue; }
        try {
          const sent = await notifyVisitor('cust-' + c.id, { title: s.title || 'Магазин', body: bulk.text.slice(0, 300), url: '/' });
          if (!sent) throw new Error('нет подписки на push');
          await prisma.bulkRecipient.update({ where: { id: rec.id }, data: { status: 'sent', sentAt: new Date() } });
          await prisma.bulkMessage.update({ where: { id: bulkId }, data: { sent: { increment: 1 } } });
          failedRow = 0;
        } catch (e) {
          await prisma.bulkRecipient.update({ where: { id: rec.id }, data: { status: 'failed', error: String(e.message || e).slice(0, 300) } });
          await prisma.bulkMessage.update({ where: { id: bulkId }, data: { failed: { increment: 1 } } });
          if (++failedRow >= 10) {
            await prisma.bulkMessage.update({ where: { id: bulkId }, data: { status: 'error', error: 'остановлено после 10 ошибок подряд', finishedAt: new Date() } });
            return;
          }
        }
      }
      await new Promise((r2) => setTimeout(r2, 200));
    }
    const left = await prisma.bulkRecipient.count({ where: { bulkId, status: 'pending' } });
    await prisma.bulkMessage.update({ where: { id: bulkId }, data: { status: left ? 'running' : 'done', finishedAt: left ? null : new Date() } });
  } catch (e) {
    await prisma.bulkMessage.update({ where: { id: bulkId }, data: { status: 'error', error: String(e.message || e).slice(0, 500), finishedAt: new Date() } }).catch(() => {});
  } finally {
    running.delete(bulkId);
  }
}

r.post('/bulk', requireAdmin, ah(async (req, res) => {
  const channel = 'push';
  const text = str(req.body.text);
  if (!text || text.length < 2) throw new HttpError(400, 'Введите текст сообщения');
  if (text.length > 500) throw new HttpError(400, 'Слишком длинный текст (до 500 символов)');
  const filter = req.body.filter && typeof req.body.filter === 'object' ? req.body.filter : {};
  const where = await buildWhere(filter);
  // только с согласием на рекламу
  where.marketingConsentAt = { not: null };
  where.marketingPush = true;
  const customers = await prisma.customer.findMany({ where, select: { id: true }, take: 501 });
  if (!customers.length) throw new HttpError(400, 'Нет получателей с согласием на рассылку по этому фильтру');
  if (customers.length > 500) throw new HttpError(400, 'Больше 500 получателей — сузьте фильтр');
  const bulk = await prisma.bulkMessage.create({ data: { channel, text, filter: JSON.stringify(filter), total: customers.length, byUserId: req.user?.id || null } });
  await prisma.bulkRecipient.createMany({ data: customers.map((c) => ({ bulkId: bulk.id, customerId: c.id })) });
  processBulk(bulk.id);
  res.status(201).json({ id: bulk.id, total: customers.length });
}));

r.get('/bulk', ah(async (req, res) => {
  res.json(await prisma.bulkMessage.findMany({ orderBy: { id: 'desc' }, take: 20 }));
}));

r.get('/bulk/:id(\\d+)', ah(async (req, res) => {
  const bulk = await prisma.bulkMessage.findUnique({ where: { id: Number(req.params.id) } });
  if (!bulk) throw new HttpError(404, 'Рассылка не найдена');
  const failed = await prisma.bulkRecipient.findMany({ where: { bulkId: bulk.id, status: 'failed' }, take: 20, select: { customerId: true, error: true } });
  res.json({ ...bulk, failedExamples: failed });
}));

r.post('/bulk/:id(\\d+)/cancel', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.bulkRecipient.updateMany({ where: { bulkId: id, status: 'pending' }, data: { status: 'skipped', error: 'отменено' } });
  res.json(await prisma.bulkMessage.update({ where: { id }, data: { status: 'cancelled', finishedAt: new Date() } }));
}));


// Удаление клиента: только если у него нет заказов и переписки (чистка тестовых аккаунтов)
r.delete('/:id(\\d+)', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Клиент не найден');
  const orders = await prisma.order.count({ where: { customerId: id } });
  if (orders > 0) throw new HttpError(400, 'У клиента есть заказы — удалить нельзя (сохраните историю)');
  const chats = await prisma.chatMessage.count({ where: { conversation: { customerId: id } } });
  if (chats > 0) throw new HttpError(400, 'У клиента есть переписка — удалить нельзя');
  await prisma.customer.delete({ where: { id } });
  res.json({ ok: true });
}));

module.exports = r;
