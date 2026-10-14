const express = require('express');
const prisma = require('../db');
const { ah, HttpError, changeStock, nextNumber, num, int, str } = require('../util');

const r = express.Router();
const include = { channel: true, counterparty: true, warehouse: true, items: { include: { product: { include: { barcodes: { where: { isPrimary: true } } } } } } };

r.get('/', ah(async (req, res) => {
  const where = {};
  if (req.query.channelId) where.channelId = Number(req.query.channelId);
  if (req.query.counterpartyId) where.counterpartyId = Number(req.query.counterpartyId);
  if (req.query.warehouseId) where.warehouseId = Number(req.query.warehouseId);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.from || req.query.to) {
    where.date = {};
    if (req.query.from) where.date.gte = new Date(req.query.from);
    if (req.query.to) { const t = new Date(req.query.to); t.setHours(23, 59, 59, 999); where.date.lte = t; }
  }
  if (req.query.q) where.number = { contains: String(req.query.q) };
  res.json(await prisma.sale.findMany({ where, include: { channel: true, counterparty: true, warehouse: true, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, take: Number(req.query.limit) || 300 }));
}));

r.get('/:id', ah(async (req, res) => {
  const s = await prisma.sale.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!s) throw new HttpError(404, 'Продажа не найдена');
  res.json(s);
}));

r.post('/', ah(async (req, res) => {
  const b = req.body;
  const items = (b.items || []).filter((i) => i.productId && num(i.quantity) > 0);
  if (!b.warehouseId) throw new HttpError(400, 'Выберите склад');
  if (!items.length) throw new HttpError(400, 'Корзина пуста');
  const allowNegative = Boolean(b.allowNegative);
  const sale = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, 'sale_seq', 'S-');
    const subtotal = items.reduce((s, i) => s + num(i.quantity) * num(i.price), 0);
    const discount = Math.min(num(b.discount), subtotal);
    const sale = await tx.sale.create({ data: {
      number, warehouseId: Number(b.warehouseId), channelId: int(b.channelId), counterpartyId: int(b.counterpartyId),
      discount, total: subtotal - discount, paymentMethod: b.paymentMethod || 'cash', note: str(b.note), date: b.date ? new Date(b.date) : new Date(),
    } });
    for (const i of items) {
      const p = await tx.product.findUnique({ where: { id: Number(i.productId) } });
      if (!p) throw new HttpError(400, 'Товар не найден');
      await tx.saleItem.create({ data: { saleId: sale.id, productId: p.id, quantity: num(i.quantity), price: num(i.price), costPrice: p.costPrice } });
      await changeStock(tx, { productId: p.id, warehouseId: sale.warehouseId, quantity: -num(i.quantity), type: 'SALE', note: number, saleId: sale.id, allowNegative });
    }
    return sale;
  });
  res.status(201).json(await prisma.sale.findUnique({ where: { id: sale.id }, include }));
}));

// Возврат: товар возвращается на склад
r.post('/:id/return', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const s = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!s) throw new HttpError(404, 'Продажа не найдена');
    if (s.status === 'returned') throw new HttpError(400, 'Уже возвращена');
    for (const i of s.items) await changeStock(tx, { productId: i.productId, warehouseId: s.warehouseId, quantity: i.quantity, type: 'RETURN', note: `Возврат ${s.number}`, saleId: s.id });
    await tx.sale.update({ where: { id }, data: { status: 'returned' } });
  });
  res.json(await prisma.sale.findUnique({ where: { id }, include }));
}));

module.exports = r;
