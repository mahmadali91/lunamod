const express = require('express');
const prisma = require('../db');
const { ah, HttpError, changeStock, nextNumber, num, int, str, like } = require('../util');

const r = express.Router();

// Остатки: товары × склады
r.get('/', ah(async (req, res) => {
  const where = { active: true };
  if (req.query.q) {
    const s = String(req.query.q).trim();
    where.OR = [{ name: like(s) }, { sku: like(s) }, { barcodes: { some: { code: like(s) } } }];
  }
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ where, include: { stocks: true, barcodes: { where: { isPrimary: true } }, images: { take: 1, orderBy: { sort: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { id: 'asc' } }),
  ]);
  const rows = products.map((p) => {
    const byWh = {};
    p.stocks.forEach((s) => { byWh[s.warehouseId] = s.quantity; });
    const total = p.stocks.reduce((a, s) => a + s.quantity, 0);
    return { id: p.id, name: p.name, image: p.images[0]?.path || null, sku: p.sku, unit: p.unit, price: p.price, costPrice: p.costPrice, minStock: p.minStock, barcode: p.barcodes[0]?.code, byWh, total };
  });
  res.json({ warehouses, rows });
}));

// Инвентаризация / корректировка: установить фактическое количество
r.post('/adjust', ah(async (req, res) => {
  const { warehouseId, items = [], note } = req.body;
  if (!warehouseId) throw new HttpError(400, 'Выберите склад');
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const productId = Number(it.productId);
      const cur = await tx.stock.findUnique({ where: { productId_warehouseId: { productId, warehouseId: Number(warehouseId) } } });
      const diff = num(it.quantity) - (cur?.quantity || 0);
      if (diff !== 0) await changeStock(tx, { productId, warehouseId: Number(warehouseId), quantity: diff, type: 'ADJUST', note: str(note) || 'Корректировка' });
    }
  });
  res.json({ ok: true });
}));

// Массовое редактирование: [{ productId, warehouseId, quantity }] — фактические остатки
r.post('/bulk', ah(async (req, res) => {
  const items = (req.body.items || []).filter((i) => i.productId && i.warehouseId && i.quantity !== '' && i.quantity !== null && !isNaN(Number(i.quantity)));
  if (!items.length) throw new HttpError(400, 'Нет изменений');
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      const productId = Number(it.productId), warehouseId = Number(it.warehouseId);
      const cur = await tx.stock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
      const diff = num(it.quantity) - (cur?.quantity || 0);
      if (diff !== 0) { await changeStock(tx, { productId, warehouseId, quantity: diff, type: 'ADJUST', note: str(req.body.note) || 'Редактирование остатков' }); changed++; }
    }
  }, { timeout: 60000 });
  res.json({ ok: true, changed });
}));

// Перемещение между складами
r.post('/transfer', ah(async (req, res) => {
  const from = Number(req.body.fromWarehouseId), to = Number(req.body.toWarehouseId);
  if (!from || !to || from === to) throw new HttpError(400, 'Выберите разные склады');
  await prisma.$transaction(async (tx) => {
    for (const it of req.body.items || []) {
      const q = num(it.quantity);
      if (q <= 0) continue;
      await changeStock(tx, { productId: Number(it.productId), warehouseId: from, quantity: -q, type: 'TRANSFER_OUT', note: str(req.body.note), allowNegative: false });
      await changeStock(tx, { productId: Number(it.productId), warehouseId: to, quantity: q, type: 'TRANSFER_IN', note: str(req.body.note) });
    }
  });
  res.json({ ok: true });
}));

r.get('/movements', ah(async (req, res) => {
  const where = {};
  if (req.query.productId) where.productId = Number(req.query.productId);
  if (req.query.warehouseId) where.warehouseId = Number(req.query.warehouseId);
  if (req.query.type) where.type = String(req.query.type);
  res.json(await prisma.stockMovement.findMany({ where, include: { product: true, warehouse: true }, orderBy: { id: 'desc' }, take: Number(req.query.limit) || 200 }));
}));

// ---- Приход товара ----
const receipts = express.Router();

receipts.get('/', ah(async (req, res) => {
  res.json(await prisma.receipt.findMany({ include: { warehouse: true, counterparty: true, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, take: 300 }));
}));

receipts.get('/:id', ah(async (req, res) => {
  const rc = await prisma.receipt.findUnique({ where: { id: Number(req.params.id) }, include: { warehouse: true, counterparty: true, items: { include: { product: { include: { barcodes: { where: { isPrimary: true } } } } } } } });
  if (!rc) throw new HttpError(404, 'Документ не найден');
  res.json(rc);
}));

receipts.post('/', ah(async (req, res) => {
  const b = req.body;
  const items = (b.items || []).filter((i) => i.productId && num(i.quantity) > 0);
  if (!b.warehouseId) throw new HttpError(400, 'Выберите склад');
  if (!items.length) throw new HttpError(400, 'Добавьте товары');
  const rc = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, 'receipt_seq', 'П-');
    const total = items.reduce((s, i) => s + num(i.quantity) * num(i.costPrice), 0);
    const rc = await tx.receipt.create({ data: { number, warehouseId: Number(b.warehouseId), counterpartyId: int(b.counterpartyId), note: str(b.note), total, date: b.date ? new Date(b.date) : new Date() } });
    for (const i of items) {
      await tx.receiptItem.create({ data: { receiptId: rc.id, productId: Number(i.productId), quantity: num(i.quantity), costPrice: num(i.costPrice) } });
      await changeStock(tx, { productId: Number(i.productId), warehouseId: rc.warehouseId, quantity: num(i.quantity), type: 'RECEIPT', note: number, receiptId: rc.id });
      if (b.updateCost && num(i.costPrice) > 0) await tx.product.update({ where: { id: Number(i.productId) }, data: { costPrice: num(i.costPrice) } });
    }
    return rc;
  });
  res.status(201).json(rc);
}));

receipts.delete('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const rc = await tx.receipt.findUnique({ where: { id }, include: { items: true } });
    if (!rc) throw new HttpError(404, 'Документ не найден');
    for (const i of rc.items) {
      await changeStock(tx, { productId: i.productId, warehouseId: rc.warehouseId, quantity: -i.quantity, type: 'ADJUST', note: `Отмена прихода ${rc.number}` });
    }
    await tx.receipt.delete({ where: { id } });
  });
  res.json({ ok: true });
}));

module.exports = { stock: r, receipts };
