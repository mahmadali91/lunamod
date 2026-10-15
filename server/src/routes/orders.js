// Заказы интернет-магазина (админка) и настройки магазина
const express = require('express');
const prisma = require('../db');
const { ah, HttpError, changeStock, nextNumber, str } = require('../util');
const { requireAdmin } = require('../auth');
const { getShopSettings, saveShopSettings, masked, tbankReady } = require('../shop/settings');
const tbank = require('../shop/tbank');

const r = express.Router();
const include = { customer: true, items: { include: { product: { select: { id: true, sku: true, images: { take: 1, orderBy: { sort: 'asc' }, select: { path: true } }, stocks: true } } } } };
const STATUSES = ['new', 'confirmed', 'ready', 'completed', 'cancelled'];

r.get('/', ah(async (req, res) => {
  const where = {};
  if (req.query.status === 'active') where.status = { in: ['new', 'confirmed', 'ready'] };
  else if (STATUSES.includes(req.query.status)) where.status = req.query.status;
  if (req.query.q) { const q = String(req.query.q).replace(/^\+/, ''); where.OR = [{ number: { contains: q } }, { phone: { contains: q.replace(/\D/g, '') || q } }, { name: { contains: q } }]; }
  const [list, counts] = await Promise.all([
    prisma.order.findMany({ where, include: { customer: true, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, take: 300 }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
  ]);
  res.json({ items: list, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
}));

r.get('/:id(\\d+)', ah(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!o) throw new HttpError(404, 'Заказ не найден');
  res.json(o);
}));

// Смена статуса. «Выполнен» = товар выдан покупателю: создаём продажу и списываем остаток.
r.post('/:id(\\d+)/status', ah(async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body.status);
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Неизвестный статус');
  const s = await getShopSettings();
  const o = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!o) throw new HttpError(404, 'Заказ не найден');
  if (o.status === 'completed' || o.status === 'cancelled') throw new HttpError(400, 'Заказ уже закрыт');

  if (status === 'completed') {
    const warehouse = s.warehouseId ? await prisma.warehouse.findUnique({ where: { id: Number(s.warehouseId) } }) : await prisma.warehouse.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
    if (!warehouse) throw new HttpError(400, 'Нет склада для списания — укажите склад в настройках магазина');
    await prisma.$transaction(async (tx) => {
      let channel = await tx.salesChannel.findFirst({ where: { name: 'Интернет-магазин' } });
      if (!channel) channel = await tx.salesChannel.create({ data: { name: 'Интернет-магазин', type: 'online', color: '#6250d6' } });
      let cp = await tx.counterparty.findFirst({ where: { phone: '+' + o.phone } });
      if (!cp) cp = await tx.counterparty.create({ data: { name: o.name || 'Покупатель +' + o.phone, phone: '+' + o.phone, type: 'customer', note: 'Покупатель интернет-магазина' } });
      const number = await nextNumber(tx, 'sale_seq', 'S-');
      const sale = await tx.sale.create({ data: {
        number, warehouseId: warehouse.id, channelId: channel.id, counterpartyId: cp.id, total: o.total, discount: 0,
        paymentMethod: o.paymentMethod === 'tbank' ? 'tbank' : 'cash', paidAmount: o.total, note: `Заказ ${o.number}`,
      } });
      for (const i of o.items) {
        const p = await tx.product.findUnique({ where: { id: i.productId } });
        await tx.saleItem.create({ data: { saleId: sale.id, productId: i.productId, quantity: i.quantity, price: i.price, costPrice: p?.costPrice || 0 } });
        await changeStock(tx, { productId: i.productId, warehouseId: warehouse.id, quantity: -i.quantity, type: 'SALE', note: `${number} (заказ ${o.number})`, saleId: sale.id });
      }
      if (o.deliveryPrice > 0) { /* доставка входит в сумму продажи как услуга без товара */ }
      await tx.order.update({ where: { id }, data: { status: 'completed', saleId: sale.id, paymentStatus: o.paymentMethod === 'cash' ? 'paid' : o.paymentStatus, paidAt: o.paidAt || new Date() } });
    });
  } else if (status === 'cancelled') {
    let refund = null;
    if (o.paymentMethod === 'tbank' && o.paymentStatus === 'paid' && o.paymentId && tbankReady(s)) {
      if (!req.body.refund) throw new HttpError(400, 'Заказ оплачен онлайн. Подтвердите возврат денег покупателю.');
      await tbank.cancelPayment(s, o.paymentId);
      refund = 'refunded';
    }
    await prisma.order.update({ where: { id }, data: { status: 'cancelled', ...(refund ? { paymentStatus: refund } : {}) } });
  } else {
    await prisma.order.update({ where: { id }, data: { status } });
  }
  res.json(await prisma.order.findUnique({ where: { id }, include }));
}));

r.put('/:id(\\d+)/note', ah(async (req, res) => {
  res.json(await prisma.order.update({ where: { id: Number(req.params.id) }, data: { adminNote: str(req.body.adminNote) } }));
}));

// Отметить оплату наличными / вручную
r.post('/:id(\\d+)/paid', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.order.update({ where: { id }, data: { paymentStatus: 'paid', paidAt: new Date() } });
  res.json(await prisma.order.findUnique({ where: { id }, include }));
}));

r.get('/count', ah(async (req, res) => res.json({ new: await prisma.order.count({ where: { status: 'new' } }) })));

// ---------- настройки магазина (только админ) ----------
r.get('/settings', requireAdmin, ah(async (req, res) => res.json(masked(await getShopSettings()))));
r.put('/settings', requireAdmin, ah(async (req, res) => { await saveShopSettings(req.body); res.json(masked(await getShopSettings())); }));
r.post('/settings/test-tbank', requireAdmin, ah(async (req, res) => {
  const s = await getShopSettings();
  if (!s.tbankTerminalKey || !s.tbankPassword) throw new HttpError(400, 'Укажите TerminalKey и пароль терминала');
  // пробный платёж на 10 ₽ без отправки покупателю — проверяет ключи и подпись
  const p = await tbank.initPayment({ ...s, tbankReceipt: '0' }, { id: 0, number: 'TEST-' + Date.now(), total: 10, phone: '70000000000', items: [], deliveryPrice: 0 });
  try { await tbank.cancelPayment(s, p.PaymentId); } catch { /* платёж не оплачен — отмена не обязательна */ }
  res.json({ ok: true, message: 'Ключи верные: Т-Банк принял тестовый запрос' });
}));

module.exports = r;
