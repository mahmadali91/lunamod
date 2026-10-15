// Чаты с покупателями (админка) и подписка сотрудников на пуш-уведомления
const express = require('express');
const prisma = require('../db');
const { ah, HttpError, fillImages } = require('../util');
const chat = require('../chat');
const { notifyVisitor, getVapid } = require('../notify');

const r = express.Router();

r.get('/', ah(async (req, res) => {
  const where = req.query.status === 'closed' ? { status: 'closed' } : req.query.status === 'all' ? {} : { status: 'open' };
  if (req.query.q) { const q = String(req.query.q); where.OR = [{ name: { contains: q } }, { phone: { contains: q.replace(/\D/g, '') || q } }, { lastText: { contains: q } }]; }
  res.json(await prisma.conversation.findMany({ where, include: { customer: { select: { id: true, name: true, phone: true } } }, orderBy: { lastMessageAt: 'desc' }, take: 200 }));
}));

r.get('/unread', ah(async (req, res) => {
  const a = await prisma.conversation.aggregate({ _sum: { unreadAdmin: true }, where: { unreadAdmin: { gt: 0 } } });
  res.json({ unread: a._sum.unreadAdmin || 0 });
}));

r.get('/:id(\\d+)', ah(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { id: Number(req.params.id) }, include: { customer: true } });
  if (!c) throw new HttpError(404, 'Чат не найден');
  const after = Number(req.query.after) || 0;
  const messages = await prisma.chatMessage.findMany({ where: { conversationId: c.id, id: { gt: after } }, orderBy: { id: 'asc' }, take: 500 });
  // заказы покупателя: по привязанному аккаунту или по телефону
  const orders = c.customerId || c.phone ? await prisma.order.findMany({
    where: { OR: [...(c.customerId ? [{ customerId: c.customerId }] : []), ...(c.phone ? [{ phone: c.phone }] : [])] },
    include: { items: { include: { product: { select: { id: true, images: { where: { kind: 'image' }, take: 1, orderBy: { sort: 'asc' }, select: { path: true } } } } } } },
    orderBy: { id: 'desc' }, take: 20,
  }) : [];
  await fillImages(orders.flatMap((o) => o.items.map((i) => i.product)));
  res.json({ conversation: c, messages, orders });
}));

r.post('/:id(\\d+)/messages', chat.upload, ah(async (req, res) => {
  const c = await prisma.conversation.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) throw new HttpError(404, 'Чат не найден');
  const msg = await chat.addMessage(c.id, { sender: 'admin', userId: req.user.id, text: req.body.text, ...chat.attachments(req) });
  await prisma.conversation.update({ where: { id: c.id }, data: { unreadAdmin: 0 } });
  notifyVisitor(c.customerId ? 'cust-' + c.customerId : c.visitorKey, { title: 'Ответ магазина', body: msg.text || (msg.audio ? '🎤 Голосовое сообщение' : '📷 Фото'), url: '/?chat=1' });
  res.status(201).json(msg);
}));

r.post('/:id(\\d+)/read', ah(async (req, res) => {
  await prisma.conversation.update({ where: { id: Number(req.params.id) }, data: { unreadAdmin: 0 } });
  res.json({ ok: true });
}));

r.post('/:id(\\d+)/status', ah(async (req, res) => {
  res.json(await prisma.conversation.update({ where: { id: Number(req.params.id) }, data: { status: req.body.status === 'closed' ? 'closed' : 'open', unreadAdmin: 0 } }));
}));

// ---------- пуш-уведомления сотрудникам ----------
const push = express.Router();
push.get('/key', ah(async (req, res) => res.json({ key: (await getVapid()).publicKey })));
push.post('/subscribe', ah(async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh) throw new HttpError(400, 'Неверная подписка');
  await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
  await prisma.pushSubscription.create({ data: { endpoint: sub.endpoint, keys: JSON.stringify(sub.keys), userId: req.user.id } });
  res.json({ ok: true });
}));
push.post('/unsubscribe', ah(async (req, res) => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: String(req.body.endpoint || '') } });
  res.json({ ok: true });
}));
push.post('/test', ah(async (req, res) => {
  const { notifyAdmins } = require('../notify');
  res.json(await notifyAdmins({ title: 'Проверка уведомлений', body: 'Уведомления работают 👍', url: '/admin/chats', tag: 'test' }));
}));

module.exports = { chats: r, push };
